const _ = require('lodash');

// create an empty modbus client
const ModRTU = require('modbus-serial');
const { BU } = require('base-util-jh');

const AbstController = require('../AbstController');

/** @type {Array.<{id: string, instance: ModbusRTU}>} */
const instanceList = [];

class ModbusRTU extends AbstController {
  /**
   * Serial Port 객체를 생성하기 위한 설정 정보
   * @param {deviceInfo} mainConfig
   * @param {constructorSerial} connectInfo {port, baud_rate}
   */
  constructor(mainConfig, connectInfo) {
    super(mainConfig);
    this.port = connectInfo.port;
    this.baud_rate = connectInfo.baudRate;

    const foundInstance = _.find(instanceList, { id: this.port });
    if (_.isEmpty(foundInstance)) {
      this.configInfo = { port: this.port, baud_rate: this.baud_rate };
      instanceList.push({ id: this.port, instance: this });
      this.setInit();
    } else {
      return foundInstance.instance;
    }
  }

  /**
   * Serial Device로 메시지 전송
   * @param {modbusReadFormat|modbusFC5|modbusFC15|modbusFC6|writeFC16} modbusData
   * @return {Promise} Promise 반환 객체
   */
  async write(modbusData) {
    // unitId 설정
    try {
      if (_.isEmpty(this.client)) {
        throw new Error('The client did not connect.');
      }

      const { fnCode, unitId, address } = modbusData;
      // BU.CLIS(fnCode, unitId, address);
      // BU.CLINS(this.client);
      await this.client.setID(unitId);

      let resData;
      switch (fnCode) {
        case 1:
          resData = await this.client.readCoils(address, modbusData.dataLength);
          break;
        case 2:
          resData = await this.client.readDiscreteInputs(address, modbusData.dataLength);
          break;
        case 3:
          resData = await this.client.readHoldingRegisters(
            address,
            modbusData.dataLength,
          );
          break;
        case 4:
          resData = await this.client.readInputRegisters(address, modbusData.dataLength);
          break;
        case 5:
          resData = await this.client.writeCoil(address, modbusData.state);
          break;
        case 6:
          resData = await this.client.writeRegister(address, modbusData.value);
          break;
        case 15:
          resData = await this.client.writeCoils(address, modbusData.stateList);
          break;
        case 16:
          resData = await this.client.writeRegisters(address, modbusData.valueList);
          break;
        default:
          break;
      }
      // BU.CLI(resData);
      this.notifyData(resData.data);
      return resData;
    } catch (error) {
      // BU.CLI(error);
      // 포트가 닫혀있는걸 확인 할 경우
      if (error.name === 'PortNotOpenError') {
        this.client = {};
        await this.connect();
      }

      throw error;
    }
  }

  /** 장치 접속 시도 */
  connect() {
    BU.log('Try Connect : ', this.port);
    return new Promise((resolve, reject) => {
      /** 접속 중인 상태라면 접속 시도하지 않음 */
      if (!_.isEmpty(this.client)) {
        reject(new Error(`Already connected. ${this.port}`));
      }

      const client = new ModRTU();

      client
        .connectRTUBuffered(this.port, { baudRate: this.baud_rate })
        .then(() => {
          this.client = client;
          resolve();
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  /**
   * Close Connect
   */
  async disconnect() {
    if (!_.isEmpty(this.client)) {
      this.isManagerDestroy = true;
      this.client.close();
    } else {
      this.notifyDisconnect();
    }
  }
}
module.exports = ModbusRTU;
