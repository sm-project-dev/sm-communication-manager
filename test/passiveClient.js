const _ = require('lodash');
const net = require('net');
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
// const ManagerSetter = require('../src/device-manager/ManagerSetter');

const DCC = require('../index');

let testConnectCount = 0;
let testDisconnectCount = 0;
let receiveDataCount = 0;
const TEST_MSG = Buffer.from([0x02, 0x05, 0x30, 0x30, 0x03]);

class Receiver extends DCC {
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

  /**
   *
   * @param {dcEvent} dcEvent
   */
  updatedDcEventOnDevice(dcEvent) {
    const { eventName, eventMsg } = dcEvent;
    // if(eventName !== definedControlEvent.ERROR){
    // BU.CLIS(eventName, eventMsg);
    if (eventName === definedControlEvent.CONNECT) {
      // BU.debugConsole(5);
      testConnectCount += 1;
      // BU.CLI(testConnectCount);
    }
    if (eventName === definedControlEvent.DISCONNECT) {
      testDisconnectCount += 1;
    }
  }
}

function connectSocketServer(port, index) {
  const client = net.createConnection(port);
  client.on('data', data => {
    // 전송받은 데이터가 지정된 데이터라면
    // BU.CLIS(data, TEST_MSG);
    if (_.isEqual(data, TEST_MSG)) {
      receiveDataCount += 1;

      client.write(TEST_MSG);

      setTimeout(() => {
        client.destroy();
      }, 1000);
    }
  });
}

// 1. Passive Client를 취하는 UserController를 여러개 생성하더라도 Manager가 1개 생성되는지
// 2. User Controller이 Passive Client가 없는 상태에서 명령 요청하였을 경우 예외처리가 잘 되는지
// 3. Passive CLient를 중복으로 Binding 처리할 경우 connect 이벤트가 1회만 발생하고 제대로 Commander에게 전달되는지
// 4. User Controller이 명령을 요청할 경우 전송이 잘 되는지
// 5. Passive CLient가 접속을 끊었을 경우 disconnect이벤트 메시지가 제대로 Commander에게 전달되는지
// 6. Socket Client가 재접속 할 경우 Binding이 잘 처리되야 한다.
async function init() {
  const logOption = {
    hasCommanderResponse: true,
    hasTransferCommand: true,
    hasDcError: true,
    hasDcEvent: true,
    hasReceiveData: true,
  };
  const connectInfo = {
    type: 'socket',
  };
  /** 1. Passive Client를 취하는 UserController를 여러개 생성하더라도 Manager가 1개 생성되는지 */
  /** @type {deviceInfo[]} */
  const userList = [
    {
      target_id: 1,
      logOption,
      connect_info: connectInfo,
      target_name: '1번',
      siteUUID: 'abc',
    },
    {
      target_id: 2,
      logOption,
      connect_info: connectInfo,
      target_name: '1번',
      siteUUID: 'abc',
    },
    {
      target_id: 3,
      logOption,
      connect_info: connectInfo,
      target_name: '1번',
      siteUUID: 'xxx',
    },
  ];
  const dccList = userList.map(userInfo => {
    const dcc = new Receiver();
    dcc.setPassiveClient(userInfo, userInfo.siteUUID);
    return dcc;
  });

  if (!_.isEqual(_.nth(dccList, 0).manager, _.nth(dccList, 1).manager)) {
    throw new Error('The manager is different.');
  }
  if (_.isEqual(_.nth(dccList, 0).manager, _.nth(dccList, 2).manager)) {
    throw new Error('The manager is same.');
  }
  BU.CLI('Step 1 is Clear');

  /** 2. User Controller이 Passive Client가 없는 상태에서 명령 요청하였을 경우 예외처리가 잘 되는지 */
  const selectedIndex = 1;
  const selectedUser = _.nth(dccList, selectedIndex);

  try {
    selectedUser.executeCommand(selectedUser.generationAutoCommand('testMsg'));
    throw new Error('You should not be able to request commands.');
  } catch (error) {
    console.log(error.message);
    if (error.message !== 'The device is not connected.') {
      throw error;
    }
  }
  BU.CLI('Step 2 is Clear');

  /** 3. Passive CLient를 중복으로 Binding 처리할 경우 connect 이벤트가 1회만 발생하고 제대로 Commander에게 전달되는지 */
  const deviceClient = new AbstDeviceClient();
  // Socket Server 구동 시작
  // const socketServerList = [3000, 3001, 3002].map(listenSocketServer);
  const socketServerPort = 3000;
  // Socket Server Listen
  const server = net
    .createServer(socket => {
      // socket.end('goodbye\n');
      console.log(`client is Connected ${socketServerPort}`);

      // Bindindg 처리
      deviceClient.bindingPassiveClient(_.nth(userList, selectedIndex).siteUUID, socket);

      socket.on('data', data => {
        console.log(`P: ${socketServerPort} --> Received Data: ${data} `);
        // return socket.write(`this.is.my.socket\r\ngogogogo${port}`);
      });
    })
    .on('error', err => {
      // handle errors here
      console.error('@@@@', err, server.address());
      // throw err;
    });
  // grab an arbitrary unused port.
  server.listen(socketServerPort, () => {
    console.log('opened server on', socketServerPort);
  });

  server.on('close', () => {
    console.log('close');
  });

  server.on('error', err => {
    console.error(err);
  });

  // Listen 된 Socket Server로 접속 시도.
  connectSocketServer(socketServerPort, 0);
  BU.CLI(testConnectCount);

  // Socket SErver 로 접속한 CLient bindingPassiveClient 처리할 시간을 부여
  await Promise.delay(100);

  if (testConnectCount !== 2) {
    throw new Error(
      `Two connections must be opened. expect: 2, result: ${testConnectCount}`,
    );
  }

  await Promise.delay(500);

  BU.CLI('Step 3 is Clear');

  /** 4. User Controller이 명령을 요청할 경우 전송이 잘 되는지 */
  // 테스트 명령 전송
  selectedUser.executeCommand(selectedUser.generationAutoCommand(TEST_MSG));

  // Socket Client로 전송한 명령을 처리할 시간을 부여
  await Promise.delay(100);
  if (receiveDataCount !== 1) {
    throw new Error(
      `There must be one command transmission.. expect: 1, result: ${receiveDataCount}`,
    );
  }

  BU.CLI('Step 4 is Clear');

  /** 5. Passive CLient가 접속을 끊었을 경우 disconnect이벤트 메시지가 제대로 Commander에게 전달되는지 */
  await Promise.delay(1000);
  if (selectedUser.isConnectedDevice) {
    throw new Error('The client must be disconnected.');
  }

  if (testDisconnectCount !== 2) {
    throw new Error(
      `Two disConnect must be closed. expect: 2, result: ${testConnectCount}`,
    );
  }

  BU.CLI('Step 5 is Clear');
  /** 6. Socket Client가 재접속 할 경우 Binding이 잘 처리되야 한다. */
  connectSocketServer(socketServerPort, 1);
  // Socket SErver 로 접속한 CLient bindingPassiveClient 처리할 시간을 부여
  await Promise.delay(100);

  if (testConnectCount !== 4) {
    throw new Error(
      `Two connections must be opened. expect: 3, result: ${testConnectCount}`,
    );
  }
  BU.CLI('Step 6 is Clear');
}

init();

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.debug);
