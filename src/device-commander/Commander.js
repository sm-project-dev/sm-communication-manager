const _ = require('lodash');
const { BU } = require('base-util-jh');

const AbstCommander = require('./AbstCommander');
const AbstMediator = require('../device-mediator/AbstMediator');
const AbstManager = require('../device-manager/AbstManager');
const AbstDeviceClient = require('../device-client/AbstDeviceClient');

const {
  writeLogFile,
  getDefaultControlInfo,
  getDefaultLogOption,
} = require('../util/dcUtil');

const {
  di: {
    dccFlagModel: {
      definedCommanderResponse,
      definedCommandSetMessage,
      definedCommandSetRank,
      definedControlEvent,
      definedOperationError,
      definedOperationStatus,
    },
  },
} = require('../module');

// 시스템 에러는 2개로 정해둠.
const troubleList = [
  {
    code: 'Disconnect',
    msg: '장치 연결 해제',
  },
];

class Commander extends AbstCommander {
  /** @param {deviceInfo} config */
  constructor(config) {
    super();

    this.config = config;
    this.id = config.target_id;
    this.category = config.target_category || 'etc';
    this.controlInfo = config.controlInfo || getDefaultControlInfo();
    /** Commander를 명령하는 Client 객체 */
    /** @type {AbstDeviceClient} */
    this.user = config.getUser() || null;
    this.logOption = config.logOption || getDefaultLogOption();

    /** 명령 재시도 횟수 설정 */
    this.setRetryChance = _.get(config, 'connect_info.retryChance', 0);

    /** @type {AbstManager} */
    this.manager = {};

    /**
     * 현재 발생되고 있는 시스템 에러 리스트
     * @type {Array.<{deviceError}>}
     * */
    this.systemErrorList = [];
  }

  /** Device Client에서 요청하는 부분 */
  /**
   * @override
   * 장치의 연결이 되어있는지 여부
   */
  get isConnectedDevice() {
    return this.manager.isConnectedDevice;
  }

  /**
   * @override
   * DLC에 명령을 요청해도 되는지 여부
   */
  get isAliveDLC() {
    return this.manager.isAliveDLC;
  }

  /* Mediator에서 Set 함 */
  /**
   * deviceMediator 을 정의
   * @param {AbstMediator} deviceMediator
   * @return {undefined}
   */
  setMediator(deviceMediator) {
    this.mediator = deviceMediator;
  }

  /**
   * 장치로 명령을 내림
   * @param {commandSet} commandSet
   * @return {boolean} 명령 추가 성공 or 실패. 연결된 장비의 연결이 끊어진 상태라면 명령 실행 불가
   */
  executeCommand(commandSet) {
    // 오브젝트가 아니라면 자동으로 생성
    if (_.isObject(commandSet)) {
      const findSetKeyList = [
        'cmdList',
        'commander',
        'commandId',
        'rank',
        'currCmdIndex',
      ];

      const hasTypeCommandSet = _.eq(
        findSetKeyList.length,
        _.chain(commandSet).keys().intersection(findSetKeyList).value().length,
      );
      if (hasTypeCommandSet) {
        return this.manager.addCommandSet(commandSet);
      }
      throw new Error('Please check the command format.');
    } else {
      throw new Error('Please check the command format.');
    }
  }

  /** 재시도 횟수 남아있는지 확인 */
  isRetryExecute() {
    return this.manager.retryChance > 0;
  }

  /**
   * 장치를 제어하는 실제 명령만을 가지고 요청할 경우
   * @param {Buffer|string|Object} cmd 자동완성 기능을 사용할 경우
   */
  generationAutoCommand(cmd) {
    /** @type {commandSet} */
    const commandSetInfo = {
      wrapCmdUUID: null,
      rank: definedCommandSetRank.SECOND,
      commandId: null,
      commandType: null,
      commandName: null,
      currCmdIndex: 0,
      cmdList: [],
      operationStatus: definedOperationStatus.WAIT,
      nodeId: '',
      uuid: '',
      // 자동 생성
      commander: this,
      controlInfo: this.controlInfo,
    };
    // commandSet.hasErrorHandling = this.hasErrorHandling;

    // 배열일 경우
    if (Array.isArray(cmd)) {
      cmd.forEach(c => {
        commandSetInfo.cmdList.push({
          data: c,
          commandExecutionTimeoutMs: 1000,
        });
      });
    } else if (cmd === undefined || cmd === null || cmd === '') {
      // 아무런 명령도 내리지 않음.
      commandSetInfo.cmdList = [];
    } else {
      commandSetInfo.cmdList.push({
        data: cmd,
        commandExecutionTimeoutMs: 1000,
      });
    }

    // BU.CLI(commandSet);
    return commandSetInfo;
  }

  /**
   * 명령 제어에 필요한 항목을 작성할 경우 사용
   * @param {requestCommandSet} requestCommandSet 자동완성 기능을 사용할 경우
   */
  generationManualCommand(requestCommandSet) {
    /** @type {commandSet} */
    const commandSetInfo = this.generationAutoCommand();

    _.forEach(requestCommandSet, (cmd, key) => {
      if (_.has(commandSetInfo, key)) {
        commandSetInfo[key] = cmd;
      } else {
        throw new Error(`The requested key does not exist:${key}`);
      }
    });

    commandSetInfo.cmdList = requestCommandSet.cmdList;
    // _.forEach(commandSetInfo.cmdList, cmdInfo => {
    //   if(_.has(cmdInfo, 'data') &&  _.has(cmdInfo, 'commandExecutionTimeoutMs')){
    //     commandInfo.cmdList.push(cmdInfo);
    //   } else {
    //     throw new Error('commandSetInfo 형식이 맞지 않습니다.');
    //   }
    // });

    // 자동 생성
    commandSetInfo.operationStatus = definedOperationStatus.WAIT;
    commandSetInfo.commander = this;
    return commandSetInfo;
  }

