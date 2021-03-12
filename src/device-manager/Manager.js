const _ = require('lodash');

const { BU } = require('base-util-jh');

const AbstManager = require('./AbstManager');

const CmdIterator = require('./AbstIterator');

const { writeLogFile } = require('../util/dcUtil');

const {
  di: {
    dccFlagModel: {
      definedCommanderResponse,
      definedCommandSetMessage,
      definedOperationStatus,
    },
  },
} = require('../module');

const Timeout = setTimeout(function () {}, 0).constructor;

/** @class DeviceManager */
class Manager extends AbstManager {
  constructor() {
    super();

    this.operationTimer;
    /** @type {CmdIterator} */
    this.iterator;
  }

  /** Commander로부터 요청 */
  /**
   * @desc Log 파일 생성 처리 때문에 async/await 사용함. FIXME: 비동기 갱신 에러 때문에 다시 삭제
   * updateData를 통해 전달받은 데이터에 대한 Commander의 응답을 받을 메소드
   * 응답받은 데이터에 문제가 있거나 다른 사유로 명령을 재 전송하고자 할 경우(3회까지 가능)
   * @param {AbstCommander} commander
   * @param {string} commanderResponse
   */
  requestTakeAction(commander, commanderResponse) {
    // BU.CLI('requestTakeAction', commanderResponse);
    const { currentCommandSet } = this.iterator;
    const { DONE, ERROR, NEXT, RETRY, WAIT } = definedCommanderResponse;

    // WAIT 일 경우 처리 하지 않고 지정된 내용이 아니라면 처리하지 않음.
    if (!_.includes([DONE, NEXT, RETRY, ERROR], commanderResponse)) return false;

    // ID가 존재하지 않을 경우 -> 순차 처리 일 경우 , 응답 결과가 Done 일 경우
    if (
      (!_.has(this.id, 'id') || _.eq(commanderResponse, DONE)) &&
      _.get(this, 'currentData.data')
    ) {
      writeLogFile(
        this,
        'config.logOption.hasReceiveData',
        'data',
        'onData',
        _.get(this, 'currentData.data'),
      );

      // 데이터를 기록한 후 수신 데이터 초기화
      _.set(this, 'currentData.data', undefined);
    }

    if (_.isEmpty(currentCommandSet)) {
      writeLogFile(
        this,
        'config.logOption.hasDcError',
        'error',
        `No commands are currently in progress.${commanderResponse}`,
        _.get(commander, 'id'),
      );
      return false;
    }

    // 현재 진행중인 명령 객체와 일치해야지만 가능
    if (_.isEqual(currentCommandSet.commander, commander)) {
      // 재전송 요청일 경우에는 여기서 로그 남기지 않음
      if (_.includes([DONE, ERROR, NEXT, WAIT], commanderResponse)) {
        writeLogFile(
          this,
          'config.logOption.hasCommanderResponse',
          'data',
          'O',
          commanderResponse,
        );
      }

      // 타이머가 붙어있다면 타이머 해제
      currentCommandSet.commandExecutionTimer instanceof Timeout &&
        clearTimeout(currentCommandSet.commandExecutionTimer);

      switch (commanderResponse) {
        // 정상적으로 파싱 성공
        case DONE:
          // BU.CLI('DONE');
          this.updateOperationStatus(definedOperationStatus.RECEIVE_DATA_DONE);
          this.manageProcessingCommand();
          break;
        // 데이터의 수신은 이루어졌으나 더 많은 데이터가 필요하니 기달려라
        // case WAIT:
        //   // BU.CLI('WAIT');
        //   this.updateOperationStatus(definedOperationStatus.RECEIVE_WAIT_MORE_DATA);
        //   break;
        // 다음 명령을 수행해라 (강제)
        case NEXT:
          // BU.CLI('NEXT');
          this.updateOperationStatus(definedOperationStatus.RECEIVE_NEXT_FORCE);
          this.manageProcessingCommand();
          break;
        // 명령을 재전송 해달라
        case RETRY:
          this.retryRequestProcessingCommand();
          break;
        // 현재 명령 삭제 처리
        case ERROR:
          this.iterator.deleteCurrentCommandSet();
          break;
        default:
          break;
      }
    } else {
      throw new Error('It does not match the commander of the current command.');
    }
  }

