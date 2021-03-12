const _ = require('lodash');
const { BU, CU } = require('base-util-jh');

const {
  di: {
    dccFlagModel: { definedOperationStatus, definedCommandSetMessage },
  },
} = require('../module');

const Timeout = setTimeout(function () {}, 0).constructor;

class Iterator {
  /** @param {Manager} deviceManager */
  constructor(deviceManager) {
    this.manager = deviceManager;
    /** @type {commandStorage} */
    this.aggregate = deviceManager.commandStorage;
    this.aggregate.currentCommandSet = {};
    this.aggregate.standbyCommandSetList = [];
    this.aggregate.delayCommandSetList = [];
  }

  /**
   * 현재 진행 중인 명령 객체에 진행 할 명령이 존재하는 지
   * @return {commandInfo} 다음 명령 존재시 : commandInfo, 없을 시: null
   */
  get currentCommand() {
    const { currentCommandSet } = this;
    if (_.isEmpty(currentCommandSet)) {
      return null;
    }
    if (_.has(currentCommandSet, 'currCmdIndex') && _.has(currentCommandSet, 'cmdList')) {
      const cmd = currentCommandSet.cmdList[currentCommandSet.currCmdIndex];
      return cmd === undefined || cmd === '' || _.isEmpty(cmd) ? null : cmd;
    }
    return null;
  }

  /** @return {AbstCommander} */
  get currentReceiver() {
    const currItem = this.currentCommandSet;
    return _.isEmpty(currItem) || _.isEmpty(currItem.commander)
      ? null
      : currItem.commander;
  }

  /** @return {commandSet} */
  get currentCommandSet() {
    return this.aggregate.currentCommandSet;
  }

  /** @return {commandStorage} */
  get commandSetStorage() {
    return this.aggregate;
  }

  /**
   * 현재 진행 중인 명령 객체를 기준으로 다음 수행 명령이 존재하는지 체크
   * @return {commandInfo} 다음 명령 존재시 : commandInfo, 없을 시: null
   */
  get nextCommand() {
    try {
      const { currentCommandSet } = this;

      if (_.isEmpty(currentCommandSet)) {
        return null;
      }
      const nextIndex = currentCommandSet.currCmdIndex + 1;
      const cmd = currentCommandSet.cmdList[nextIndex];
      return cmd === undefined ? null : cmd;
    } catch (error) {
      return null;
    }
  }

  /**
   * 다음 명령 수행 집합 존재 체크
   * @return {commandStorage}
   */
  get nextCommandSet() {
    const foundRankInfo = this.aggregate.standbyCommandSetList.find(
      rankInfo => rankInfo.list.length,
    );

    return foundRankInfo === undefined ? {} : foundRankInfo;
  }

  /**
   * 현재 진행중인 명령 초기화
   * @return {void}
   */
  clearCurrentCommandSet() {
    // BU.CLI('clearCurrentCommandSet');
    if (!_.isEmpty(this.currentCommandSet)) {
      // 에러가 존재하고 받을 대상이 있다면 전송
      this.currentCommandSet.commandExecutionTimer instanceof Timeout &&
        clearTimeout(this.currentCommandSet.commandExecutionTimer);
    }

    this.aggregate.currentCommandSet = {};
  }

  /**
   * @param {commandSet} cmdInfo 추가할 명령
   */
  addCommandSet(cmdInfo) {
    // BU.CLIN(cmdInfo, 1);
    const { rank } = cmdInfo;
    // 명령 rank가 등록되어있지 않다면 신규로 등록
    if (!_.includes(_.map(this.aggregate.standbyCommandSetList, 'rank'), rank)) {
      this.aggregate.standbyCommandSetList.push({ rank, list: [cmdInfo] });
      // rank 순으로 정렬
      this.aggregate.standbyCommandSetList = _.sortBy(
        this.aggregate.standbyCommandSetList,
        'rank',
      );
      // BU.CLIN(this.aggregate.standbyCommandSetList, 1);
    } else {
      // 저장된 rank 객체 배열에 삽입
      const foundRank = _.find(this.aggregate.standbyCommandSetList, { rank });
      foundRank.list.push(cmdInfo);
    }
    // BU.CLIN(this.aggregate, 4);
  }

