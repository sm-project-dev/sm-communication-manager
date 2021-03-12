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
    dccFlagModel: {
      definedCommanderResponse,
      definedCommandSetMessage,
      definedCommandSetRank,
    },
  },
} = require('../src/module').dccFlagModel;

const AbstDeviceClient = require('../src/device-client/AbstDeviceClient');

const Commander = require('../src/device-commander/Commander');

const SerialDeviceController = require('../src/device-controller/serial/Serial');
const SerialDeviceControllerWithParser = require('../src/device-controller/serial/SerialWithParser');
const SocketDeviceController = require('../src/device-controller/socket/Socket');

// console.log(uuidv4());
const Manager = require('../src/device-manager/Manager');

const { initManager } = require('../src/util/dcUtil');

/** @type {deviceInfo} config */
const constructorInfo = {
  target_id: 'test1',
  target_category: 'sub_test1',
  logOption: {
    hasDcMessage: true,
    hasCommanderResponse: true,
    hasTransferCommand: true,
    hasDcError: true,
    hasDcEvent: true,
    hasReceiveData: true,
  },
};

describe('Request Execution Command', function () {
  this.timeout(10000);
  // 1. Builder를 이용하여 Commnader, Mediator, Manager 생성
  // 2. Mnager 객체 생성
  it.skip('Commander Constuction', done => {
    const const1 = _.cloneDeep(constructorInfo);
    const const2 = _.cloneDeep(constructorInfo);

    const1.target_id = '홍길동 1';
    const2.target_id = '홍길동 2';

    const manager = new Manager(const1);
    initManager(manager);
    const commander = new Commander(const1);
    commander.manager = manager;

    done();
  });

  // 1. 수동 명령 생성 (Rank:3, CmdList: 2, timeout:1000)
  // 2. 딜레이 명령(Rank: 2, CmdList: 2, CurrIndex: 1, timeout:1000)
  // 3. 긴급 명령 * 2 (Rank:0, timeout:1000)
  // 시나리오 : 명령 1, 2 추가 후 0.5초 후 명령 3 추가
  // 예상: 1[0] -> 3[0] -> 3[1] -> 2[0] -> 1[1] -> 2[1]
  it('Manual Execution', async () => {
    const commandExecutionTimeoutMs = 100; // 장치에서의 타임아웃 시간은 1초로
    const delayExecutionTimeoutMs = 300; // 지연 시간 3초
    const construct = _.cloneDeep(constructorInfo);
    construct.target_id = '홍길동 1';

    const manager = new Manager(construct);
    initManager(manager);
    const commander = new Commander(construct);
    commander.manager = manager;

    /** @type {commandSet} */
    // 첫번째 명령
    const firstCmd = {
      commandId: 'firstCmd',
      rank: definedCommandSetRank.THIRD,
      cmdList: [
        { data: 'firstCmd_1', commandExecutionTimeoutMs },
        { data: 'firstCmd_2', commandExecutionTimeoutMs },
      ],
    };
    const firstCommandSet = commander.generationManualCommand(firstCmd);

    /** @type {commandSet} */
    const secondCmd = {
      commandId: 'secondCmd',
      rank: definedCommandSetRank.SECOND,
      cmdList: [
        { data: 'secondCmd_1', commandExecutionTimeoutMs },
        { data: 'secondCmd_2', commandExecutionTimeoutMs, delayExecutionTimeoutMs },
      ],
    };
    const secondCommandSet = commander.generationManualCommand(secondCmd);
    /** @type {commandSet} */
    const thirdCmd = {
      commandId: 'thirdCmd',
      rank: definedCommandSetRank.EMERGENCY,
      cmdList: [
        { data: 'thirdCmd_1', commandExecutionTimeoutMs },
        { data: 'thirdCmd_2', commandExecutionTimeoutMs },
      ],
    };
    const thirdCommandSet = commander.generationManualCommand(thirdCmd);

    commander.executeCommand(firstCommandSet);
    commander.executeCommand(secondCommandSet);
    // 1[0]
    expect(commander.manager.iterator.currentCommandSet.commandId).to.eq(
      firstCommandSet.commandId,
    );
    await Promise.delay(commandExecutionTimeoutMs / 2);
    commander.executeCommand(thirdCommandSet);
    await Promise.delay(commandExecutionTimeoutMs / 2);
    // 3[0]
    expect(commander.manager.iterator.currentCommandSet.commandId).to.eq(
      thirdCommandSet.commandId,
    );
    expect(_.isEqual(manager.iterator.currentCommand, _.nth(thirdCmd.cmdList, 0))).to.eq(
      true,
    );
    // 3[1]
    await Promise.delay(commandExecutionTimeoutMs);
    expect(_.isEqual(manager.iterator.currentCommand, _.nth(thirdCmd.cmdList, 1))).to.eq(
      true,
    );
    // 2[0]
    await Promise.delay(commandExecutionTimeoutMs);
    expect(_.isEqual(manager.iterator.currentCommand, _.nth(secondCmd.cmdList, 0))).to.eq(
      true,
    );
    // 1[1]
    await Promise.delay(commandExecutionTimeoutMs);
    expect(_.isEqual(manager.iterator.currentCommand, _.nth(firstCmd.cmdList, 1))).to.eq(
      true,
    );
    // 2[1]
    await Promise.delay(delayExecutionTimeoutMs);
    expect(_.isEqual(manager.iterator.currentCommand, _.nth(secondCmd.cmdList, 1))).to.eq(
      true,
    );

    await Promise.delay(commandExecutionTimeoutMs);
    expect(_.isEmpty(commander.manager.iterator.currentCommandSet)).to.eq(true);
  });

  // 1. 자동명령 생성 수행 테스트(Rank:2, CmdList: 3, timeout:1000)
  // 2. 자동명령 생성 수행 테스트(Rank:2, CmdList: 1, timeout:1000)
  // 3. 명령 수행 filterCommandStorage() 검증 테스트
  it('Automation Execution', async () => {
    const construct = _.cloneDeep(constructorInfo);
    construct.target_id = '홍길동 2';

    const manager = new Manager(construct);
    initManager(manager);
    const commander = new Commander(construct);
    commander.manager = manager;

    /** @type {commandSet} */
    let firstCommandSet = null;
    // 1. 다중 명령일 경우
    const cmdArray = ['one', 'two', 'three'];
    firstCommandSet = commander.generationAutoCommand(cmdArray);
    firstCommandSet.commandId = 'step_1';

    // 명령이 즉시 실행됨
    commander.executeCommand(firstCommandSet);

    // 1[0]
    expect(manager.iterator.currentCommandSet.commandId).to.eq(firstCommandSet.commandId);
    expect(manager.iterator.currentCommand.data).to.eq(_.head(cmdArray));

    await Promise.delay(1000);
    // 1[1]
    expect(manager.iterator.currentCommandSet.commandId).to.eq(firstCommandSet.commandId);
    expect(manager.iterator.currentCommand.data).to.eq(_.nth(cmdArray, 1));
    BU.CLI(manager.iterator.currentCommand);

    // 2. 단일 명령일 경우
    const cmd = Buffer.from([0x30, 0x31]);
    const secondCommandSet = commander.generationAutoCommand(cmd);
    secondCommandSet.commandId = 'step_2';
    commander.executeCommand(secondCommandSet);

    // 3. filterCommandStorage() 검증
    // (1) commander, commandId로 수행
    const foundFirstCommandSet = commander.filterCommandStorage({
      commander,
      commandId: firstCommandSet.commandId,
    });
    expect(foundFirstCommandSet.currentCommandSet).to.eq(firstCommandSet);
    const foundFirstCommandSetStandby = _.head(
      foundFirstCommandSet.standbyCommandSetList,
    );
    expect(foundFirstCommandSetStandby.rank).to.eq(2);
    expect(foundFirstCommandSetStandby.list.length).to.eq(0);
    expect(_.isEmpty(foundFirstCommandSet.delayCommandSetList)).to.eq(true);

    const foundSecondCommandSet = commander.filterCommandStorage({
      commander,
      commandId: secondCommandSet.commandId,
    });
    expect(_.isEmpty(foundSecondCommandSet.currentCommandSet)).to.eq(true);
    const foundSecondCommandSetStandby = _.head(
      foundSecondCommandSet.standbyCommandSetList,
    );
    expect(foundSecondCommandSetStandby.rank).to.eq(2);
    expect(_.head(foundSecondCommandSetStandby.list)).to.eq(secondCommandSet);
    expect(_.isEmpty(foundSecondCommandSet.delayCommandSetList)).to.eq(true);

    // (2) commander
    const foundCommandSet = commander.filterCommandStorage({ commander });
    expect(foundCommandSet.currentCommandSet).to.eq(firstCommandSet);
    const foundCommandSetStandby = _.head(foundCommandSet.standbyCommandSetList);
    expect(foundCommandSetStandby.rank).to.eq(2);
    expect(_.head(foundCommandSetStandby.list)).to.eq(secondCommandSet);

    await Promise.delay(1000);
    // 1[2]
    expect(manager.iterator.currentCommand.data).to.eq(_.nth(cmdArray, 2));

    await Promise.delay(1000);
    // 2[0]
    expect(manager.iterator.currentCommandSet.commandId).to.eq(
      secondCommandSet.commandId,
    );
    expect(manager.iterator.currentCommand.data).to.eq(cmd);

    await Promise.delay(1000);
    BU.CLIN(manager.iterator.currentCommandSet);
    expect(_.isEmpty(manager.iterator.currentCommandSet)).to.eq(true);
  });
});

