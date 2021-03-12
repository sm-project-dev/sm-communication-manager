const AbstCommander = require('../device-commander/AbstCommander');
const Commander = require('../device-commander/Commander');

const Mediator = require('../device-mediator/Mediator');

const AbstManager = require('../device-manager/AbstManager');
const Manager = require('../device-manager/Manager');
const ManagerSetter = require('../device-manager/ManagerSetter');

const AbstBuilder = require('./AbstBuilder');

class Builder extends AbstBuilder {
  constructor() {
    super();
    this.mediator = this.setDeviceMediator();
  }

  /**
   * Create 'Commander', 'Manager'
   * @param {deviceInfo} config
   * @return {{deviceCommander: AbstCommander, deviceManager: AbstManager}}
   */
  setDeviceClient(config) {
    const deviceManager = this.setDeviceManager(config);
    const deviceCommander = this.setDeviceCommnader(config);
    deviceCommander.manager = deviceManager;

    this.mediator.setColleague(deviceCommander, deviceManager);

    return { deviceCommander, deviceManager };
  }

  /**
   * Create 'Commander', 'Server'
   * @param {deviceInfo} config
   * @param {string} siteUUID
   * @return {{deviceCommander: AbstCommander, deviceManager: AbstManager}}
   */
  setPassiveClient(config, siteUUID) {
    const deviceManager = this.setPassiveManager(config, siteUUID);
    const deviceCommander = this.setDeviceCommnader(config);
    deviceCommander.manager = deviceManager;

    this.mediator.setColleague(deviceCommander, deviceManager);

    return { deviceCommander, deviceManager };
  }

  // /**
  //  * Create 'Multi Commander', 'Manager'
  //  * @param {deviceInfo} config
  //  * @param {string} idList
  //  * @return {{commanderList: Array.<AbstCommander>, deviceManager: AbstManager}}
  //  */
  // addDeviceClientGroup(config, idList){
  //   try {
  //     const commanderList = [];
  //     let deviceManager = this.setDeviceManager(config);

  //     idList.forEach(id => {
  //       config.target_id = id;
  //       let deviceCommander = this.setDeviceCommnader(config);
  //       this.mediator.setColleague(deviceCommander, deviceManager);

  //       commanderList.push(deviceCommander);
  //     });

  //     return {commanderList, deviceManager};
  //   } catch (error) {
  //     throw error;
  //   }
  // }

  /** @return {AbstMediator} */
  getMediator() {
    return this.mediator;
  }

  /**
   * @param {deviceInfo} config
   * @return {AbstCommander}
   */
  setDeviceCommnader(config) {
    const deviceCommander = new Commander(config);

    return deviceCommander;
  }

  setDeviceMediator() {
    const deviceMediator = new Mediator();

    return deviceMediator;
  }

  /**
   * @param {deviceInfo} config
   * @return {AbstManager}
   */
  setDeviceManager(config) {
    const deviceManager = new ManagerSetter();
    return deviceManager.setManager(config);
    // return deviceManager;
  }

  /**
   * @param {deviceInfo} config
   * @param {string} siteUUID
   * @return {AbstManager}
   */
  setPassiveManager(config, siteUUID) {
    const deviceManager = new ManagerSetter();
    return deviceManager.setPassiveManager(config, siteUUID);
    // return deviceManager;
  }

  // /**
  //  * Create 'Commander'
  //  * @param {deviceInfo} config
  //  * @return {AbstCommander}
  //  */
  // addCommander(config){
  //   // try {
  //   //   let deviceCommander = this.setDeviceCommnader(config);
  //   //   let deviceManager = this.setDeviceManager(config);

  //   //   this.mediator.setColleague(deviceCommander, deviceManager);
  //   // } catch (error) {
  //   //   throw error;
  //   // }
  // }

  // /**
  //  * Create 'Manager'
  //  * @param {deviceInfo} config
  //  * @return {AbstManager}
  //  */
  // addManager(){

  // }
}

module.exports = Builder;
