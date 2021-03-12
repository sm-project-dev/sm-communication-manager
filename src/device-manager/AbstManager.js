const _ = require('lodash');
const net = require('net');

const { BU } = require('base-util-jh');

const EventEmitter = require('events');

class AbstManager extends EventEmitter {
  constructor() {
    super();
    /** @type {AbstMediator} */
    this.mediator;
    /** @type {AbstController} */
    this.deviceController = null;
    this.id = '';
    /** @type {commandStorage} */
    this.commandStorage = {};

    this.isOnDataClose = false;
  }

  /** 초기화할 내용이 필요할 경우 */
  setInit() {}

  /** 장치와 연결을 하고자 할 경우 */
  async connect() {
    await this.deviceController.connect();

    // await eventToPromise(this, 'dcConnect');
    return true;
  }

  /**
   * Device가 접속되어 있는지 체크
   * @return {boolean}
   */
  get isConnectedDevice() {
    return !_.isEmpty(this.deviceController.client);
  }

  /** DLC에 명령을 요청해도 되는지 여부 */
  get isAliveDLC() {
    // 장치가 붙어있다면 살아있음
    if (this.isConnectedDevice) return true;

    // 장치 데이터 처리 후 접속 종료 옵션이 활성화되어있을 경우
    if (this.isOnDataClose) return true;

    return false;
  }

  /**
   * Device Controller가 Socket Type인지 여부
   */
  get isSocketTypeDC() {
    return this.deviceController.connectorType === net.Socket;
  }

  /**
   * 장치와 연결을 해제하고자 할 경우
   * @return {Promise<boolean>}
   */
  async disconnect() {
    await this.deviceController.disconnect();

    // await eventToPromise(this, 'dcConnect');
    return true;
  }

  /**
   * 장치에 메시지를 보내고자 할 경우
   * @return {Promise}
   */
  transferCommandToDevice() {}

  /**
   * @desc Log 파일 생성 처리 때문에 async/await 사용함.
   * updateData를 통해 전달받은 데이터에 대한 Commander의 응답을 받을 메소드
   * 응답받은 데이터에 문제가 있거나 다른 사유로 명령을 재 전송하고자 할 경우(3회까지 가능)
   * @param {AbstCommander} commander
   * @param {string} commanderResponse
   * @return {Promise<boolean>}
   */
  requestTakeAction(commander, commanderResponse) {}

  /**
   * 명령 추가
   * @param {commandSet} cmdInfo
   * @return {boolean} 명령 추가 성공 or 실패. 연결된 장비의 연결이 끊어진 상태라면 명령 실행 불가
   */
  addCommandSet(cmdInfo) {}

  /**
   * 수행 명령 리스트에 등록된 명령을 취소
   * @param {searchCommandSet} searchCommandSet 명령 취소 정보
   */
  deleteCommandSet(searchCommandSet) {}

  /**
   * Commander와 연결된 Manager에서 Filtering 요건과 충족되는 모든 명령 저장소 가져옴.
   * @param {Object} filterInfo Filtering 정보. 해당 내역이 없다면 Commander와 관련된 전체 명령 추출
   * @param {AbstCommander} filterInfo.commander
   * @param {string=} filterInfo.commandId 명령 ID.
   * @param {number=} filterInfo.rank 명령 Rank
   * @return {commandStorage}
   */
  filterCommandStorage(filterInfo) {}

  /**
   * Device Controller에서 새로운 이벤트가 발생되었을 경우 알림
   * @param {string} eventName 'dcConnect' 연결, 'dcClose' 닫힘, 'dcError' 에러
   */
  onEvent(eventName) {
    // BU.log(`AbstManager --> ${eventName}`);
    // Event 발송부터 처리 (systemErrorList를 처리하기 위함)
    /** @type {dcEvent} */
    const returnDcEvent = {
      eventName,
      spreader: this,
    };

    if (_.get(this, 'mediator.updatedDcEventOnDevice') === undefined) {
      // BU.CLIN(this.mediator);
      process.exit();
    } else {
      this.mediator.updatedDcEventOnDevice(returnDcEvent);
    }

    // BU.CLIN(eventName);
    // BU.CLIN(this.deviceController.client);
    // 연결 해제시 명령 해제 처리
    if (_.isEmpty(this.deviceController.client)) {
      /** @type {dcError} */
      const returnDcError = {
        errorInfo: new Error(eventName),
        spreader: this,
      };
      this.iterator.deleteCommandSet(null, returnDcError);
    }
  }

  /**
   * 장치에서 데이터가 수신되었을 경우 해당 장치의 데이터를 수신할 Commander에게 전송
   * @param {*} data
   */
  onData(data) {
    // BU.CLI('AbstManager --> onDcData', data);
    // BU.CLIN(this.iterator.currentItem);
    const receiver = this.iterator.currentReceiver;
    // BU.CLI(receiver);
    if (receiver === null) {
      BU.log('Not set Responder --> Completed Data', data);
    } else {
      /** @type {dcData} */
      const dcDataInfo = {
        data,
        commandSet: this.iterator.currentCommandSet,
        spreader: this,
      };
      receiver.onDcData(dcDataInfo);
    }
  }

  /**
   * 장치로 데이터 전송은 정상적으로 이루어졌으나 실제적으로 해당 장치로 닿지 못할경우 발생
   * @desc Zigbee XbeeAPI에서 사용됨.
   * @param {*} data
   */
  onTranferFail(data) {}

  // Setter 부분
  /**
   * deviceMediator 을 정의
   * @param {AbstMediator} deviceMediator
   */
  setMediator(deviceMediator) {}

  /** Iterator 정의 */
  createIterator() {}

  /** @param {deviceInfo} config */
  setManager(config) {}

  /**
   *
   * @param {deviceInfo} config
   * @param {string} siteUUID Site 단위 고유 ID
   */
  setPassiveManager(config, siteUUID) {}

  /**
   * setPassiveManager에 접속한 client
   * @param {string} siteUUID Site 단위 고유 ID
   * @param {*} client setPassiveManager에 접속한 클라이언트
   */
  bindingPassiveClient(siteUUID, client) {}
}

module.exports = AbstManager;
