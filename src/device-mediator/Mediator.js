const _ = require('lodash');

const AbstMediator = require('./AbstMediator');
const AbstCommander = require('../device-commander/AbstCommander');
const AbstManager = require('../device-manager/AbstManager');

let instance;
class Mediator extends AbstMediator {
  constructor() {
    super();

    if (instance) {
      return instance;
    }
    /** @type {Array.<AbstManager>} */
    this.deviceManagerList = [];
    /** @type {Array.<AbstCommander>} */
    this.deviceCommanderList = [];
    /** @type {Array.<{commander: AbstCommander, manager: AbstManager}>} */
    this.relationList = [];
    instance = this;
  }

  /* Builder에서 요청하는 부분 */
  /**
   * Device Commander 와 Device Manager 간의 관계를 맺음
   * @param {AbstCommander} commander
   * @param {AbstManager} manager
   */
  setColleague(commander, manager) {
    this.setCommander(commander);
    this.setManager(manager);

    this.relationList.push({
      commander,
      manager,
    });
  }

  /**
   * Device Commander를 정의
   * @param {AbstCommander} deviceCommander
   */
  setCommander(deviceCommander) {
    const foundCommander = _.find(this.deviceCommanderList, { id: deviceCommander.id });
    if (_.isEmpty(foundCommander)) {
      deviceCommander.setMediator(this);
      this.deviceCommanderList.push(deviceCommander);
    }
  }

  /**
   * Device Manager를 정의
   * @param {AbstManager} deviceManager
   */
  setManager(deviceManager) {
    const foundManager = _.find(this.deviceManagerList, { id: deviceManager.id });
    if (_.isEmpty(foundManager)) {
      deviceManager.setMediator(this);
      this.deviceManagerList.push(deviceManager);
    }
  }

  /* Commander에서 요청하는 부분 */
  /**
   * 명령 추가
   * @param {commandSet} cmdInfo
   * @return {boolean} 성공 or 실패
   */
  requestAddCommandSet(cmdInfo) {
    const deviceManager = this.getDeviceManager(cmdInfo.commander);
    // BU.CLIN(deviceManager);
    return deviceManager.addCommandSet(cmdInfo);
  }

  /**
   * Commander와 물려있는 Manager를 가져옴
   * @param {AbstCommander} deviceCommander
   * @return {AbstManager}
   */
  getDeviceManager(deviceCommander) {
    // BU.CLIN(deviceCommander)
    const foundIt = _.find(this.relationList, { commander: deviceCommander });
    if (_.isEmpty(foundIt)) {
      throw new Error(`The Commander(${deviceCommander.id}) does not have a device.`);
    }
    return foundIt.manager;
  }

  /**
   * 현재 Commander와 물려있는 장치의 모든 명령을 가져옴
   * @param {AbstCommander} deviceCommander
   * @return {commandStorage} Manager
   */
  getCommandStorage(deviceCommnader) {
    const deviceManager = this.getDeviceManager(deviceCommnader);
    // BU.CLIN(deviceManager, 3);
    return deviceManager.iterator.getAllItem();
  }

  /**
   * 현재 모든 장비에서 진행되고 있는 명령정보를 가져옴.
   * @return {Array.<commandStorage>}
   */
  getAllCommandStorage() {
    const commandStorageList = [];
    /** @type {Array.<AbstManager>} */
    const managerList = _.union(_.map(this.relationList, 'manager'));

    managerList.forEach(manager => {
      const commandStorage = manager.iterator.getAllItem();
      commandStorageList.push(commandStorage);
    });

    return commandStorageList;
  }

  /* Device Manager에서 요청하는 부분  */
  /**
   * Device Manager에서 새로운 이벤트가 발생되었을 경우 알림
   * @param {dcEvent} dcEvent
   */
  updatedDcEventOnDevice(dcEvent) {
    const deviceCommanderList = this.getDeviceCommander(dcEvent.spreader);

    deviceCommanderList.forEach(commander => {
      commander.updatedDcEventOnDevice(dcEvent);
    });
  }

  /**
   * Manager와 물려있는 장치 리스트를 전부 가져옴
   * @param {AbstManager} deviceManager
   * @return {Array.<AbstCommander>}
   */
  getDeviceCommander(deviceManager) {
    const foundIt = _.filter(this.relationList, { manager: deviceManager });
    if (_.isEmpty(foundIt)) {
      throw new Error(
        `The Manager(${deviceManager.deviceController}) does not have a command`,
      );
    }
    const commanderList = _.map(foundIt, 'commander');
    return commanderList;
  }

  /** Manager 에게 요청하는 내용 */
}

module.exports = Mediator;
