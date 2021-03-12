const AbstDeviceClient = require('./src/device-client/AbstDeviceClient');

module.exports = AbstDeviceClient;

// if __main process
if (require !== undefined && require.main === module) {
  console.log('main');
}
