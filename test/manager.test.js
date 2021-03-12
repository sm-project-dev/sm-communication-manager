const { expect } = require('chai');
const _ = require('lodash');
const Promise = require('bluebird');
const eventToPromise = require('event-to-promise');

const { BU, CU } = require('base-util-jh');

global._ = _;
global.BU = BU;
global.CU = CU;

const {
  di: {
    dccFlagModel: { definedCommanderResponse, definedCommandSetRank },
  },
} = require('../src/module').dccFlagModel;

const { EMERGENCY, FIRST, SECOND, THIRD } = definedCommandSetRank;
const { DONE, ERROR, NEXT, RETRY, WAIT } = definedCommanderResponse;
const AbstDeviceClient = require('../src/device-client/AbstDeviceClient');

const SerialDeviceController = require('../src/device-controller/serial/Serial');
const SerialDeviceControllerWithParser = require('../src/device-controller/serial/SerialWithParser');
const SocketDeviceController = require('../src/device-controller/socket/Socket');

// console.log(uuidv4());
const DeviceManager = require('../src/device-manager/Manager');
const ManagerSetter = require('../src/device-manager/ManagerSetter');

const { initManager } = require('../src/util/dcUtil');

function makeManager() {
  const manager = new ManagerSetter();
  manager.setPassiveManager(
    {
      target_id: '',
      connect_info: { type: 'socket' },
      controlInfo: { hasErrorHandling: true },
    },
    BU.GUID(),
  );

  manager.deviceController = {
    write: data => {
      // BU.CLI(data)
    },
    client: { alive: true },
  };

  return manager;
}

