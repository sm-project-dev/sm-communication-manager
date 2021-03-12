const _ = require('lodash');
const net = require('net');
const split = require('split');

const { BU } = require('base-util-jh');

const AbstController = require('../AbstController');

/** @type {Array.<{id: constructorSocket, instance: SocketWithParser}>} */
const instanceList = [];
/** Class Socket 접속 클라이언트 클래스 */
class SocketWithParser extends AbstController {
  /**
   * Socket Client 접속 설정 정보
   * @param {deviceInfo} mainConfig
   * @param {constructorSocketWithParser} connectInfo Socket Port
   */
  constructor(mainConfig, connectInfo) {
    super(mainConfig);
    const { connId = '', host = 'localhost', port, addConfigInfo } = connectInfo;
    this.port = port;
    this.host = host;
    this.parserInfo = addConfigInfo;

    // 누적 데이터 추적을 위한 버퍼
    this.data = Buffer.alloc(0);
    // 누적 데이터 추적 폐기를 위한 타이머
    this.setTimer = null;
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
   * Parser Pipe 를 붙임
   * @param {net.Socket} client SerialPort Client
   */
  settingParser(client) {
    // BU.CLI('settingParser', this.parserInfo);
    if (this.parserInfo !== undefined && this.parserInfo.parser !== undefined) {
      let stream = null;
      let parserOption = this.parserInfo.option;
      switch (this.parserInfo.parser) {
        case 'delimiterParser':
          parserOption = Buffer.from(parserOption).toString();
          stream = client.pipe(split(parserOption));
          stream.on('data', data => {
            data += parserOption;
            this.notifyData(data);
          });
          break;
        case 'readLineParser':
          parserOption = Buffer.from(parserOption).toString();
          stream = client.pipe(split(parserOption));
          stream.on('data', data => {
            this.notifyData(data);
          });
          break;
        // FIXME: 임시로 해둠. stream 기능 사용해야함.
        case 'byteLengthParser':
          // this.inStrem = new Readable({
          //   read(size) {
          //     // 데이터 요구가 있고... 누군가 이것을 읽고자 함
          //   },
          // });

          // this.inoutStream = new Duplex({
          //   write(chunk, encoding, callback) {
          //     console.log(chunk.toString());
          //     callback();
          //   },

          //   read(size) {
          //     this.push(String.fromCharCode(this.currentCharCode++));

          //     if (this.currentCharCode > 4) {
          //       this.push(null);
          //     }
          //   },
          // });
          // this.inoutStream.currentCharCode = 0;

          // client.pipe(this.inoutStream).pipe(process.stdout);

          // this.outStream = new Writable({
          //   write(chunk, encoding, callback) {
          //     BU.error(chunk.toString());

          //     callback(err => {
          //       if (err) {
          //         throw err;
          //       }
          //       // BU.CLIN(this);
          //       // this.notifyData(chunk);
          //     });

          //     // if(chunk.toString().length > parserOption) {

          //     // }

          //     // console.log(chunk.toString());
          //     callback();
          //   },
          // });

          // client.pipe(this.outStream);

          client.on('data', data => {
            // BU.CLI(`${this.port}@@@${data}`);
            // this.notifyData(data);
            this.data = Buffer.concat([this.data, data]);
            this.setTimer && clearTimeout(this.setTimer);
            this.onByteLengthData(this.data, parserOption, client);
          });

          break;
        default:
          break;
      }
    }
  }

  /**
   * Byte Length Parser 메소드
   * @param {Buffer} data
   * @param {number} byteLength
   * @param {net.Socket} client
   */
  onByteLengthData(data, byteLength, client) {
    // byteLength 길이보다 적다면 대기
    if (data.length < byteLength) return false;
    // byteLength에 맞는 데이터 추출
    const currData = data.slice(0, byteLength);
    // 자르고 난 후 남은 데이터
    const remainData = data.slice(byteLength);
    // 데이터 알림

    setTimeout(() => {
      this.notifyData(currData);
    }, 10);

    // 남아있는 데이터가 byteLength에 합당하다면 재귀 호출
    if (remainData >= byteLength) {
      this.onByteLengthData(remainData, byteLength, client);
    } else if (remainData.length) {
      // 남아있는 잔여 데이터가 존재할 경우 타이머를 작동시켜 기존 시간내에 추가 데이터가 들어오지 않을 경우 비움
      this.data = remainData;
      // 1초 내로 추가 데이터가 들어오지 않는다면 현재 데이터 비움
      this.setTimer = setTimeout(() => {
        BU.error(remainData);
        this.data = Buffer.alloc(0);
        this.setTimer = null;
      }, 1000 * 1);
    } else {
      this.data = Buffer.alloc(0);
    }
  }

  /**
   * Socket Server로 메시지 전송
   * @param {Buffer|String} 전송 데이터
   * @return {promise} Promise 반환 객체
   */
  async write(msg) {
    // BU.CLI(`${this.port}@@${msg}`);
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
  connect() {
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

      client.on('connect', () => {
        // const symbol = Object.getOwnPropertySymbols(client).find(sym => {
        //   return String(sym) === 'Symbol(asyncId)';
        // });
        // const result = symbol ? client[symbol] : 'Symbol(id) not found';

        // BU.log('Connected : ', `${this.port}@@${result}`);
        this.settingParser(client);
        this.client = client;
        resolve();
      });

      client.on('close', err => {
        // console.log(`Client disconnected${this.port}@@`);
        // console.error(err);
        this.client = {};
        this.notifyDisconnect(err);
      });

      // client.on('data', data => {
      //   // console.log('data', data);
      //   // BU.CLI(this.port + '@@@' + data);
      //   this.notifyData(data);
      // });

      client.on('end', () => {
        console.log(`Client disconnected${this.port}`);
      });

      client.on('error', error => {
        // BU.error(error);
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
      // const symbol = Object.getOwnPropertySymbols(this.client).find(sym => {
      //   return String(sym) === 'Symbol(asyncId)';
      // });
      // const result = symbol ? this.client[symbol] : 'Symbol(id) not found';

      // BU.CLI(`${this.port}@@${result} @@ destroy`);
      this.client.destroy();
    } else {
      // this.notifyDisconnect();
    }
  }
}

module.exports = SocketWithParser;