  /**
   * @param {commandSet} commandSet
   * @return {boolean} 명령 추가 성공 or 실패. 연결된 장비의 연결이 끊어진 상태라면 명령 실행 불가
   */
  addCommandSet(commandSet) {
    // BU.CLI('addCommandSet');
    // BU.CLIN(commandSet, 1);
    // DeviceController 의 client가 빈 객체라면 연결이 해제된걸로 판단
    if (this.isAliveDLC === false) {
      throw new Error('The device is not connected.');
    }
    this.iterator.addCommandSet(commandSet);
    // 작업 중이 아니거나 현재 아무런 명령이 존재하지 않는다면 다음 명령 수행 요청
    if (!this.hasPerformCommand || _.isEmpty(this.iterator.currentCommandSet)) {
      this.manageProcessingCommand();
    }
  }

  /**
   * 수행 명령 리스트에 등록된 명령을 취소
   * @param {searchCommandSet} searchCommandSet 명령 취소 정보
   */
  deleteCommandSet(searchCommandSet) {
    this.iterator.deleteCommandSet(searchCommandSet);
    this.manageProcessingCommand();
  }

  /**
   * Commander와 연결된 Manager에서 Filtering 요건과 충족되는 모든 명령 저장소 가져옴.
   * @param {Object} filterInfo Filtering 정보. 해당 내역이 없다면 Commander와 관련된 전체 명령 추출
   * @param {AbstCommander} filterInfo.commander
   * @param {string=} filterInfo.commandId 명령 ID.
   * @param {number=} filterInfo.rank 명령 Rank
   * @return {commandStorage}
   */
  filterCommandStorage(filterInfo) {
    return this.iterator.filterCommandStorage(filterInfo);
  }

  /** AbstManager Implement */
  /**
   * 장치에서 데이터가 수신되었을 경우 해당 장치의 데이터를 수신할 Commander에게 전송
   * @param {Buffer} data
   */
  async onData(data) {
    // BU.CLI('onData', data);
    this.currentData = {
      data,
      date: new Date(),
    };
    // 데이터 수신이 이루어지고 해당 데이터에 대한 Commander의 응답을 기다리는 중
    this.updateOperationStatus(definedOperationStatus.RECEIVE_WAIT_PROCESSING_DATA);

    const receiver = this.iterator.currentReceiver;

    // 수신 Commander가 없을 경우 처리하지 않음
    if (receiver === null) {
      // BU.CLI('Not set Responder --> Completed Data', data);
    } else {
      // Socket 통신이고 데이터가 Object 형태라면 변환하여 반환
      if (this.isSocketTypeDC) {
        if (Buffer.isBuffer(data)) {
          const firstBuf = data.slice(0, 1);

          // [ or { 로 시작하면 JSON 객체라고 판단
          const isJson =
            firstBuf.equals(Buffer.from('5B', 'hex')) ||
            firstBuf.equals(Buffer.from('7B', 'hex'));

          if (isJson) {
            const jsonData = BU.toJson(data);

            _.forEach(jsonData, (v, k) => {
              if (_.get(v, 'type') === 'Buffer') {
                jsonData[k] = Buffer.from(v);
              }
            });
            data = jsonData;
          }
        }
      }

      /** @type {dcData} */
      const returnValue = {
        data,
        commandSet: this.iterator.currentCommandSet,
        spreader: this,
      };
      receiver.onDcData(returnValue);
    }
  }