describe('Handling Receive Data', function () {
  this.timeout(5000);
  // 0. Test Commander, Test Controller를 선언
  // 1. Controller는 timeout/10 딜레이를 가지고 데이터 응답
  // 2. Commander는 즉시 requestTakeAction 메소드를 호출 DONE 처리
  // 3. Manager부터 수신받은 Message Code에 마다 Count 값 증가
  // *** 사용 시나리오는 'Manual Execution' 사용
  // 시나리오 : 명령 1, 2 추가 후 0.5초 후 명령 3 추가 (동작: 1[0] -> 3[0] -> 3[1] -> 2[0] -> 1[1] -> 2[1]  )
  // 예상:
  it.skip('DONE', async () => {
    const commandExecutionTimeoutMs = 100; // 장치에서의 타임아웃 시간은 1초로
    const delayExecutionTimeoutMs = 300; // 지연 시간 3초
    const construct = _.cloneDeep(constructorInfo);
    construct.target_id = '홍길동 DONE';

    const manager = new Manager(construct);
    initManager(manager);

    // 데이터를 쓰면 commandExecutionTimeoutMs/10 으로 응답처리
    manager.deviceController = {
      write: cmd => {
        Promise.delay(commandExecutionTimeoutMs / 10).then(() =>
          manager.onData(`data -> ${cmd}`),
        );
      },
      client: { alive: true },
    };

    const commander = new Commander(construct);
    commander.manager = manager;

    const commandSetMessageCount = {
      COMMANDSET_EXECUTION_START: 0,
      COMMANDSET_EXECUTION_TERMINATE: 0,
      COMMANDSET_DELETE: 0,
      COMMANDSET_MOVE_DELAYSET: 0,
      ONE_AND_ONE_COMUNICATION: 0,
    };
    // Commander가 데이터가 들어오면 바로 DONE 처리 할 경우
    const testCommander = {
      /** @param {dcMessage} dcMessage */
      onDcMessage: dcMessage => {
        switch (dcMessage.msgCode) {
          case definedCommandSetMessage.COMMANDSET_DELETE:
            commandSetMessageCount.COMMANDSET_DELETE++;
            break;
          case definedCommandSetMessage.COMMANDSET_EXECUTION_START:
            commandSetMessageCount.COMMANDSET_EXECUTION_START++;
            break;
          case definedCommandSetMessage.COMMANDSET_EXECUTION_TERMINATE:
            commandSetMessageCount.COMMANDSET_EXECUTION_TERMINATE++;
            break;
          case definedCommandSetMessage.COMMANDSET_MOVE_DELAYSET:
            commandSetMessageCount.COMMANDSET_MOVE_DELAYSET++;
            break;
          case definedCommandSetMessage.ONE_AND_ONE_COMUNICATION:
            commandSetMessageCount.ONE_AND_ONE_COMUNICATION++;
            break;
          default:
            break;
        }
      },
      /** @param {dcData} dcData */
      onDcData: dcData =>
        manager.requestTakeAction(testCommander, definedCommanderResponse.DONE),
    };

    /** @type {commandSet} */
    const firstCmd = {
      commandId: 'firstCmd',
      rank: definedCommandSetRank.THIRD,
      cmdList: [
        { data: 'firstCmd_1', commandExecutionTimeoutMs },
        { data: 'firstCmd_2', commandExecutionTimeoutMs },
      ],
    };
    const firstCommandSet = commander.generationManualCommand(firstCmd);
    firstCommandSet.commander = testCommander;

    /** @type {commandSet} */
    const secondCmd = {
      commandId: 'secondCmd',
      rank: definedCommandSetRank.SECOND,
      cmdList: [
        { data: 'secondCmd_1', commandExecutionTimeoutMs },
        { data: 'secondCmd_2', commandExecutionTimeoutMs, delayExecutionTimeoutMs },
      ],
    };
    const secondCommandSet = commander.generationManualCommand(secondCmd);
    secondCommandSet.commander = testCommander;
    /** @type {commandSet} */
    const thirdCmd = {
      commandId: 'thirdCmd',
      rank: definedCommandSetRank.EMERGENCY,
      cmdList: [
        { data: 'thirdCmd_1', commandExecutionTimeoutMs },
        { data: 'thirdCmd_2', commandExecutionTimeoutMs },
      ],
    };
    const thirdCommandSet = commander.generationManualCommand(thirdCmd);
    thirdCommandSet.commander = testCommander;

    commander.executeCommand(firstCommandSet);
    commander.executeCommand(secondCommandSet);
    commander.executeCommand(thirdCommandSet);

    await Promise.delay(_.sum([commandExecutionTimeoutMs * 10, delayExecutionTimeoutMs]));
    // await Promise.delay(2000);

    expect(commandSetMessageCount.COMMANDSET_EXECUTION_START).to.eq(3);
    expect(commandSetMessageCount.COMMANDSET_DELETE).to.eq(0);
    expect(commandSetMessageCount.COMMANDSET_EXECUTION_TERMINATE).to.eq(3);
    expect(commandSetMessageCount.COMMANDSET_MOVE_DELAYSET).to.eq(1);
    expect(commandSetMessageCount.ONE_AND_ONE_COMUNICATION).to.eq(0);
  });
});

describe('Manage System Error', () => {});

process.on('unhandledRejection', (reason, p) => {
  console.trace('Possibly Unhandled Rejection at: Promise ', p, ' \nreason: ', reason);
  // application specific logging here
});

process.on('uncaughtException', event => {
  console.trace('Possibly uncaughtException Rejection at: Promise ', event);
  // application specific logging here
});
