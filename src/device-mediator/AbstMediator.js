const AbstCommander = require('../device-commander/AbstCommander');
const AbstController = require('../device-controller/AbstController');
const AbstManager = require('../device-manager/AbstManager');

class AbstMediator {
  /* Builder에서 요청하는 부분 */
  /**
   * Device Commander 와 Device Manager 간의 관계를 맺음
   * @param {AbstCommander} commander
   * @param {AbstManager} manager
   * @return {void}
   */
  setColleague(commander, manager) {}

  /* Commander에서 요청하는 부분 */
  /**
   * 명령 추가
   * @param {commandSet} commandSet
   * @return {boolean} 성공 or 실패
   */
  requestAddCommandSet(commandSet) {}

  /**
   * @param {AbstCommander} deviceCommander
   * @return {AbstManager} Manager
   */
  getDeviceManager(deviceCommander) {}

  /**
   * 현재 Commander와 물려있는 장치의 모든 명령을 가져옴
   * @param {AbstCommander} deviceCommander
   * @return {commandStorage} Manager
   */
  getCommandStorage(deviceCommander) {}

  /**
   * 현재 모든 장비에서 진행되고 있는 명령정보를 가져옴.
   * @return {Array.<commandStorage>}
   */
  getAllCommandStorage() {}

  /* Device Manager에서 요청하는 부분  */
  /**
   * Device Manager에서 새로운 이벤트가 발생되었을 경우 알림
   * @param {dcEvent} dcEvent
   */
  updatedDcEventOnDevice(dcEvent) {}

  // /**
  //  * @param {AbstManager} deviceManager
  //  * @return {Array.<AbstCommander>}
  //  */
  // getDeviceCommander(deviceManager){}
}

module.exports = AbstMediator;