  /**
   * 장치로 데이터 전송은 정상적으로 이루어졌으나 실제적으로 해당 장치로 닿지 못할경우 발생
   * @desc Zigbee XbeeAPI에서 사용됨.
   * @param {*} data
   * FIXME: 상황에 따라 재시도를 결정하고자 할 경우 컨트롤 변수 추가 및 제어 로직 변경 필요
   */
  onTranferFail(data) {
    // 현재 전송중인 Commander가 존재한다면 재전송
    if (this.iterator.currentReceiver) {
      // 전송 실패로 받은 데이터를 현재 데이터로 정의
      this.currentData = {
        data,
        date: new Date(),
      };
      // 재전송 요청
      this.requestTakeAction(
        this.iterator.currentReceiver,
        definedCommanderResponse.RETRY,
      );
    }
  }

  /** 명령 관리 제어 메소드 */
  /**
   * @private
   * 실제로 연결된 장치에 명령을 요청하는 메소드
   * 명령의 전송 가능 여부 체크는 requestProcessingCommand() 메소드에서 수행하므로 별도로 체크하지 않음
   * 명령 전송 실패 에러가 발생할 경우 requestProcessingCommand()로 이동
   */
  async transferCommandToDevice() {
    // 타이머가 동작 중이라면 이전 명령 타이머 해제
    if (this.operationTimer instanceof Timeout) {
      clearTimeout(this.operationTimer);
    }

    // 현재 명령 객체와 그 Commander
    const { currentCommandSet, currentCommand } = this.iterator;

    // 명령 전송을 기다림
    this.updateOperationStatus(definedOperationStatus.REQUEST_CMD);

    // BU.CLI('transferCommandToDevice', currentCommand.data);
    writeLogFile(
      this,
      'config.logOption.hasTransferCommand',
      'data',
      'W',
      currentCommand.data,
    );

    // BU.CLI('transferCommandToDevice', currentCommand.data);
    let currentMsg = currentCommand.data;
    // Socket 통신이고 데이터가 Json 형태라면 Buffer로 변환. TEST 코드에 사용됨.
    if (
      this.isSocketTypeDC &&
      !Buffer.isBuffer(currentCommand.data) &&
      typeof currentCommand.data === 'object'
    ) {
      currentMsg = JSON.stringify(currentMsg);
    }

    let isWriteFailed;
    // 전송 요청은 1초안에 이루어져야 함
    const transferTimer = setTimeout(() => {
      // 전송 요청에 성공하였다면 아래의 행동을 취하지 않음. setTimeout과 write 메소드간의 시간 차 때문에 생기는 현상 해결을 위한 조치
      if (isWriteFailed === 0) return false;
      isWriteFailed = 1;

      this.updateOperationStatus(definedOperationStatus.E_TIMEOUT);
      return this.manageProcessingCommand();
    }, currentCommand.commandExecutionTimeoutMs || 1000);

    // 장치 연결은 되어있지 않으나 controlInfo.hasOnDataClose flag가 활성화될 경우
    if (this.isConnectedDevice === false && this.isAliveDLC) {
      await this.deviceController.connect();
      this.deviceController.notifyConnect();
    }

    await this.deviceController.write(currentMsg);

    // 이미 에러처리를 하였다면 실행하지 않음
    if (isWriteFailed === 1) {
      return false;
    }

    isWriteFailed = 0;
    // 전송 요청 해제
    clearTimeout(transferTimer);

    // 정해진 시간안에 명령 완료 체크 타이머 구동
    currentCommandSet.commandExecutionTimer = setTimeout(() => {
      let error;
      switch (currentCommandSet.operationStatus) {
        case definedOperationStatus.REQUEST_CMD:
        case definedOperationStatus.RECEIVE_WAIT_DATA:
          this.updateOperationStatus(definedOperationStatus.E_TIMEOUT);
          break;
        case definedOperationStatus.RECEIVE_WAIT_PROCESSING_DATA:
          this.updateOperationStatus(definedOperationStatus.E_UNHANDLING_DATA);
          break;
        case definedOperationStatus.RECEIVE_WAIT_MORE_DATA:
          this.updateOperationStatus(definedOperationStatus.E_DATA_PART);
          break;
        default:
          error = new Error(currentCommandSet.operationStatus);
          this.updateOperationStatus(definedOperationStatus.E_UNEXPECTED);
          break;
      }
      return this.manageProcessingCommand(error);
    }, currentCommand.commandExecutionTimeoutMs || 1000);
    this.operationTimer = currentCommandSet.commandExecutionTimer;

    // 명령 전송이 성공하였으므로 데이터 수신 상태로 변경
    this.updateOperationStatus(definedOperationStatus.RECEIVE_WAIT_DATA);
  }

