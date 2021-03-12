const _ = require('lodash');
const Serialport = require('serialport');
const eventToPromise = require('event-to-promise');

const { BU } = require('base-util-jh');

const xbeeApi = require('xbee-api');
const AbstController = require('../AbstController');

/** @type {Array.<{id: string, instance: SerialWithXbee}>} */
const instanceList = [];
class SerialWithXbee extends AbstController {
  /**
   * Serial Port 객체를 생성하기 위한 설정 정보
   * @param {deviceInfo} mainConfig
   * @param {constructorXbee} connectInfo
   */
  constructor(mainConfig, connectInfo) {
    super(mainConfig);
    this.port = connectInfo.port;
    this.baud_rate = connectInfo.baudRate;
    this.xbeeConfig = connectInfo.addConfigInfo;
    this.xbeeAPI = null;

    const foundInstance = _.find(instanceList, { id: this.port });
    if (_.isEmpty(foundInstance)) {
      this.xbeeAPI = new xbeeApi.XBeeAPI({
        // default options:
        api_mode: 1, // [1, 2]; 1 is default, 2 is with escaping (set ATAP=2)
        module: 'ZigBee', // ["802.15.4", "ZNet", "ZigBee", "Any"]; This does nothing, yet!
        raw_frames: false, // [true, false]; If set to true, only raw byte frames are
        //   emitted (after validation) but not parsed to objects.
        convert_adc: true, // [true, false]; If false, do not convert adc value to millivolt.
        vref_adc: 1200, // (int); Set the value to convert adc value to millivolt.
        parser_buffer_size: 512, // (int); size of the package parser buffer. 512 co
        //   when receiving A LOT of packets, you might want to decrease
        //   this to a smaller value (but typically not less than 128)
        builder_buffer_size: 512, // (int); size of the package builder buffer.
        //   when sending A LOT of packets, you might want to decrease
        //   this to a smaller value (but typically not less than 128)
      });
      // this.xbeeAPI = new xbeeApi.XBeeAPI(this.xbeeConfig);
      this.configInfo = {
        port: this.port,
        baud_rate: this.baud_rate,
        xbeeConfig: this.xbeeConfig,
      };
      instanceList.push({ id: this.port, instance: this });
      this.setInit();
    } else {
      return foundInstance.instance;
    }
  }

  /**
   * Parser Pipe 를 붙임
   * @param {Object} client SerialPort Client
   */
  settingXbee(client) {
    client.pipe(this.xbeeAPI.parser);
    this.xbeeAPI.builder.pipe(client);

    // All frames parsed by the XBee will be emitted here
    this.xbeeAPI.parser.on('data', frame => {
      // BU.CLI(frame);
      /** @type {xbeeApi_0x88|xbeeApi_0x8B|xbeeApi_0x90} */
      const frameInfo = frame;

      if (frameInfo.type === 0x8b) {
        // remote16 주소를 찾지 못하였다면 전송 실패라고 판단.
        if (frameInfo.remote16 === 'fffd') {
          // this.xbeeAPI.builder.write(this.currentFrame);
          return this.notifyTransferFail(frameInfo);
        }
        if (frameInfo.id !== this.currentFrameId) {
          // This frame is definitely the response!
          BU.CLI(
            `The frameId is not correct. Request Id: ${this.currentFrameId}, Response Id: ${frameInfo.id}`,
          );

          // this.notifyError(
          //   new Error(
          //     `The frameId is not correct. Request Id: ${
          //       this.currentFrameId
          //     }, Response Id: ${frameInfo.id}`,
          //   ),
          // );
        }
        // console.log('Node identifier:', String.fromCharCode(frameObj.commandData));
      } else {
        // BU.CLI(frameObj.remote64, frameObj.data.toString());
        // FIXME: 바로 데이터를 보낸 후 다음 명령 요청 시 간헐적으로 지그비에서 이전 데이터를 보내는 경우가 있음.
        // 1ms 지연 후 반환
        // setTimeout(() => {
        return this.notifyData(frameInfo);
        // }, 1);
        // This is some other frame
      }
    });
  }

  /**
   * Serial Device로 메시지 전송
   * @param {xbeeApi_0x10} frameObj 전송 데이터
   * @return {Promise} Promise 반환 객체
   */
  write(frameObj) {
    // BU.CLI('write', frameObj);
    if (_.isEmpty(this.client)) {
      throw new Error(`The device is not connected. ${this.port}`);
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    return wait(1).then(
      () =>
        new Promise((resolve, reject) => {
          this.currentFrameId = frameObj.id;
          // this.currentFrame = frameObj;

          const isWrite = this.xbeeAPI.builder.write(frameObj);
          if (isWrite) {
            resolve();
          } else {
            reject(isWrite);
          }
        }),
    );

    // return new Promise((resolve, reject) => {
    //   this.currentFrameId = frameObj.id;
    //   // this.currentFrame = frameObj;

    //   const isWrite = this.xbeeAPI.builder.write(frameObj);
    //   if (isWrite) {
    //     resolve();
    //   } else {
    //     reject(isWrite);
    //   }
    // });
  }

  connect() {
    // BU.CLIS('connect', this.port, this.baud_rate);
    /** 접속 중인 상태라면 접속 시도하지 않음 */
    if (!_.isEmpty(this.client)) {
      throw new Error(`Already connected. ${this.port}`);
    }
    const client = new Serialport(this.port, {
      baudRate: this.baud_rate,
      autoOpen: false,
    });

    client.on('close', err => {
      this.client = {};
      this.notifyDisconnect(err);
    });

    client.on('error', error => {
      this.notifyError(error);
    });

    return new Promise((resolve, reject) => {
      client.open(err => {
        if (err) {
          reject(err);
        } else {
          this.settingXbee(client);
          this.client = client;
          resolve();
        }
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
module.exports = SerialWithXbee;