  /**
   * 수행 명령 리스트에 등록된 명령을 취소
   * @param {searchCommandSet=} searchCommandSet 명령 취소 정보
   * @param {dcError=} dcError
   * @return {void}
   */
  deleteCommandSet(searchCommandSet = null, dcError = null) {
    const isAllDelete = _.isNil(searchCommandSet);
    // BU.CLI('deleteCommandSet 수행', commandId);
    _.forEach(this.aggregate.standbyCommandSetList, item => {
      _.remove(item.list, commandInfo => {
        // BU.CLIN(commandInfo);

        let isDelete = false;

        // 모두 삭제가 아니라면 삭제 인자인지 검증
        if (!isAllDelete && _.isObject(searchCommandSet)) {
          isDelete = true;
          // 검색 조건 목록 순회
          _.forEach(searchCommandSet, (value, key) => {
            // 명령 객체와 일치하지 않는 정보가 있다면 delete false
            if (!_.eq(commandInfo[key], value)) {
              isDelete = false;
            }
          });
        }

        // if (isAllDelete || _.eq(commandId, commandInfo.commandId)) {
        if (isAllDelete || isDelete) {
          this.manager.sendMessageToCommander(
            definedCommandSetMessage.COMMANDSET_DELETE,
            _.get(dcError, 'errorInfo'),
            {
              commandSetInfo: commandInfo,
              receiver: commandInfo.commander,
            },
          );
          return true;
        }
        return false;
      });
    });

    // 지연 명령 대기열에 존재하는 명령 삭제
    _.remove(this.aggregate.delayCommandSetList, commandInfo => {
      // 타이머가 존재한다면 제거

      let isDelete = false;

      // 모두 삭제가 아니라면 삭제 인자인지 검증
      if (!isAllDelete && _.isObject(searchCommandSet)) {
        isDelete = true;
        // 검색 조건 목록 순회
        _.forEach(searchCommandSet, (value, key) => {
          // 명령 객체와 일치하지 않는 정보가 있다면 delete false
          if (!_.eq(commandInfo[key], value)) {
            isDelete = false;
          }
        });
      }

      commandInfo.commandQueueReturnTimer && commandInfo.commandQueueReturnTimer.pause();
      // if (isAllDelete || _.eq(commandId, commandInfo.commandId)) {
      if (isAllDelete || isDelete) {
        this.manager.sendMessageToCommander(
          definedCommandSetMessage.COMMANDSET_DELETE,
          _.get(dcError, 'errorInfo'),
          {
            commandSetInfo: commandInfo,
            receiver: commandInfo.commander,
          },
        );
        return true;
      }
      return false;
    });

    let isDelete = false;

    // 모두 삭제가 아니라면 삭제 인자인지 검증
    if (!isAllDelete && _.isObject(searchCommandSet)) {
      isDelete = true;
      // 검색 조건 목록 순회
      _.forEach(searchCommandSet, (value, key) => {
        // 명령 객체와 일치하지 않는 정보가 있다면 delete false
        if (!_.eq(this.currentCommandSet[key], value)) {
          isDelete = false;
        }
      });
    }

    // 대기 중 명령과 지연 명령의 삭제 처리가 끝난 후 현재 명령 삭제 상태 체크 및 진행
    if (isAllDelete || isDelete) {
      // if (isAllDelete || this.currentCommandSet.commandId === commandId) {
      this.deleteCurrentCommandSet(dcError);
    }
  }