  /**
   * @private 현재 명령의 상태에 따라 명령 처리
   * 1. Disconnected Device
   * 2. Non Command
   * 3. Transfer Command To Device
   * 4. Unexpected Exception
   * @param {number=} retryChance 데이터가 있다면 재 설정. 아니라면 초기 설정
   */
  async requestProcessingCommand(retryChance) {
    try {
      const { currentCommand } = this.iterator;

      // 재시도 횟수가 명시되지 않을 경우 첫 시도라고 판단하고 설정
      if (retryChance === undefined) {
        this.retryChance = _.get(this.iterator.currentReceiver, 'setRetryChance', 0);
      }

      // DeviceController 의 client가 빈 객체라면 연결이 해제된걸로 판단
      // TODO:
      // if (_.isEmpty(this.deviceController.client)) {
      //   this.updateOperationStatus(definedOperationStatus.E_DISCONNECTED_DEVICE);
      //   return this.manageProcessingCommand();
      // }
      if (currentCommand === null) {
        // 현재 진행 할 명령이 없다면 중앙 명령 처리에 보고
        this.updateOperationStatus(definedOperationStatus.E_NON_CMD);
        return this.manageProcessingCommand();
      }
      // 명령 수행에 대기 시간이 존재한다면 해당 시간만큼 setTimer 가동 시킨 후 대기열로 이동
      if (currentCommand.delayExecutionTimeoutMs) {
        this.updateOperationStatus(definedOperationStatus.PROCESSING_DELEAY_COMMAND);
        return this.manageProcessingCommand();
      }
      await this.transferCommandToDevice();
    } catch (error) {
      // 장치로 명령을 요청하는 중에 예기치 못한 에러가 발생하였을 경우
      this.updateOperationStatus(definedOperationStatus.E_UNEXPECTED);
      return this.manageProcessingCommand(error);
    }
  }

  /** @private 명령 재전송 처리 */
  async retryRequestProcessingCommand() {
    // let id = _.get(this, 'id', '');
    // const commanderId = _.get(this, 'iterator.currentReceiver.id', '');
    // id = `M: ${id}\tC: ${commanderId}`;
    // BU.CLI('retryWrite', `${id}: this.retryChance`);
    // BU.CLI(this.retryChance);
    this.retryChance -= 1;
    if (this.retryChance >= 0) {
      // 0.01 초 지연 시간을 두지 않음
      writeLogFile(
        this,
        'config.logOption.hasCommanderResponse',
        'data',
        'O',
        definedCommanderResponse.RETRY,
      );
      // await Promise.delay(100);
      this.requestProcessingCommand(this.retryChance);
    } else if (this.retryChance < 0) {
      // 3번 재도전 실패시 다음 명령 수행
      this.updateOperationStatus(definedOperationStatus.E_RETRY_MAX);
      return this.manageProcessingCommand();
    }
  }

