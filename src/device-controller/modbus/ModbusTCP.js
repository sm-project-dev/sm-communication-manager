const _ = require('lodash');
// create an empty modbus client
const ModRTU = require('modbus-serial');
const { BU } = require('base-util-jh');

const AbstController = require('../AbstController');

/** @type {Array.<{id: string, instance: ModbusTCP}>} */
const instanceList = [];

class ModbusTCP extends AbstController {
  /**
   * Serial Port 객체를 생성하기 위한 설정 정보
   * @param {deviceInfo} mainConfig
   * @param {constructorSocket} connectInfo {port, baud_rate}
   */
  constructor(mainConfig, connectInfo) {
    super(mainConfig);
    this.port = connectInfo.port;
    this.host = connectInfo.host || 'localhost';

    this.configInfo = { host: this.host, port: this.port };

    const foundInstance = _.find(instanceList, instanceInfo =>
      _.isEqual(instanceInfo.id, this.configInfo),
    );

    if (_.isEmpty(foundInstance)) {
      instanceList.push({ id: this.configInfo, instance: this });
      this.setInit();
    } else {
      return foundInstance.instance;
    }
  }

  /**
   * Serial Device로 메시지 전송
   * @param {{FN_CODE: string, unitId: string, params: Object}} mRtuInfo 전송 데이터
   * @return {Promise} Promise 반환 객체
   */
  async write(mRtuInfo) {
    // unitId 설정
    try {
      if (_.isEmpty(this.client)) {
        throw new Error('The client did not connect.');
      }

      // BU.CLI(mRtuInfo);
      await this.client.setID(mRtuInfo.unitId);
      const values = _.values(mRtuInfo.params);
      // BU.CLI(values);
      // fnCode에 해당하드 메소드 호출 및 해당 메소드에 param 적용
      const data = await this.client[mRtuInfo.FN_CODE](...values);
      // const data = await this.client.readInputRegisters(0, 1);
      this.notifyData(data.data);
      return data;
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
        .connectTCP(this.host, { port: this.port })
        .then(() => {
          this.client = client;
          resolve();
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  // /** 장치 접속 시도 */
  // async connect() {
  //   /** 접속 중인 상태라면 접속 시도하지 않음 */
  //   if (!_.isEmpty(this.client)) {
  //     throw new Error(`Already connected. ${this.port}`);
  //   }

  //   const client = new ModRTU();
  //   // const hasErr = await client.connectTCP(this.host, {port: this.port}, hasError => {
  //   client.connectTCP(this.host, { port: this.port }, hasError => {
  //     if (hasError) {
  //       this.client = {};
  //       this.notifyDisconnect(hasError);
  //       this.emit('close');
  //       return;
  //     }
  //     this.emit('connect');
  //   });

  //   await eventToPromise.multi(
  //     this,
  //     ['connect', 'connection', 'open'],
  //     ['close', 'error'],
  //   );
  //   /** @type {ModRTU} */
  //   this.client = client;
  //   return this.client;
  // }

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
module.exports = ModbusTCP;