  /**
   * 현재 진행 중인 명령을 삭제 처리
   * 현재 명령을 수행하는 도중 에러가 발생할 경우 실행. 현재 진행중인 명령 초기화하고 다음 명령 수행
   * @param {dcError} dcError
   * @return {void}
   */
  deleteCurrentCommandSet(dcError) {
    // BU.CLI('clearCurrentCommandSet');
    if (!_.isEmpty(this.currentCommandSet)) {
      // 현재 명령이 삭제되었다고 Commander에게 Message를 보냄.
      this.manager.sendMessageToCommander(
        definedCommandSetMessage.COMMANDSET_DELETE,
        _.get(dcError, 'errorInfo'),
        { commandSetInfo: this.currentCommandSet, receiver: this.currentReceiver },
      );

      // 명령 삭제 중으로 상태 변경
      this.manager.updateOperationStatus(
        definedOperationStatus.PROCESSING_DELETE_COMMAND,
      );
      // 명령 상태 점검. hasErrorHandling 값이 true라면 대기, 아니라면 다음 명령 수행
      this.manager.manageProcessingCommand();
    }
  }

  /**
   * Current Process Item의 delayExecutionTimeoutMs 유무를 확인,
   * ReservedCmdList로 이동 및 Current Process Item 삭제
   * delayExecutionTimeoutMs 시간 후 Process Rank List에 shift() 처리하는 함수 바인딩 처리
   */
  moveToReservedCmdList() {
    const { currentCommandSet, currentCommand } = this;

    // delayExecutionTimeoutMs 가 존재 할 경우만 수행
    if (_.isNumber(currentCommand.delayExecutionTimeoutMs)) {
      // 지연 복귀 타이머 설정
      currentCommandSet.commandQueueReturnTimer = new CU.Timer(() => {
        // Delay Time 해제
        delete currentCommand.delayExecutionTimeoutMs;
        // currentCommand.delayExecutionTimeoutMs = null;
        const foundIt = _.remove(this.aggregate.delayCommandSetList, reservedCmdInfo =>
          _.isEqual(reservedCmdInfo, currentCommandSet),
        );
        if (foundIt.length) {
          // delay 가 종료되었으로 해당 Rank의 맨 선두에 배치
          const foundRank = _.find(this.aggregate.standbyCommandSetList, {
            rank: currentCommandSet.rank,
          });
          if (_.isObject(foundRank)) {
            foundRank.list.unshift(_.first(foundIt));
            // 명령 제어 실행 체크 요청
            this.manager.manageProcessingCommand();
          }
        } else {
          BU.CLI('The command has been removed.', currentCommandSet.commandId);
        }
      }, currentCommand.delayExecutionTimeoutMs);
      // 지연 복귀 명령 집합으로 이동
      this.aggregate.delayCommandSetList.push(currentCommandSet);
      // 진행 중인 명령 집합 초기화
      this.aggregate.currentCommandSet = {};
    } else {
      throw new Error(`${currentCommandSet.commandId}Does not have delayMs.`);
    }
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
    // 적절치 못한 인자 값이 있다면 제거
    _.forEach(filterInfo, (v, k) => {
      _.isNil(v) && _.unset(filterInfo, k);
    });

    /** @type {commandStorage} */
    const returnValue = {
      currentCommandSet: {},
      delayCommandSetList: [],
      standbyCommandSetList: [],
    };

    // filter 정보와 현재 수행 명령 객체 정보가 같다면
    if (
      _(filterInfo)
        .map((v, k) => _.isEqual(v, _.get(this.currentCommandSet, k)))
        .every()
    ) {
      returnValue.currentCommandSet = this.currentCommandSet;
    }

    // 대기 집합 확인
    returnValue.standbyCommandSetList = this.aggregate.standbyCommandSetList.map(
      commandStorageInfo => {
        const standbyCommandSet = _.clone(commandStorageInfo);

        standbyCommandSet.list = _.filter(standbyCommandSet.list, commandSet =>
          _(filterInfo)
            .map((v, k) => _.isEqual(v, _.get(commandSet, k)))
            .every(),
        );

        return standbyCommandSet;
      },
    );

    // 지연 집합 확인
    returnValue.delayCommandSetList = _.filter(
      this.aggregate.delayCommandSetList,
      commandSet =>
        _(filterInfo)
          .map((v, k) => _.isEqual(v, _.get(commandSet, k)))
          .every(),
    );

    return returnValue;
  }

