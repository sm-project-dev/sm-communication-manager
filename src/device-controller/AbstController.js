const EventEmitter = require('events');
const Promise = require('bluebird');
const _ = require('lodash');

const { BU, CU } = require('base-util-jh');

const { writeLogFile } = require('../util/dcUtil');

const {
  di: {
    dccFlagModel: {
      definedControlEvent: { CONNECT, DISCONNECT },
    },
  },
} = require('../module');

class AbstController extends EventEmitter {
  /**
   * Device Controller 객체를 생성하기 위한 설정 정보
   * @param {deviceInfo} config
   */
  constructor(config) {
    super();
    /** logOption과 controlInfo 정보를 사용하기 위함  */
    this.config = config;
    /** @type {Array.<AbstManager>}  */
    this.observers = [];
    /** children Controller 설정 정보 */
    this.configInfo = null;
    this.client = {};

    this.isInitConnect = true;

    // 초기 상태는 undefined
    this.hasConnect = false;
    this.connectTimer;
    this.connectIntervalTime = 1000 * 60;

    // TEST
    this.requestConnectCount = 0;

    // Controller Type(장치 연결 타입)
    this.connectorType = null;

    // 데이터 받으면 접속 종료 여부
    this.isOnDataClose = _.get(this.config, 'connect_info.hasOnDataClose', true);
    // 시스템 Manager가 연결을 종료하라고 하는 flag

    this.isManagerDestroy = false;

    // 데이터 로거 재접속 수행 여부
    this.isDoReconnect = _.get(this.config, 'controlInfo.hasReconnect', true);
  }

  setInit() {
    this.connectTimer = new CU.Timer(() => this.doConnect(), 10);
  }

  // 장치와의 접속을 시도
  async doConnect() {
    // BU.CLI('doConnect');
    const timer = this.connectTimer;
    // 타이머가 작동중이고 남아있는 시간이 있다면 doConnect가 곧 호출되므로 실행하지 않음
    if (timer.getStateRunning() && timer.getTimeLeft() > 0) {
      // BU.CLI('이미 타이머가 작동 중입니다.');
      return false;
    }
    timer.pause();
    try {
      // BU.CLI('doConnect()', this.configInfo);
      // 장치 접속 관리 객체가 없다면 접속 수행
      if (_.isEmpty(this.client)) {
        writeLogFile(this, 'config.logOption.hasDcEvent', 'event', 'doConnect()');
        await this.connect();

        // BU.CLI('Failed Connect');
        // 장치 연결 요청이 완료됐으나 연결 객체가 없다면 예외 발생
        if (_.isEmpty(this.client)) {
          throw new Error('Try Connect To Device Error');
        }
      }
      // 장치와 접속이 되었다고 알림
      return this.notifyConnect();
    } catch (error) {
      // BU.CLI(error);
      // 장치 접속 요청 실패 이벤트 발생
      // this.notifyDisconnect(error);
      // 새로운 타이머 할당
      if (this.isDoReconnect) {
        this.connectTimer = new CU.Timer(() => {
          _.isEmpty(this.client) ? this.doConnect() : this.notifyConnect();
          // 장치 접속 시도 후 타이머 제거
        }, this.connectIntervalTime);
      }
    }
  }

  /** @return {Promise} 접속 성공시 Resolve, 실패시 Reject  */
  async connect() {
    this.requestConnectCount += 1;
  }

  // TODO 장치와의 연결 접속 해제 필요시 작성
  disconnect() {
    // 클라이언트가 살아있을 경우
    if (!_.isEmpty(this.client)) {
      this.isManagerDestroy = 1;
    }
    // 접속 해제 후
    this.isManagerDestroy = 0;
  }

  /**
   * @param {*} msgInfo 각 장치에 맞는 명령 정보
   * @return {Promise} 전송 성공시 Resolve, 실패시 Reject
   */
  write(msgInfo) {}

  attach(observer) {
    // BU.CLI('Observer attached');
    this.observers.push(observer);
  }

