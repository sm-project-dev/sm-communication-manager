const _ = require('lodash');
const { BU } = require('base-util-jh');

// @param {logObj: Object, path: string, eventType: string, dataTitle: string, data:*=} logInfo

/**
 * @param {Object} logObj 객체
 * @param {string} path logObj에서 true, false를 가져올 경로
 * @param {string} eventType event, data, error
 * @param {string=} dataTitle log event Type
 * @param {*=} data
 * @param {Date=} date
 */
async function writeLogFile(logObj, path, eventType, dataTitle, data, date = new Date()) {
  // BU.CLIS(path, eventType, dataTitle, data, _.get(logObj, path), BU.IsJsonString(data));
  let filePath = BU.convertDateToText(new Date(), '', 2);

  if (_.get(logObj, path)) {
    let id = _.get(logObj, 'id', 'etc');
    if (_.isObject(id)) {
      id = _.get(logObj, 'iterator.currentReceiver.id', '');
    }

    const dataTypes = ['onData', 'W', 'O'];

    if (eventType === 'event') {
      const observerList = _.get(logObj, 'observers', []);
      const idList = _.union(observerList.map(observer => _.get(observer, 'id', '')));
      id = JSON.stringify(idList);
    } else if (_.includes(dataTypes, dataTitle)) {
      const commanderId = _.get(logObj, 'iterator.currentReceiver.id', '');
      filePath = `${id}/${filePath}`;
      id = _.eq(id, commanderId) ? commanderId : `M: ${id}\tC: ${commanderId}`;
    }

    if (data === undefined) {
      BU.appendFile(
        `./log/device-client/${eventType}/${BU.convertDateToText(new Date(), '', 2)}.log`,
        `${id} : ${dataTitle}`,
      );
    } else {
      let realData = '';

      if (Buffer.isBuffer(data)) {
        // // FIXME: Hex 파일 형태로 저장할 경우 보완
        // if(eventType === 'data' && dataTitle === 'onData'){
        //   let bufData = Buffer.concat([Buffer.from(BU.convertDateToText(new Date(), null, 2)), Buffer.from(`${id}>`), data, Buffer.from('<')]);
        //   BU.writeFile(`./log/device-client/${eventType}/${BU.convertDateToText(new Date(), '', 2)}.hex`, bufData);
        // }
        // realData = data.toString('hex');

        // [ or { 로 시작하면 JSON 객체라고 판단
        const isJson =
          data.equals(Buffer.from('5B', 'hex')) || data.equals(Buffer.from('7B', 'hex'));

        realData = data.toString();

        if (eventType === 'data' && dataTitle === 'onData' && isJson) {
          if (BU.IsJsonString(realData)) {
            const parseData = JSON.parse(realData);
            if (_.get(parseData, 'data.type') === 'Buffer') {
              parseData.data = Buffer.from(parseData.data).toString();
              realData = JSON.stringify(parseData);
            }
          }
        } else {
          realData = data.toString('hex');
        }
      } else if (data instanceof Error) {
        realData = data.message;
      } else if (Buffer.isBuffer(_.get(data, 'data'))) {
        // xbee
        realData = _.clone(data);
        realData.data = realData.data.toString();
        realData = JSON.stringify(realData);
      } else if (_.isObject(data)) {
        // if(_.get(realData, 'data.type') === 'Buffer') {}
        realData = JSON.stringify(data);
      } else {
        realData = data;
      }
      const isWrite = await BU.appendFile(
        `./log/device-client/${eventType}/${filePath}.log`,
        `${id} : ${dataTitle} > ${realData}`,
        date,
      );

      return isWrite;
    }
  }
}
exports.writeLogFile = writeLogFile;

/**
 *
 * @param {AbstManager} manager
 * @param {*} commander
 */
function initManager(manager, commander) {
  manager.commandStorage = { currentCommandSet: {}, standbyCommandSetList: [] };
  // 반복기 생성
  manager.createIterator();
  // 명령을 받을 객체 생성
  manager.deviceController = {
    write: cmd => {
      if (_.has(cmd, 'data')) {
        // BU.CLI(cmd.data);
      } else {
        // BU.CLI(cmd);
      }
      // BU.CLIN(manager);
      commander && commander.onDcData({ data: `onDcData: ${cmd}` });
    },
    id: { port: 3000 },
  };
  /** @type {deviceInfo} */
  manager.config = {};
  manager.config.logOption = {
    hasCommanderResponse: true,
    hasTransferCommand: true,
    hasDcError: true,
    hasDcEvent: true,
    hasReceiveData: true,
  };

  // 장치 연결자 생성
  manager.deviceController.client = { alive: true };
  // 작업중인 상태 X
  manager.hasPerformCommand = false;
}
exports.initManager = initManager;

/**
 * @return {controlInfo}
 */
function getDefaultControlInfo() {
  return {
    hasErrorHandling: false,
    hasOneAndOne: false,
    hasReconnect: false,
    hasOnDataClose: true,
  };
}
exports.getDefaultControlInfo = getDefaultControlInfo;

/**
 * @return {logOption}
 */
function getDefaultLogOption() {
  return {
    hasCommanderResponse: false,
    hasDcError: false,
    hasDcEvent: false,
    hasDcMessage: false,
    hasReceiveData: false,
    hasTransferCommand: false,
  };
}
exports.getDefaultLogOption = getDefaultLogOption;