  /**
   * standbyCommandSetList에서 검색 조건에 맞는 commandSet 를 돌려줌
   * @param {number|string=} value Number: Rank or String: commandId
   * @return {commandSet[]}
   */
  convertStandbyStorageToArray(value) {
    let returnValue = [];

    // Rank 검색 rank가 숫자고 해당 Rank가 등록되어 있다면 검색 수행
    if (_.isNumber(value)) {
      returnValue = _.chain(this.aggregate.standbyCommandSetList)
        .find({ rank: value })
        .get('list', [])
        .value();
    }

    // commandId 검색
    if (_.isString(value)) {
      _.forEach(this.aggregate.standbyCommandSetList, rankInfo => {
        returnValue = _(rankInfo.list)
          .filter({ commandId: value })
          .concat(returnValue)
          .value();
      });
    }
    return returnValue;
  }

  /**
   * @description 다음 진행 할 명령을 Process에 할당.
   * 다음 명령이 존재할 경우 processIndex 1 증가
   * 긴급 명령이 존재할 경우 process객체 이동 및 긴급 명령으로 교체
   * 다음 명령이 존재하지 않을 경우 getNextRank() 수행
   * getNextRank()가 존재할 경우 명령 객체 교체
   * 현재 진행 중인 명령 리스트 Index 1 증가하고 다음 진행해야할 명령 반환
   * @return {void}
   */
  changeNextCommand() {
    // BU.CLI('changeNextCommand');
    const { currentCommandSet, nextCommandSet } = this;
    // 현재 명령셋이 존재하지 않거나 현재 명령셋의 다음 명령이 존재하지 않다면 명령셋 교체
    if (_.isEmpty(currentCommandSet) || this.nextCommand === null) {
      // BU.CLIN(
      //   _.pick(currentCommandSet, [
      //     'commandId',
      //     'commandName',
      //     'rank',
      //     // 'cmdList'
      //   ]),
      //   1,
      // );
      return this.changeNextCommandSet(nextCommandSet);
    }

    // 다음 명령이 존재할 경우 해당 명령의 Rank보다 우선 순위의 Rank가 있는지 체크하고
    // 존재할 경우 명령 교체 로직 실행

    // 현재 수행 중인 명령 랭크
    const { rank: currentSetRank } = currentCommandSet;

    // BU.log(currentSetRank);

    // 명령 인덱스 증가 (다음 명령 실행을 위함)
    currentCommandSet.currCmdIndex += 1;

    // 현재 진행 중인 명령의 우선 순위보다 높은 명령이 존재하는지 체크
    const highRankCommandSet = this.aggregate.standbyCommandSetList.find(row => {
      return row.list.length && row.rank < currentSetRank;
    });

    // BU.CLIN(highRankCommandSet, 1);

    // 높은 명령이 존재할 경우 기존 명령 standByCommandList의 첫번째 인자로 이동
    if (highRankCommandSet !== undefined) {
      _.find(this.aggregate.standbyCommandSetList, {
        rank: currentSetRank,
      }).list.unshift(currentCommandSet);

      // BU.CLI('명령 교체');
      // 명령 교체
      this.aggregate.currentCommandSet = highRankCommandSet.list.shift();
    }

    return this.aggregate.currentCommandSet;
  }

  /**
   * @param {{rank:number, list: Array.<commandSet>}} standbyCommandSetList
   * @return {void}
   */
  changeNextCommandSet(standbyCommandSetList = this.nextCommandSet) {
    // BU.CLI('changeNextCommandSet');
    // 명령이 존재하지 않을 경우
    if (_.isEmpty(standbyCommandSetList)) {
      this.clearCurrentCommandSet();
      throw new ReferenceError('The following command does not exist.');
    } else {
      // 명령 집합에서 첫번째 목록을 process로 가져오고 해당 배열에서 제거
      this.aggregate.currentCommandSet = standbyCommandSetList.list.shift();
    }
  }

  /**
   * 현재 진행중인 명령이 끝났는지 여부
   * @return {boolean}
   */
  isDone() {
    return !!(this.currentCommand === null || this.nextCommand === null);
  }
}
module.exports = Iterator;
