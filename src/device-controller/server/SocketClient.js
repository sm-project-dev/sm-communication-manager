const _ = require('lodash');

const net = require('net');
const { BU } = require('base-util-jh');

const AbstController = require('../AbstController');

/** @type {Array.<{id: string, instance: SocketClient}>} */
const instanceList = [];
/** Class Socket 접속 클라이언트 클래스 */
class SocketClient extends AbstController {
  /**
   *
   * @param {string} siteUUID 접속 사이트 고유 ID
   */
  constructor(siteUUID) {
    super();
    this.client = null;

    this.configInfo = siteUUID;

    // Socket Destroy 중인 상태
    this.isDestroying = false;

    const foundInstance = _.find(instanceList, instanceInfo =>
      _.isEqual(instanceInfo.id, this.configInfo),
    );

    if (_.isEmpty(foundInstance)) {
      instanceList.push({ id: this.configInfo, instance: this });
    } else {
      return foundInstance.instance;
    }
  }

  /**
   * Socket Client로 메시지 전송
   * @param {Buffer|String} 전송 데이터
   * @return {promise} Promise 반환 객체
   */
  write(msg) {
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

  connect() {}

  /**
   * Socket Server로 접속한 Socket Client를 세팅
   * @param {net.Socket} client
   */
  setPassiveClient(client) {
    // BU.CLI('setPassiveClient', this.configInfo);

    // BU.CLI(this.isDestroying);
    if (this.isDestroying) {
      BU.CLI('기존 접속 종료 중...');
      return false;
    }
    // 기본 Client와의 연결이 존재한다면 해당 연결을 끊음
    if (!_.isEmpty(this.client)) {
      BU.CLI('기존 연결 제거');
      this.isDestroying = true;
      this.client.destroy();

      setImmediate(() => {
        this.isDestroying = false;
        this.setPassiveClient(client);
      });

      // setTimeout(() => {
      //   this.isDestroying = false;
      //   this.setPassiveClient(client);
      // }, 1);
    } else {
      client.on('data', bufferData => {
        this.notifyData(bufferData);
      });

      client.on('close', err => {
        this.client = {};
        this.notifyDisconnect(err);
      });

      client.on('end', () => {
        console.log('Client disconnected');
      });

      client.on('error', error => {
        // BU.CLI(error);
        if (_.has(this.client, 'destroy')) {
          this.client.destroy();
          this.client = {};
        }
        this.notifyError(error);
      });

      this.client = client;
      // 소켓을 붙인다는 것은 연결된것이기에 connect 이벤트 발생
      this.notifyConnect();
    }
  }
}
module.exports = SocketClient;
