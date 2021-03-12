const net = require('net');

const connectInfo = { host: '192.168.0.158', port: 15800 };
// const connectInfo = { host: 'fp.smsoft.co.kr', port: 8001 };

const client = net.connect(connectInfo, () => {
  console.log(`connected ${connectInfo.host} ${connectInfo.port} `);
});

client.on('data', console.log);
client.on('close', console.log);

// setTimeout(() => {
//   client.write(Buffer.from([0x02, 0x41, 0x30, 0x30, 0x31, 0x03]));
// }, 1000);``
