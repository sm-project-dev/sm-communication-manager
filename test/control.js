const { expect } = require('chai');
const _ = require('lodash');
const Promise = require('bluebird');
const eventToPromise = require('event-to-promise');
const EventEmitter = require('events');

const { BU, CU } = require('base-util-jh');

const {
  di: {
    dccFlagModel: { definedControlEvent },
  },
} = require('../src/module').dccFlagModel;

const AbstDeviceClient = require('../src/device-client/AbstDeviceClient');
const AbstMediator = require('../src/device-mediator/AbstMediator');
const AbstIterator = require('../src/device-manager/AbstIterator');
const AbstManager = require('../src/device-manager/AbstManager');
const AbstController = require('../src/device-controller/AbstController');

class Receiver extends EventEmitter {
  constructor() {
    super();

    this.data = '';
    this.eventName = '';

    this.connectCount = 0;
    this.disconnectCount = 0;
  }

  onData(data) {
    this.data = data;
    // BU.CLI(data);
  }

  onEvent(eventName, eventMsg) {
    // if(eventName !== definedControlEvent.ERROR){
    BU.CLIS(eventName, eventMsg);
    if (eventName === definedControlEvent.CONNECT) {
      this.connectCount += 1;
    }
    if (eventName === definedControlEvent.DISCONNECT) {
      this.disconnectCount += 1;
    }
    this.eventName = eventName;

    this.emit(eventName);
  }
}

init()
  .then(console.log)
  .catch(e => {
    console.error(e);
    process.exit();
  });

// 1. Controller 객체를 생성하면 자동으로 접속을 수행하는지 테스트
// 2. 연결 객체(client)가 비어져 있을 경우 연결이 안된걸로 판단하고 Disconet 이벤트를 발송 시키는지
// 3. 재접속 타이머가 돌아가고 있는데 client가 살아났을 경우 자동으로 정지하는지
// 4. Error 및 Disconnect가 다수 발생하더라도 실제로 이벤트 발송은 1회만 하는지
// 5. client의 상태(연결, 해제)일 때 외부에서 doConnect()를 호출해도 이상이 없는지
// 6. client가 살아있는데 disconnect, error 이벤트가 수신 될 경우 접속수행 X, 이벤트 발생 X