  /** @param {AbstManager} observer */
  dettach(observer) {
    // BU.log('dettach');
    this.observers.forEach((currentItem, index) => {
      if (currentItem === observer) {
        this.observers.splice(index, 1);
      }
    });
  }

  notifyEvent(eventName) {
    // BU.CLI(`notifyEvent ${eventName}`, this.configInfo);
    this.observers.forEach(observer => {
      _.get(observer, 'onEvent') && observer.onEvent(eventName);
    });
  }

  /** 장치와의 연결이 수립되었을 경우 */
  notifyConnect() {
    // BU.CLI('notifyConnect');
    writeLogFile(this, 'config.logOption.hasDcEvent', 'event', 'notifyConnect');

    if (this.hasConnect === false && _.isEmpty(this.client) === false) {
      this.hasConnect = true;
      this.notifyEvent(CONNECT);

      if (!_.isNil(this.connectTimer)) {
        this.connectTimer.getStateRunning() && this.connectTimer.pause();
      }
    }
  }

  /** 장치와의 연결이 해제되었을 경우 */
  notifyDisconnect() {
    // BU.error('notifyDisconnect', this.port);

    // BU.CLIS(
    //   this.isOnDataClose,
    //   this.isManagerDestroy,
    //   this.hasConnect,
    //   _.isEmpty(this.client),
    // );

    const isDisconnect = this.hasConnect === true && _.isEmpty(this.client);
    // 의도된 종료
    if (this.isOnDataClose && this.isManagerDestroy) {
      this.isManagerDestroy = false;
    } else if (this.isInitConnect || isDisconnect) {
      // 첫시도 disable
      this.isInitConnect = false;
      // hasConnect 가 undefined 인 첫시도때는 실행
      // 장치와의 연결이 계속해제된 상태였다면 이벤트를 보내지 않음
      writeLogFile(this, 'config.logOption.hasDcEvent', 'event', 'notifyDisconnect');
      this.hasConnect = false;
      this.notifyEvent(DISCONNECT);

      // 이벤트 발송 및 약간의 장치와의 접속 딜레이를 1초 줌
      // 재접속 옵션이 있을 경우에만 자동 재접속 수행
      if (this.isDoReconnect) {
        Promise.delay(1000).then(() => {
          if (
            // 접속 클라이언트가 비어있고
            _.isEmpty(this.client) &&
            // Timer객체가 생성되어져있는 상태이며
            !_.isNil(this.connectTimer) &&
            // 현재 진행중인 타이머가 없을 경우
            !this.connectTimer.getStateRunning()
          ) {
            this.doConnect();
          }
        });
      }
    }
  }

  /**
   * 장치에서 에러가 발생하였다면
   * @param {Error} error
   */
  notifyError(error) {
    // BU.CLI('notifyError', error);
    writeLogFile(this, 'config.logOption.hasDcEvent', 'event', 'notifyError', error);
    // 장치에서 이미 에러 내역을 발송한 상태라면 이벤트를 보내지 않음
    // this.notifyDisconnect();
  }

  /**
   * @param {*} data 각 controller에서 수신된 데이터
   */
  notifyData(data) {
    // BU.CLI('notifyData', data, this.observers.length);

    // // 데이터 취득 시 종료 옵션 존재 시 장치 접속 해제
    // if (_.get(this.config.controlInfo, 'hasOnDataClose') === true) {
    //   this.disconnect();
    // }

    this.observers.forEach(observer => {
      _.get(observer, 'onData') && observer.onData(data);
    });
  }

  /**
   * @desc zigbee Xbee에서 사용됨.
   * 메시지 전송 실패 시 재 전송을 위해 알려줌
   */
  notifyTransferFail(msg) {
    writeLogFile(this, 'config.logOption.hasReceiveData', 'data', 'onData', msg);

    this.observers.forEach(observer => {
      _.get(observer, 'onTranferFail') && observer.onTranferFail(msg);
    });
  }

  /**
   * 접속한 client를 설정
   * @param {*} client
   */
  setPassiveClient() {}
}

module.exports = AbstController;