  /**
   * @private 현재 명령을 수행하는 과정에서 생기는 제어 상태 변경 처리
   * @param {operationStatus} operationStatus
   */
  async updateOperationStatus(operationStatus) {
    const { currentCommandSet } = this.iterator;
    // BU.CLIS(currentCommandSet.operationStatus, operationStatus);

    // 진행 중인 명령이 없거나 명령 삭제 일 경우에는 업데이트 제외
    if (
      _.isEmpty(currentCommandSet) ||
      currentCommandSet.operationStatus ===
        definedOperationStatus.PROCESSING_DELETE_COMMAND
    ) {
      return false;
    }
    // BU.CLI('updateOperationStatus', operationStatus);
    currentCommandSet.operationStatus = operationStatus;
  }

  /**
   * @param {string} message
   * @param {Error=} messageError
   * @param {{commandSetInfo: commandSet, receiver: AbstCommander}=} commandStorage
   */
  sendMessageToCommander(message, messageError, commandStorage = {}) {
    let { commandSetInfo, receiver } = commandStorage;
    if (_.isEmpty(commandStorage)) {
      const { currentCommandSet, currentReceiver } = this.iterator;
      commandSetInfo = currentCommandSet;
      receiver = currentReceiver;
    }

    // 완료 목록(명령 완료, 명령 삭제)
    const completeMsgList = [
      definedCommandSetMessage.COMMANDSET_DELETE,
      definedCommandSetMessage.COMMANDSET_EXECUTION_TERMINATE,
    ];

    const hasTerminate = _.includes(completeMsgList, message);

    if (hasTerminate && _.isEqual(commandSetInfo, this.lastestCommandSet)) {
      return false;
    }
    /** @type {dcMessage} */
    const dcMessageFormat = {
      commandSet: commandSetInfo,
      msgCode: message,
      msgError: messageError || undefined,
      spreader: this,
    };

    // 마지막으로 보낸 CommandSet을 기억
    if (hasTerminate) {
      this.lastestCommandSet = commandSetInfo;
    }

    // BU.CLIN(currentReceiver);
    receiver && receiver.onDcMessage(dcMessageFormat);
  }

