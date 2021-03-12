const _ = require('lodash');
const Promise = require('bluebird');
// const eventToPromise = require('event-to-promise');

const BU = require('base-util-jh').baseUtil;
const AbstCommander = require('../src/device-commander/AbstCommander');

global._ = _;
global.BU = BU;

// console.log(uuidv4());
const Builder = require('../src/device-builder/Builder');

const config = [];

for (let i = 0; i < 1; i += 1) {
  /** @type {deviceInfo} */
  const addObj = {};
  addObj.target_id = `device_${i}`;
  addObj.connect_type = 'socket';
  // addObj.connect_type = 'serial';
  addObj.host = '';
  addObj.port = Number(`900${i}`);
  // addObj.port = `COM1${3 + i}`;
  addObj.baud_rate = 9600;
  // addObj.parser = {
  //   // type: 'delimiterParser',
  //   // option: Buffer.from('RAIN')
  //   // type: 'byteLengthParser',
  //   // option: 55
  //   // type: 'readLineParser',
  //   // option: '\r\n'
  // };
  config.push(addObj);
}

const builder = new Builder();
let info;

class TestClass {
  constructor() {}

  /**
   * 장치로부터 데이터 수신
   * @param {commandSet} processItem 현재 장비에서 실행되고 있는 명령 객체
   * @param {Buffer} data 명령 수행 결과 데이터
   */
  onDcData(processItem, data) {
    BU.log(data.toString());
    const rainBuffer = data.slice(data.length - 6 - 8, data.length - 6);
    const rain = parseInt(rainBuffer, 16);

    setTimeout(() => {
      if (rain < 100) {
        processItem.requestNextCommand();
      } else {
        processItem.commander.requestRetryCommand();
      }
    }, 1000);
  }

  /**
   * 장치에서 명령을 수행하는 과정에서 생기는 1:1 이벤트
   * @param {dcMessage} dcMessage 현재 장비에서 실행되고 있는 명령 객체
   */
  onDcMessage(dcMessage) {
    BU.CLI('onDcMessage', dcMessage);
  }

  /**
   * Device Controller 변화가 생겨 관련된 전체 Commander에게 뿌리는 Event
   * @param {dcEvent} dcEvent 'dcConnect', 'dcClose', 'dcError'
   */
  updatedDcEventOnDevice(dcEvent) {
    BU.log('updatedDcEventOnDevice\t', dcEvent.eventName);
    this.manager = {};
  }

  /** 장치에서 명령을 수행하는 과정에서 생기는 1:1 이벤트 */
  /**
   * 장치에서 명령을 수행하는 과정에서 생기는 1:1 이벤트
   * @param {dcError} dcError 현재 장비에서 실행되고 있는 명령 객체
   */
  onDcError(dcError) {
    BU.log(`onDcError ${dcError.errorInfo.message}\t`);
    this.manager = {};
  }
}

// Test addDeviceClient
if (false) {
  config.forEach(currentItem => {
    BU.CLI(currentItem);
    const commander = builder.setDeviceClient(currentItem);
    let storageInfo;

    Promise.delay(500).then(() => {
      const testClass = new TestClass();
      BU.CLI('@@@@@@@@@@@@@@@@@@@@');
      // commander.executeCommand(Buffer.from(''), testClass);
      info = commander.executeCommand('hi^^', testClass);
      BU.CLI('resultRequestCmd', info);
      info = commander.executeCommand('Retry Test^^', testClass);
      BU.CLI('resultRequestCmd', info);

      commander.getCommandStatus();
      storageInfo = commander.mediator.getAllCommandStorage();
      BU.CLIN(storageInfo, 5);
      // connet(commander)
      //   .then(() => {

      //     // commander.mediator.getDeviceManager(commander).write();
      //   })
      //   .catch((err) => {
      //     console.error(err);
      //   });
    });
  });
}

// Test addDeviceClientGroup
if (true) {
  const idList = [];
  for (let index = 0; index < 2; index += 1) {
    idList.push(`id_${index}`);
  }

  const commanderList = builder.addDeviceClientGroup(config[0], idList);
  let storageInfo;

  BU.CLIN(commanderList, 2);
  // let resAll = commanderList[0].mediator.getAllCommandStorage();
  // BU.CLIN(resAll, 3);

  Promise.delay(500).then(() => {
    commanderList.forEach(commander => {
      const testClass = new TestClass();
      // BU.CLI('@@@@@@@@@@@@@@@@@@@@');
      // commander.executeCommand(Buffer.from(''), this);
      // BU.CLI(commander.id);
      info = commander.executeCommand('hi^^', testClass);
      // BU.CLI('resultRequestCmd', info);
      info = commander.executeCommand('Retry Test^^', testClass);
      // BU.CLI('resultRequestCmd', info);

      // commander.getCommandStatus();
    });
    storageInfo = commanderList[0].mediator.getAllCommandStorage();
    // BU.CLIN(storageInfo, 5);
    // connet(commander)
    //   .then(() => {

    //     // commander.mediator.getDeviceManager(commander).write();
    //   })
    //   .catch((err) => {
    //     console.error(err);
    //   });
  });
}

// async function connet(commander) {
//   await commander.mediator.getDeviceManager(commander).connect();
//   BU.CLI('Connected');
//   return true;
// }

process.on('uncaughtException', err => {
  // BU.debugConsole();
  console.error(err.stack);
  console.log(err.message);
  console.log('Node NOT Exiting...');
});

process.on('unhandledRejection', err => {
  // BU.debugConsole();
  console.error(err.stack);
  console.log(err.message);
  console.log('Node NOT Exiting...');
});