describe.only('Device Manager Test', function () {
  this.timeout(20000);

  const commander = {
    /** @param {dcData} dcData */
    onDcData: dcData => BU.CLI(dcData.data),
    /** @param {dcError} dcError */
    onDcError: () => {},
    // onDcError: dcError => BU.CLI(dcError.errorInfo),
    /** @param {dcMessage} dcMessage */
    onDcMessage: dcMessage => () => {},
    // onDcMessage: dcMessage => BU.CLI(dcMessage.commandSet.commandId, dcMessage.msgCode),
    /** @param {dcEvent} dcEvent */
    updatedDcEventOnDevice: dcEvent => BU.CLI(dcEvent.eventName),
  };

  /** @type {commandInfo} */
  const defaultCmdInfo = {
    rank: 1,
    commandId: '',
    controlInfo: {
      hasErrorHandling: false,
    },
    commander,
    cmdList: [],
    currCmdIndex: 0,
  };

  // 명령 추가 및 삭제
  it('Add & Delete CMD Test', done => {
    // BU.CLI('Add & Delete CMD Test');
    const manager = makeManager();
    const cmdInfo = _.cloneDeep(defaultCmdInfo);

    /** @type {commandSet} */

    // [Add] Rank{2} * 3, Rank{3} * 2
    for (let i = 0; i < 5; i += 1) {
      cmdInfo.rank = (i % 2) + 2;
      cmdInfo.commandId = `홍길동${i}`;
      // cmdInfo.commander = null;
      cmdInfo.cmdList = [];
      // CmdList = 2 Length
      for (let j = 0; j < i; j += 1) {
        const addCmdData = {
          data: `i:${i} j:${j}`,
          commandExecutionTimeoutMs: 1000 * 1,
        };
        cmdInfo.cmdList.push(addCmdData);
      }

      // BU.CLI(cmdInfo);
      manager.iterator.addCommandSet(_.cloneDeep(cmdInfo));
    }
    const { standbyCommandSetList } = manager.commandStorage;
    // 명령 추가 결과 테스트 // [Add] Rank{2} * 3, Rank{3} * 2
    const rank2 = _.find(standbyCommandSetList, { rank: 2 });
    // Rank{2} * 3
    expect(rank2.list.length).to.be.eq(3);
    expect(_.head(rank2.list).cmdList.length).to.be.eq(0);
    expect(_.nth(rank2.list, 1).cmdList.length).to.be.eq(2);
    const rank3 = _.find(standbyCommandSetList, { rank: 3 });
    expect(rank3.list.length).to.be.eq(2);
    expect(_.head(rank3.list).cmdList.length).to.be.eq(1);

    // TEST: Iterator 정제 테스트
    // const foundIt = manager.filterCommandStorage({
    //   commandId: '홍길동1',
    //   commander,
    // });

    // BU.CLI(foundIt);

    // const storageArray = manager.iterator.convertStandbyStorageToArray('홍길동0');

    // BU.CLI(storageArray);

    // 삭제 테스트 (Delete 할 경우 멈추었던 명령 흐름이 진행되고 홍길동 0은 cmdList가 없으므로 즉시 완료 처리 됨)
    // [Delete] CurrRank{2}, Rank{2} * 1, Rank{3} * 1
    manager.deleteCommandSet('홍길동1');
    expect(rank3.list.length).to.be.eq(1);

    // [Delete] CurrRank{2}, Rank{2} * 0, Rank{3} * 1
    manager.deleteCommandSet('홍길동4');
    expect(rank2.list.length).to.be.eq(0);

    done();
  });

  // 1. 명령 수행 도중 긴급 명령 추가(긴급 명령 추가에 따른 명령 교체 테스트)
  // 2. 명령 수행 도중 해당 명령 삭제
  // 3. Error Handling 처리
  it('Delete during command execution', async () => {
    const manager = makeManager();
    const cmdInfo = _.cloneDeep(defaultCmdInfo);

    manager.commandStorage.currentCommandSet = {};
    // this.timeout(5000);
    // [Add] Rank{2} * 1, Rank{3} * 1
    for (let i = 0; i < 2; i += 1) {
      cmdInfo.rank = i + 2;
      cmdInfo.commandId = `홍길동${i}`;
      cmdInfo.commander = commander;
      cmdInfo.cmdList = [];
      // CmdList = 2 Length
      for (let j = 0; j < 2; j += 1) {
        const addCmdData = { data: `i:${i} j:${j}` };
        cmdInfo.cmdList.push(addCmdData);
      }
      manager.addCommandSet(_.cloneDeep(cmdInfo));
    }

    /** @type {commandSet} */
    const emergencyCmdInfo = {
      rank: EMERGENCY,
      controlInfo: { hasErrorHandling: true },
      commander,
      commandId: '긴급 홍길동',
      cmdList: [
        {
          data: '긴급 명령 1',
        },
        {
          data: '긴급 명령 2',
        },
      ],
      currCmdIndex: 0,
    };

    // CurrRank{2} CmdIndex 0 수행 중, 0.5초후 긴급 명령 추가
    await Promise.delay(500);
    // [Add] CurrRank{2}, Rank{0} * 1, Rank{2} * 0, Rank{3} * 1
    manager.addCommandSet(emergencyCmdInfo);
    // BU.CLIN(manager.commandStorage, 4);

    // 긴급 명령 목록 가지고옴
    const foundRankEmergency = manager.iterator.convertStandbyStorageToArray(EMERGENCY);
    expect(foundRankEmergency.length).to.be.eq(1);
    // Rank2 목록 가지고 옴. 현재 실행 중이므로 0개
    let foundRank2 = manager.iterator.convertStandbyStorageToArray(SECOND);
    expect(foundRank2.length).to.be.eq(0);

    // 다음 명령 수행 요청 --> CurrIndex로 1 변경 및 명령 위치 이동. 긴급 명령으로 교체
    await manager.requestTakeAction(commander, DONE);

    // 명령 이동이 발생하였으므로 Rank{2} * 1. currIndex 1
    foundRank2 = manager.iterator.convertStandbyStorageToArray(SECOND);
    // BU.CLIN(manager.commandStorage, 4);
    // 수행 명령 2개 중 1개 처리하였으므로 대기열로 이동됨.
    expect(foundRank2.length).to.be.eq(1);
    // 1개가 처리된 상태인지 체크
    expect(_.head(foundRank2).currCmdIndex).to.be.eq(1);

    let currCommandSet = manager.iterator.currentCommandSet;
    // 현재 작업중은 Emergency
    expect(currCommandSet.rank).to.be.eq(EMERGENCY);
    // 긴급 명령 완료 처리
    await manager.requestTakeAction(commander, DONE);
    await manager.requestTakeAction(commander, DONE);

    // BU.CLIN(manager.commandStorage, 3);
    // 리스트에서 Rank 2가 최우선이므로 해당 명령을 끄집어와 CmdList[1] 수행 중
    // Rank 2 완료 처리
    // BU.CLIN(manager.commandStorage, 3);
    currCommandSet = manager.iterator.currentCommandSet;
    expect(currCommandSet.commandId).to.eq('홍길동0');
    expect(currCommandSet.rank).to.be.eq(2);
    expect(currCommandSet.currCmdIndex).to.be.eq(1);
    // 완료 처리 CurrRank{2}, Rank{2} * 0, Rank{3} * 1
    await manager.requestTakeAction(commander, DONE);
    // CurrRank{3}, Rank{2} * 0, Rank{3} * 0

    // BU.CLIN(manager.commandStorage, 4);
    currCommandSet = manager.iterator.currentCommandSet;
    expect(currCommandSet.rank).to.be.eq(3);
    expect(currCommandSet.commandId).to.eq('홍길동1');
    expect(currCommandSet.currCmdIndex).to.be.eq(0);

    // 명령 삭제 요청
    manager.deleteCommandSet(currCommandSet.commandId);

    currCommandSet = manager.iterator.currentCommandSet;
    expect(_.isEqual(currCommandSet, {})).to.be.eq(true);
  });

  // 1. 지연 명령 수행 시 Delay 대기열로 이동
  // 2. Delay 시간 만큼 경과 시 Standby 대기열 선두에 배치되는지 테스트
  // 3. 선두에 배치된 명령이  processingCommandAtCenter()에 의해 다시 재가동 하는지 테스트
  it('Add & Delete Delay Command', async () => {
    // BU.CLI('Add & Delete Delay Command');
    const manager = makeManager();

    const cmdInfo = _.cloneDeep(defaultCmdInfo);

    // [Add] Rank{2} * 1, Rank{3} * 1
    for (let i = 0; i < 2; i += 1) {
      cmdInfo.rank = i + 2;
      cmdInfo.commandId = `홍길동${i}`;
      cmdInfo.commander = commander;
      cmdInfo.cmdList = [];
      // CmdList = 2 Length
      for (let j = 0; j < 2; j += 1) {
        const addCmdData = { data: `i:${i} j:${j}` };
        cmdInfo.cmdList.push(addCmdData);
      }
      manager.addCommandSet(_.cloneDeep(cmdInfo));
      // BU.CLI(cmdInfo);
    }

    // 첫번째 명령부터 지연
    /** @type {commandSet} */
    const delayCmdInfo = {
      rank: SECOND,
      commandId: '지연 홍길동',
      commander,
      cmdList: [
        {
          data: '지연 명령 1',
          delayExecutionTimeoutMs: 1000,
        },
        {
          data: '지연 명령 2',
        },
      ],
      currCmdIndex: 0,
    };

    // Rank 2 CmdList[0] 수행 중, 0.5초후 지연 명령 추가
    await Promise.delay(500).then(() => {
      // 지연 명령이 추가됨
      // [Add] CurrRank{2},  Rank{2} * 1, Rank{3} * 1
      manager.addCommandSet(delayCmdInfo);
    });

    // BU.CLIN(manager.commandStorage, 3);
    const foundRankDelay = manager.iterator.convertStandbyStorageToArray(SECOND);
    expect(foundRankDelay.length).to.be.eq(1);

    // CurrRank CmdIndex 0 완료 처리
    await manager.requestTakeAction(commander, DONE);
    // CurrRank CmdIndex 1 완료 처리
    await manager.requestTakeAction(commander, DONE);

    // Delay Rank 2 명령 교체 후 Rank3 CmdList[0] 수행 중 진행 중
    // BU.CLIN(manager.commandStorage, 3);
    let currCommandSet = manager.iterator.currentCommandSet;
    expect(currCommandSet.commandId).to.eq('홍길동1');
    expect(currCommandSet.currCmdIndex).to.eq(0);
    const { delayCommandSetList } = manager.iterator.aggregate;
    expect(delayCommandSetList).to.length(1);
    expect(_.head(delayCommandSetList).commandQueueReturnTimer.getStateRunning()).to.eq(
      true,
    );

    // CurrRank 완료 처리
    await manager.requestTakeAction(commander, DONE);
    await manager.requestTakeAction(commander, DONE);

    currCommandSet = manager.iterator.currentCommandSet;
    expect(_.isEqual(currCommandSet, {})).to.eq(true);
    // 작업 대기 상태
    expect(manager.hasPerformCommand).to.eq(false);

    // Delay 명령이 수면위로 올라옴
    await Promise.delay(1000);
    currCommandSet = manager.iterator.currentCommandSet;
    expect(currCommandSet.commandId).to.eq('지연 홍길동');
    expect(currCommandSet.currCmdIndex).to.eq(0);
    expect(currCommandSet.delayExecutionTimeoutMs).to.eq(undefined);
    // 작업 대기 상태

    // 지연 명령 완료 처리
    await manager.requestTakeAction(commander, DONE);
    currCommandSet = manager.iterator.currentCommandSet;
    expect(currCommandSet.commandId).to.eq('지연 홍길동');
    expect(currCommandSet.currCmdIndex).to.eq(1);

    // 모든 명령 완료됨.
    await manager.requestTakeAction(commander, DONE);
    currCommandSet = manager.iterator.currentCommandSet;
    expect(_.isEqual(currCommandSet, {})).to.eq(true);
  });

  // 1. 수행 중인 명령 Commander에서 응답 테스트 ['isOk', 'retry']
  // 2. 수행 중인 명령 Commander와 연관이 없는 객체의 응답 테스트
  // 3. 장치 접속 해제 'Disconnect' 발생 시 테스트 [addCommand(), 명렁 처리]
  it.skip('Behavior Operation Status', async () => {
    const manager = makeManager();
  });
});

describe.skip('DeviceController Test', () => {
  it('AbstractDeviceManager', async () => {
    const deviceManager = new DeviceManager();
    deviceManager.createIterator();

    const config = {
      target_id: 'VantagePro_1',
      target_name: 'Davis Vantage Pro2',
      target_category: 'weathercast',
      connect_info: {
        type: 'socket',
        port: 9000,
      },
    };

    let deviceController = {};
    switch (config.connect_type) {
      case 'serial':
        BU.CLI('왓더');
        deviceController = _.has(config, 'parser')
          ? new SerialDeviceControllerWithParser(config)
          : new SerialDeviceController(config);
        break;
      case 'socket':
        deviceController = new SocketDeviceController(config);
        break;
      default:
        break;
    }

    deviceManager.setDeviceController(deviceController);
    deviceManager.deviceController.attach(deviceManager);

    BU.CLI(deviceManager);
    await deviceManager.connect();

    expect(true).to.be.ok;
  });
});

process.on('unhandledRejection', (reason, p) => {
  console.trace('Possibly Unhandled Rejection at: Promise ', p, ' \nreason: ', reason);
  // application specific logging here
});
