const _ = require('lodash');
const dgram = require('dgram');
const bsplit = require('buffer-split');

const { BU } = require('base-util-jh');

const AbstController = require('../AbstController');

/** @type {Array.<{id: constructorSocket, instance: UDPWithParser}>} */
const instanceList = [];
/** Class Socket 접속 클라이언트 클래스 */
class UDPWithParser extends AbstController {
  /**
   * Socket Client 접속 설정 정보
   * @param {deviceInfo} mainConfig
   * @param {constructorSocket} connectInfo Socket Port
   */
  constructor(mainConfig, connectInfo) {
    super(mainConfig);
    this.port = connectInfo.port;
    this.host = connectInfo.host || 'localhost';
    this.parserInfo = connectInfo.addConfigInfo;

    this.parserInfo.option = Buffer.from(this.parserInfo.option);

    this.configInfo = { host: this.host, port: this.port, parserInfo: this.parserInfo };

    this.message = Buffer.from('');

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
  write(msg) {
    // BU.CLI('write');
    return new Promise((resolve, reject) => {
      this.client.send(msg, 0, msg.length, this.port, this.host, err => {
        if (err) {
          console.log('UDP message send error', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** 장치 접속 시도 */
  connect() {
    // BU.CLI('Try Connect : ', this.port);
    /** 접속 중인 상태라면 접속 시도하지 않음 */
    return new Promise((resolve, reject) => {
      if (!_.isEmpty(this.client)) {
        reject(new Error(`Already connected. ${this.port}`));
      }
      const client = dgram.createSocket('udp4');

      client.send('', 0, 0, this.port, this.host);

      client.on('message', (msg, rinfo) => {
        // console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
        this.message = Buffer.concat([this.message, msg]);

        const splitMessageList = bsplit(this.message, this.parserInfo.option);

        if (splitMessageList.length > 1) {
          this.message = _.last(splitMessageList);
          _.pullAt(
            splitMessageList,
            _.indexOf(splitMessageList, _.last(splitMessageList)),
          );

          splitMessageList.forEach(splitMsg => {
            switch (this.parserInfo.parser) {
              case 'delimiterParser':
                this.notifyData(Buffer.concat([splitMsg, this.parserInfo.option]));
                break;
              case 'readLineParser':
                this.notifyData(splitMsg);
                break;
              default:
                break;
            }
          });
        }
      });

      client.on('listening', () => {
        // BU.CLI('listening');
        this.client = client;
        resolve();
      });

      client.on('close', err => {
        // BU.CLI('close');
        this.client = {};
        this.notifyDisconnect(err);
      });

      client.on('error', error => {
        // BU.CLI('error');
        client.close();
        reject(error);
        this.notifyError(error);
      });
    });
  }

  /**
   * Close Connect
   */
  async disconnect() {
    // BU.CLI('disconnect');
    if (!_.isEmpty(this.client)) {
      this.isManagerDestroy = true;
      this.client.close();
    } else {
      this.notifyDisconnect();
    }
  }
}

module.exports = UDPWithParser;
