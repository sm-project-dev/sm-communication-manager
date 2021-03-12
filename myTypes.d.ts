import AbstController from './src/device-controller/AbstController';
import AbstCommander from './src/device-commander/AbstCommander';
import AbstMediator from './src/device-mediator/AbstMediator';
import AbstManager from './src/device-manager/AbstManager';
import Manager from './src/device-manager/Manager';

declare global {
  const AbstController: AbstController;
  const AbstCommander: AbstCommander;
  const AbstMediator: AbstMediator;
  const AbstManager: AbstManager;
  const Manager: Manager;
}
