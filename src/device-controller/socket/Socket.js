const _ = require('lodash');
const net = require('net');

const { BU } = require('base-util-jh');

const AbstController = require('../AbstController');

/** @type {Array.<{id: constructorSocket, instance: Socket}>} */
const instanceList = [];
/** Class Socket 접속 클라이언트 클래스 */
class Socket extends AbstController {
  /**
   * Socket Client 접속 설정 정보
   * @param {deviceInfo} mainConfig
   * @param {constructorSocket} connectInfo Socket Port
   */
  constructor(mainConfig, connectInfo) {
    super(mainConfig);
    const { connId = '', host = 'localhost', port, addConfigInfo } = connectInfo;

    this.port = port;
    this.host = host;
    this.parserInfo = addConfigInfo;
    // 장치 연결 타입
    this.connectorType = net.Socket;

    this.configInfo = { connId, host, port, parserInfo: this.parserInfo };

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
   * Socket Server로 메시지 전송
   * @param {Buffer|String} 전송 데이터
   * @return {promise} Promise 반환 객체
   */
  async write(msg) {
    // BU.CLI(msg);
    if (_.isEmpty(this.client)) {
      return Promise.reject(new Error('The client did not connect.'));
    }

    const res = this.client.write(msg);
    if (res) {
      return Promise.resolve();
    }
    return Promise.reject(res);
  }

  /** 장치 접속 시도 */
  async connect() {
    // BU.log('Try Connect : ', this.port);
    /** 접속 중인 상태라면 접속 시도하지 않음 */
    return new Promise((resolve, reject) => {
      if (!_.isEmpty(this.client)) {
        reject(new Error(`Already connected. ${this.port}`));
      }

      const client = net.createConnection({
        port: this.port,
        host: this.host,
      });

      client.on('data', bufferData => {
        this.notifyData(bufferData);
      });

      client.on('connect', () => {
        this.client = client;
        resolve();
      });

      client.on('close', err => {
        this.client = {};
        this.notifyDisconnect(err);
      });

      client.on('end', () => {
        // console.log('Client disconnected');
      });

      client.on('error', error => {
        reject(error);
        this.notifyError(error);
      });
    });
  }

  /**
   * Close Connect
   */
  async disconnect() {
    if (!_.isEmpty(this.client)) {
      this.isManagerDestroy = 1;
      this.client.destroy();
    } else {
      // this.notifyDisconnect();
    }
  }
}

module.exports = Socket;