  /**
   * Commander와 연결된 Manager에서 Filtering 요건과 충족되는 모든 명령 저장소 가져옴.
   * @param {Object} filterInfo Filtering 정보. 해당 내역이 없다면 Commander와 관련된 전체 명령 추출
   * @param {string=} filterInfo.commandId 명령 ID.
   * @param {number=} filterInfo.rank 명령 Rank
   * @return {commandStorage}
   */
  filterCommandStorage(filterInfo) {
    _.set(filterInfo, 'commander', this);
    return this.manager.filterCommandStorage(filterInfo);
  }

  /**
   * 수행 명령 리스트에 등록된 명령을 취소
   * @param {searchCommandSet} searchCommandSet 명령 취소 정보
   */
  deleteCommandSet(searchCommandSet) {
    return this.manager.deleteCommandSet(searchCommandSet);
  }

  /**
   * @desc Log 파일 생성 처리 때문에 async/await 사용함.
   * Manager에게 Msg를 보내어 명령 진행 의사 결정을 취함
   * @param {string} key 요청 key
   * @param {*=} receiveData 요청 받은 데이터
   */
  async requestTakeAction(key, receiveData) {
    if (_.has(definedCommanderResponse, key)) {
      await this.manager.requestTakeAction(this, key, receiveData);
    } else {
      throw new Error(`${key} is not a valid control command.`);
    }
  }

  /* Device Controller에서 수신 --> 장치에서 일괄 이벤트 발생 */
  /**
   * Device Controller 변화가 생겨 관련된 전체 Commander에게 뿌리는 Event
   * @param {dcEvent} dcEvent 'dcConnect', 'dcClose', 'dcError'
   */
  updatedDcEventOnDevice(dcEvent) {
    switch (dcEvent.eventName) {
      case definedControlEvent.CONNECT:
        this.onSystemError('Disconnect', false);
        break;
      case definedControlEvent.DISCONNECT:
        this.onSystemError('Disconnect', true);
        break;
      default:
        break;
    }

    return this.user && this.user.updatedDcEventOnDevice(dcEvent);
  }

  /**
   * 실제 장치에서 보내온 Error 처리. Trouble Case Model List로 공통 처리
   * @param {string} troubleCode Trouble Code
   * @param {Boolean} hasOccur 발생 or 해결
   * @return {Object}
   */
  onSystemError(troubleCode, hasOccur) {
    // BU.CLIS(this.systemErrorList, troubleCode, hasOccur, msg);
    if (troubleCode === undefined) {
      this.systemErrorList = [];
      return this.systemErrorList;
    }
    const troubleObj = _.find(troubleList, {
      code: troubleCode,
    });
    if (_.isEmpty(troubleObj)) {
      throw ReferenceError(`There is no such trouble message.${troubleCode}`);
    }

    const findObj = _.find(this.systemErrorList, {
      code: troubleCode,
    });
    // 에러가 발생하였고 systemErrorList에 없다면 삽입
    if (hasOccur && _.isEmpty(findObj)) {
      troubleObj.occur_date = new Date();
      this.systemErrorList.push(troubleObj);
    } else if (!hasOccur && !_.isEmpty(findObj)) {
      // 에러 해제하였고 해당 에러가 존재한다면 삭제
      this.systemErrorList = _.reject(
        this.systemErrorList,
        systemError => systemError.code === troubleCode,
      );
    }
    return this.systemErrorList;
  }

  /** Device Manager에서 Event 발생 */

  /**
   * 장치에서 명령을 수행하는 과정에서 생기는 1:1 이벤트
   * @param {dcError} dcError 현재 장비에서 실행되고 있는 명령 객체
   */
  onDcError(dcError) {
    // BU.CLIN(dcError );
    writeLogFile(
      this,
      'config.logOption.hasDcError',
      'error',
      _.get(dcError.errorInfo, 'message'),
      // _.get(dcError.errorInfo, 'stack'),
    );

    return this.user && this.user.onDcError(dcError);
  }

  /**
   * 장치에서 명령을 수행하는 과정에서 생기는 1:1 이벤트
   * @param {dcMessage} dcMessage 현재 장비에서 실행되고 있는 명령 객체
   */
  onDcMessage(dcMessage) {
    // BU.CLI(dcMessage);
    writeLogFile(
      this,
      'config.logOption.hasDcMessage',
      'message',
      dcMessage.msgCode,
      `commandId: ${_.get(dcMessage.commandSet, 'commandId')}`,
    );
    return this.user && this.user.onDcMessage(dcMessage);
  }

  /**
   * 장치로부터 데이터 수신
   * @param {dcData} dcData 현재 장비에서 실행되고 있는 명령 객체
   */
  onDcData(dcData) {
    return this.user && this.user.onDcData(dcData);
  }
}

module.exports = Commander;