  /**
   * @protected
   * 명령 집합을 총 관리 감독하는 메소드.
   * 명령을 수행하는 과정에서 발생하는 이벤트 처리 담당.
   * 명령 처리 순서 관리 감독.
   * 메소드가 호출되면 에러상태가 아닐 경우 다음 명령으로 진행함.
   * @param {Error} error 에러
   */
  manageProcessingCommand(error) {
    // BU.CLIN(error);

    const { currentCommandSet, currentReceiver } = this.iterator;
    // BU.CLIN(this.commandStorage, 4);
    const { operationStatus } = currentCommandSet;
    // BU.CLI(operationStatus);
    // 현재 명령이 수행 중일 경우 (currentCommandSet이 설정 되어 있음)
    if (this.hasPerformCommand) {
      // 명령 집합의 Operation Status에 따른 분기
      /** @type {dcError} */
      const dcErrorFormat = {
        commandSet: currentCommandSet,
        spreader: this,
      };

      let hasError = false;
      switch (operationStatus) {
        case definedOperationStatus.WAIT: // Wait
          break;
        case definedOperationStatus.WAIT_ERROR_HANDLING: // WAIT_ERROR_HANDLING
          // BU.CLI('WAIT_ERROR_HANDLING');
          return false;
        case definedOperationStatus.REQUEST_CMD: // 명령을 요청중이라면 진행 X
        case definedOperationStatus.RECEIVE_WAIT_DATA: // 데이터 수신을 기다리는 중이라면 진행 X
        case definedOperationStatus.RECEIVE_WAIT_PROCESSING_DATA: // 데이터 수신이 이루어지고 처리를 기다리는 중이라면 진행 X
        case definedOperationStatus.RECEIVE_WAIT_MORE_DATA: // 더 많은 데이터 수신을 기다리는 중이라면 진행 X
          return false;
        case definedOperationStatus.RECEIVE_DATA_DONE: // 데이터 처리 완료
          // BU.CLI('RECEIVE_DATA_DONE');
          break;
        case definedOperationStatus.RECEIVE_NEXT_FORCE: // 강제 진행
          // BU.CLI('RECEIVE_NEXT_FORCE');
          break;
        case definedOperationStatus.PROCESSING_DELEAY_COMMAND: // 현재 명령이 Delay가 필요하다면 명령 교체
          this.sendMessageToCommander(definedCommandSetMessage.COMMANDSET_MOVE_DELAYSET);
          this.iterator.moveToReservedCmdList();
          break;
        case definedOperationStatus.PROCESSING_DELETE_COMMAND: // Delete
          // error 값이 있다면 에러. 아니라면 의도적인 삭제
          this.iterator.clearCurrentCommandSet();
          break;
        case definedOperationStatus.E_DISCONNECTED_DEVICE:
          hasError = true;
          dcErrorFormat.errorInfo = new Error(
            definedOperationStatus.E_DISCONNECTED_DEVICE,
          );
          break;
        case definedOperationStatus.E_TIMEOUT:
          hasError = true;
          dcErrorFormat.errorInfo = new Error(definedOperationStatus.E_TIMEOUT);
          break;
        case definedOperationStatus.E_DATA_PART:
          hasError = true;
          dcErrorFormat.errorInfo = new Error(definedOperationStatus.E_DATA_PART);
          break;
        case definedOperationStatus.E_UNHANDLING_DATA:
          hasError = true;
          dcErrorFormat.errorInfo = new Error(definedOperationStatus.E_UNHANDLING_DATA);
          break;
        case definedOperationStatus.E_INCORRECT_DATA:
          hasError = true;
          dcErrorFormat.errorInfo = new Error(definedOperationStatus.E_INCORRECT_DATA);
          break;
        case definedOperationStatus.E_RETRY_MAX:
          hasError = true;
          dcErrorFormat.errorInfo = new Error(definedOperationStatus.E_RETRY_MAX);
          break;
        case definedOperationStatus.E_UNEXPECTED:
          hasError = true;
          dcErrorFormat.errorInfo = _.isError(error)
            ? error
            : new Error(definedOperationStatus.E_UNEXPECTED);
          break;
        case definedOperationStatus.E_NON_CMD: // NOTE 현재 수행 명령이 없는 경우는 의도적인 것으로 판단하고 별다른 처리하지 않음
          break;
        default:
          break;
      }

      // 에러가 있고 수신자가 있다면 메시지를 보냄
      // hasError && currentReceiver && currentReceiver.onDcError(dcErrorFormat);
      // NOTE 에러가 있다면 다음 명령은 처리 하지 않음
      if (hasError) {
        // BU.CLI(dcErrorFormat.errorInfo);
        // 에러 핸들링을 필요로 한다면 시스템 대기
        if (_.get(currentCommandSet.controlInfo, 'hasErrorHandling') === true) {
          // BU.CLIN('hasErrorHandling', dcErrorFormat.errorInfo);
          // 에러 핸들링 상태로 변경
          this.updateOperationStatus(definedOperationStatus.WAIT_ERROR_HANDLING);
          // 에러 메시지 전송
          currentReceiver && currentReceiver.onDcError(dcErrorFormat);
          return false;
        }
        // 에러 메시지 전송
        currentReceiver && currentReceiver.onDcError(dcErrorFormat);
      }

      // BU.CLI(this.commandStorage)
      // 진행 중인 명령이 모두 수행되었을 경우
      if (this.iterator.isDone()) {
        const skipOperationStatus = [definedOperationStatus.PROCESSING_DELETE_COMMAND];
        // Skip 요청 상태가 아니고 현재 명령 집합의 모든 명령을 수행했다면 발송
        if (!skipOperationStatus.includes(operationStatus)) {
          // BU.CLI('TERMINATE 메시지  발송 요청', _.get(currentCommandSet, 'nodeId'));
          this.sendMessageToCommander(
            definedCommandSetMessage.COMMANDSET_EXECUTION_TERMINATE,
          );
        }

        // Operation Status 초기화
        // BU.CLI('진행 중인 명령이 모두 수행');
        this.updateOperationStatus(definedOperationStatus.WAIT);

        // 포커스를 움직이고자 요청 하고 다음 진행할 명령이 존재한다면 바로 수행
        if (
          operationStatus === definedOperationStatus.RECEIVE_NEXT_FORCE &&
          !_.isEmpty(this.iterator.nextCommandSet)
        ) {
          return this.nextCommand();
        }

        // 모든 명령셋 수행 완료 (standbyCommandSetList 안에 있는 명령)
        if (_.isEmpty(this.iterator.nextCommandSet)) {
          // BU.CLI('Complete All Standby CommandList', _.get(currentCommandSet, 'nodeId'));
          // BU.CLIN(this.iterator.currentCommandSet);
          this.iterator.clearCurrentCommandSet();
          this.hasPerformCommand = false;

          // 장치 데이터 다 받았으면 장치와의 접속 종료
          if (this.isOnDataClose) {
            // BU.CLI('완전 종료');
            this.deviceController.disconnect();
          }

          return;
        }
      }
      // 수행할 NextCommandSet이 존재할 경우 명령 수행
      return this.nextCommand();
    }

    // 현재 명령이 진행중이 아니라면
    // 현재 진행중인 명령이 없고
    if (_.isEmpty(this.iterator.currentCommandSet)) {
      // Next CommandSet이 존재한다면
      if (!_.isEmpty(this.iterator.nextCommandSet)) {
        // 명령 수행 중으로 교체
        this.hasPerformCommand = true;
        return this.nextCommand();
      }
    } else {
      // 수행할 명령이 있다고 판단하고 명령 수행 요청
      this.hasPerformCommand = true;
      return this.requestProcessingCommand();
    }
  }