async function init() {
  BU.CLI('@');
  const receiver = new Receiver();
  const config = {
    controlInfo: {
      hasReconnect: true,
    },
  };
  config.logOption = {
    hasCommanderResponse: true,
    hasTransferCommand: true,
    hasDcError: true,
    hasDcEvent: true,
    hasReceiveData: true,
  };
  const abstController = new AbstController(config);
  abstController.setInit();
  const { connectTimer } = abstController;
  abstController.connectIntervalTime = 1000 * 3; // 재접속 주기 1초로 변경
  // 옵저버 추가
  abstController.attach(receiver);

  /** 1. Controller 객체를 생성하면 자동으로 접속을 수행하는지 테스트 */
  // 장치 접속 타이머가 동작 중인지
  if (!connectTimer.getStateRunning()) {
    throw new Error();
  }

  /** 2. 연결 객체(client)가 비어져 있을 경우 연결이 안된걸로 판단하고 Disconet 이벤트를 발송 시키는지 */
  // connectCount: 0,  disconnectCount: 1
  // await eventToPromise(receiver, definedControlEvent.DISCONNECT);

  if (
    connectTimer.getTimeLeft() > 0 && // 설정된 타이머의 남은 시간은 0ms 이하
    abstController.connectTimer.getTimeLeft() < 500 && // 새로이 설정된 타이머의 시간 설정은 1000ms
    !abstController.connectTimer.getStateRunning() && // 새로이 설정된 타이머는 바로 동작 중
    abstController.requestConnectCount !== 1
  )
    // connect() 요청 1회
    throw new Error();

  // 남아 있는 시간 만큼 대기. 새로이 돌아가고 있음
  await Promise.delay(abstController.connectTimer.getTimeLeft());
  // connectCount: 0,  disconnectCount: 0
  if (receiver.disconnectCount === 0 && abstController.requestConnectCount !== 1)
    throw new Error('disconnectCount !== 0');

  /** 3. 재접속 타이머가 돌아가고 있는데 client가 살아났을 경우 자동으로 정지하는지 */
  // 객체 연결
  abstController.client = {
    alive: true,
  };
  // requestConnectCount: 1, connectCount: 0,  disconnectCount: 0
  await eventToPromise(receiver, definedControlEvent.CONNECT);
  if (abstController.requestConnectCount !== 1) {
    throw new Error(
      `Expected abstController.requestConnectCount === 1, But ${abstController.requestConnectCount}`,
    );
  }
  // requestConnectCount: 1, connectCount: 1,  disconnectCount: 0
  if (receiver.connectCount !== 1) throw new Error('connectCount !== 1');
  // 연결이 수립됐으므로 타이머는 정지
  if (abstController.connectTimer.getStateRunning()) throw new Error('타이머가 도네');

  // 0.5초 기다린 후
  await Promise.delay(500);

  /** 4. Error 및 Disconnect가 다수 발생하더라도 실제로 이벤트 발송은 1회만 하는지 */
  // 연결 객체 제거 및 에러 발생
  abstController.client = {};
  // requestConnectCount: 2, connectCount: 1,  disconnectCount: 0
  abstController.notifyError(new Error(definedControlEvent.DISCONNECT));

  // 타이머 기본 설정 시간 만큼 기다린 후 에러 추가 발생
  // await Promise.delay(abstController.connectIntervalTime);
  abstController.client = {};
  abstController.notifyError(new Error('다른 에러 발생'));
  await Promise.delay(abstController.connectIntervalTime);
  // requestConnectCount: 2, connectCount: 1,  disconnectCount: 1
  // 에러는 여러번 연속해서 발생하더라도 이벤트는 1회만 수신되어야 하므로 2번 예상
  BU.CLI('##################################');
  if (abstController.requestConnectCount !== 2) {
    throw new Error(
      `Expected abstController.requestConnectCount === 2, But ${abstController.requestConnectCount}`,
    );
  }

  /** 5. client의 상태(연결, 해제)일 때 외부에서 doConnect()를 호출해도 이상이 없는지 */
  // client가 죽어있는 상태에서 외부에서 호출할 경우 (타이머는 돌아가고 있음)

  abstController.client = {
    alive: true,
  };
  abstController.doConnect();

  await Promise.delay(abstController.connectIntervalTime);
  // requestConnectCount: 2, connectCount: 1,  disconnectCount: 1
  abstController.doConnect();

  // requestConnectCount: 2, connectCount: 1,  disconnectCount: 0
  await Promise.delay(abstController.connectIntervalTime);
  // client가 존재할 경우 connect() 호출을 하지 않음
  if (abstController.requestConnectCount !== 2) {
    throw new Error(
      `Expected abstController.requestConnectCount === 2, But ${abstController.requestConnectCount}`,
    );
  }

  /** 6. client가 살아있는데 disconnect, error 이벤트가 수신 될 경우 접속수행 X, 이벤트 발생 X */
  abstController.client = {
    alive: true,
  };
  // 연결 객체는 살아있는데 끊어짐 수신받으면 재접속 수행하지 않음
  abstController.notifyDisconnect();
  // requestConnectCount: 2, connectCount: 2,  disconnectCount: 1
  await Promise.delay(abstController.connectIntervalTime);

  if (receiver.disconnectCount !== 1)
    throw new Error(`disconnectCount !== 1, But ${receiver.disconnectCount}`);
  if (abstController.requestConnectCount !== 2) {
    throw new Error(
      `Expected abstController.requestConnectCount  === 2, But ${receiver.requestConnectCount}`,
    );
  }

  // 에러 발생
  abstController.client = {};
  // 1초 딜레이 후 doConnect() 타이머 발생
  abstController.notifyError(new Error('다른 에러 발생'));
  // requestConnectCount: 3, connectCount: 2,  disconnectCount: 2

  // 0.1초 후 연결되었다는 이벤트 발생 --> doConnect 타이머 발생하면 안됨
  await Promise.delay(abstController.connectIntervalTime);

  // 끊어졌다는 이벤트 수신
  if (receiver.connectCount !== 2) {
    throw new Error(`Expected connectCount === 2, But ${receiver.connectCount} `);
  }
  if (receiver.disconnectCount !== 2) {
    throw new Error('disconnectCount !== 2');
  }
  if (abstController.requestConnectCount !== 3) {
    throw new Error(
      `Expected abstController.requestConnectCount === 3, But ${abstController.requestConnectCount}`,
    );
  }
  abstController.client = {
    alive: true,
  };
  abstController.notifyConnect();
  // requestConnectCount: 3, connectCount: 3,  disconnectCount: 2
  // BU.CLIS(abstController.requestConnectCount, receiver.connectCount, receiver.disconnectCount);
  await Promise.delay(abstController.connectIntervalTime);
  if (receiver.connectCount !== 3) {
    throw new Error(`Expected connectCount === 3, But ${receiver.connectCount} `);
  }
  if (receiver.disconnectCount !== 2) {
    throw new Error(`disconnectCount === 2, But ${receiver.disconnectCount}`);
  }
  if (abstController.requestConnectCount !== 3) {
    throw new Error(
      `Expected abstController.requestConnectCount === 3, But ${abstController.requestConnectCount}`,
    );
  }

  BU.CLI('Source Code Is Perfect !!!!!!!!!!!!!!');
  process.exit();

  // await eventToPromise(receiver, definedControlEvent.DISCONNECT);
}
