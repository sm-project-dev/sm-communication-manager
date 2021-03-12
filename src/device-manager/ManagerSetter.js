const _ = require('lodash');
const { BU } = require('base-util-jh');
const Manager = require('./Manager');

const Iterator = require('./Iterator');

const AbstMediator = require('../device-mediator/AbstMediator');
const AbstController = require('../device-controller/AbstController');

// Active Controller
const SerialWithParser = require('../device-controller/serial/SerialWithParser');
const Serial = require('../device-controller/serial/Serial');
const SerialWithXbee = require('../device-controller/zigbee/SerialWithXbee');
const SocketWithParser = require('../device-controller/socket/SocketWithParser');
const Socket = require('../device-controller/socket/Socket');
const UDP = require('../device-controller/udp/UDP');
const UDPWithParser = require('../device-controller/udp/UDPWithParser');
const ModbusRTU = require('../device-controller/modbus/ModbusRTU');
const ModbusTCP = require('../device-controller/modbus/ModbusTCP');

// Passive Controller
const SocketClient = require('../device-controller/server/SocketClient');

// DeviceManager는 DeviceController와 1:1 매칭.
/** @type {{id: *, instance:ManagerSetter}[]} */
const instanceList = [];

class ManagerSetter extends Manager {
  /** Manager를 초기화 처리 */
  /** Builder에서 요청 메소드 */
  /** @param {deviceInfo} config */
  setManager(config = {}) {
    /** @type {AbstController} */
    let deviceController = null;
    let Controller = null;

    let { connect_info: connectInfo = {} } = config;

    connectInfo = BU.IsJsonString(connectInfo) ? JSON.parse(connectInfo) : connectInfo;

    // _.assign(connectInfo, { key: BU.GUID() });
    // 재시도 횟수와 id는 connect_info 객체 식별 요소에서 제외
    this.id = _.omit(connectInfo, ['id', 'retryChance']);
    // this.id = connectInfo;
    // BU.CLI(config);
    switch (connectInfo.type) {
      case 'serial':
        switch (connectInfo.subType) {
          case 'parser':
            Controller = SerialWithParser;
            break;
          default:
            Controller = Serial;
            break;
        }
        break;
      case 'zigbee':
        switch (connectInfo.subType) {
          case 'xbee':
            Controller = SerialWithXbee;
            break;
          default:
            break;
        }
        break;
      case 'socket':
        switch (connectInfo.subType) {
          case 'parser':
            Controller = SocketWithParser;
            break;
          default:
            Controller = Socket;
            break;
        }
        break;
      case 'udp':
        switch (connectInfo.subType) {
          case 'parser':
            Controller = UDPWithParser;
            break;
          default:
            Controller = UDP;
            break;
        }
        break;
      case 'modbus':
        switch (connectInfo.subType) {
          case 'rtu':
            Controller = ModbusRTU;
            break;
          case 'tcp':
            Controller = ModbusTCP;
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }

    if (_.isNull(Controller)) {
      // BU.CLI(connectInfo);
      throw new Error('There is no such device.');
    } else {
      deviceController = new Controller(config, connectInfo);
    }

    // 해당 장치가 이미 존재하는지 체크
    const foundInstance = _.find(instanceList, instanceInfo =>
      _.isEqual(instanceInfo.id, this.id),
    );

    // 장치가 존재하지 않는다면 instanceList에 삽입하고 deviceController에 등록
    if (_.isEmpty(foundInstance)) {
      // observer 등록
      deviceController.attach(this);
      this.config = config;
      // AbstManager로 끌어올림
      this.isOnDataClose = config.controlInfo.hasOnDataClose;

      this.hasPerformCommand = false;
      // Manager에 Device 등록
      /** @type {AbstController} */
      this.deviceController = deviceController;
      // BU.CLI('@@@@@@@@@@@', this.id);
      // 신규 정의시 instanceList에 저장
      instanceList.push({
        id: this.id,
        instance: this,
      });
      this.retryChance = 0; // 데이터 유효성 검사 재시도 횟수(ProcessCmd 재전송). 기본 0회
      /**
       * @type {commandStorage}
       */
      this.commandStorage = {};

      this.createIterator();

      return this;
    }
    // singleton pattern
    return foundInstance.instance;
  }

  /**
   *
   * @param {deviceInfo} config
   * @param {string} siteUUID
   */
  setPassiveManager(config = {}, siteUUID) {
    /** @type {AbstController} */
    let deviceController = null;
    let Controller = null;

    const { connect_info: connectInfo = {} } = config;

    // BU.CLI(config);
    switch (connectInfo.type) {
      case 'socket':
        switch (connectInfo.subType) {
          default:
            Controller = SocketClient;
            break;
        }
        break;
      default:
        Controller = SocketClient;
        break;
    }

    if (_.isNull(Controller)) {
      throw new Error('There is no such device.');
    } else {
      deviceController = new Controller(siteUUID);
    }

    // Controller의 접속 정보를 ID로 함
    this.id = siteUUID;
    // 해당 매니저가 이미 존재하는지 체크
    const foundInstance = _.find(instanceList, instanceInfo =>
      _.isEqual(instanceInfo.id, this.id),
    );
    if (_.isEmpty(foundInstance)) {
      // observer 등록
      deviceController.attach(this);
      this.config = config;
      this.hasPerformCommand = false;
      // Manager에 Device 등록
      /** @type {AbstController} */
      this.deviceController = deviceController;
      // BU.CLI('@@@@@@@@@@@', this.id);
      // 신규 정의시 instanceList에 저장
      instanceList.push({
        id: this.id,
        instance: this,
      });
      this.retryChance = 0; // 데이터 유효성 검사 재시도 횟수(ProcessCmd 재전송). 기본 0회
      /**
       * @type {commandStorage}
       */
      this.commandStorage = {};

      this.createIterator();

      return this;
    }
    return foundInstance.instance;
  }

  /**
   * deviceMediator 을 정의
   * @param {AbstMediator} deviceMediator
   */
  setMediator(deviceMediator) {
    // BU.CLI(this.id, instanceList.length);
    this.mediator = deviceMediator;
  }

  /** Iterator 정의 */
  createIterator() {
    /** @type {Iterator} */
    this.iterator = new Iterator(this);
  }

  /**
   * setPassiveManager에 접속한 client
   * @param {string} siteUUID Site 단위 고유 ID
   * @param {*} client setPassiveManager에 접속한 클라이언트
   */
  bindingPassiveClient(siteUUID, client) {
    // BU.CLI(siteUUID);
    // 해당 매니저가 이미 존재하는지 체크
    const foundInstance = _.find(instanceList, instanceInfo =>
      _.isEqual(instanceInfo.id, siteUUID),
    );

    // Manager를 설정하기 전 Binding 을 할 경우 예외처리
    if (_.isEmpty(foundInstance)) {
      throw new Error('The manager is not set up.');
    }

    const { instance } = foundInstance;

    // DeviceController에 client가 비워져있을 경우에만 설정
    if (_.isEmpty(_.get(instance, 'deviceController.client', {}))) {
      instance.deviceController.setPassiveClient(client);
    } else {
      // FIXME: 기존의 Connection이 존재하면 해당 접속을 끊고 연결
      instance.deviceController.setPassiveClient(client);
    }
  }
}
module.exports = ManagerSetter;