  /**
   * 다음 명령을 수행
   */
  nextCommand() {
    // BU.CLI('nextCommand');
    try {
      // const { currentCommandSet, nextCommandSet } = this.iterator;
      // // 현재 아무런 명령이 존재하지 않을 경우
      // if (_.isEmpty(currentCommandSet)) {
      //   // 명령 집합 이동
      //   this.iterator.changeNextCommandSet(nextCommandSet);

      //   // BU.CLIN(this.iterator.aggregate, 3);
      //   BU.error(this.iterator.currentCommandSet.commandName);

      //   // BU.CLIN(this.iterator.currentCommandSet, 2);
      //   this.sendMessageToCommander(definedCommandSetMessage.COMMANDSET_EXECUTION_START);
      //   // 현재 수행할 명령 요청
      //   return this.requestProcessingCommand();
      // }
      // 다음 명령이 존재할 경우
      this.iterator.changeNextCommand();
      // BU.CLIN(
      //   this.iterator.commandSetStorage.standbyCommandSetList.map(
      //     info => info.list.length,
      //   ),
      // );
      // BU.CLIN(
      //   _.pick(this.iterator.currentCommandSet, [
      //     'commandId',
      //     'commandName',
      //     'rank',
      //     // 'cmdList'
      //   ]),
      //   1,
      // );
      this.sendMessageToCommander(definedCommandSetMessage.COMMANDSET_EXECUTION_START);
      // BU.log(this.iterator.currentCommandSet.commandName);

      return this.requestProcessingCommand();
    } catch (error) {
      BU.CLI(error);
      // 다음 명령이 존재하지 않을 경우
      this.hasPerformCommand = false;
      writeLogFile(
        this,
        'config.logOption.hasDcError',
        'error',
        _.get(error, 'message'),
        this.id,
      );
      this.iterator.clearCurrentCommandSet();
    }
  }
}

module.exports = Manager;
