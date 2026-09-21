import assert from 'node:assert/strict';
import { PtpIpSession, PtpUsbSession } from '../src/ptpip.js';
import {
  PTP_PROP,
  encodePropValue,
  decodePropValue,
} from '../src/nikonProperties.js';
import { FakeNikonCamera } from './fake-camera.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openIp(camera) {
  const session = new PtpIpSession(camera.createIpTransport(), { onDiagnose: () => {} });
  await session.open('127.0.0.1', 15740);
  return session;
}

async function read(session, propCode, timeoutMs = 1000) {
  return session.command(0x1015, [propCode], timeoutMs);
}

async function write(session, propCode, value, timeoutMs = 1000) {
  return session.command(0x1016, [propCode], timeoutMs, encodePropValue(propCode, value));
}

const camera = new FakeNikonCamera();
const session = await openIp(camera);

const conversionCases = [
  ['曝光模式', PTP_PROP.ExposureProgramMode, 32784],
  ['ISO', PTP_PROP.ExposureIndex, 640],
  ['快门', PTP_PROP.ExposureTime, 8000],
  ['光圈', PTP_PROP.FNumber, 560],
  ['白平衡', PTP_PROP.WhiteBalance, 32784],
  ['对焦模式', PTP_PROP.FocusMode, 32785],
  ['测光模式', PTP_PROP.ExposureMeteringMode, 4],
  ['曝光补偿', PTP_PROP.ExposureBiasCompensation, -333],
  ['驱动模式', PTP_PROP.StillCaptureMode, 2],
];

for (const [label, propCode, value] of conversionCases) {
  const writeResult = await write(session, propCode, value);
  assert.equal(writeResult.responseCode, 0x2001, `${label} write should succeed`);
  const readResult = await read(session, propCode);
  assert.equal(readResult.responseCode, 0x2001, `${label} readback should succeed`);
  assert.equal(decodePropValue(readResult.payload, propCode), value, `${label} should round-trip`);
}

const successfulWrite = camera.operations.filter(item => item.opCode === 0x1016).at(-1);
assert.deepEqual(
  Array.from(successfulWrite.dataOut),
  [0x02, 0x00],
  'UINT16 property should be sent as two little-endian bytes',
);
await session.close();

const retryCamera = new FakeNikonCamera({
  failures: {
    get: { [PTP_PROP.WhiteBalance]: { responseCode: 0x2005, times: 1 } },
  },
});
const retrySession = await openIp(retryCamera);
const failedRead = await read(retrySession, PTP_PROP.WhiteBalance);
assert.equal(failedRead.responseCode, 0x2005, 'first read should expose camera failure');
const retriedRead = await read(retrySession, PTP_PROP.WhiteBalance);
assert.equal(retriedRead.responseCode, 0x2001, 'second read should recover');
await retrySession.close();

const writeFailureCamera = new FakeNikonCamera({
  failures: {
    set: { [PTP_PROP.ExposureIndex]: { responseCode: 0x201F, times: 1 } },
  },
});
const writeFailureSession = await openIp(writeFailureCamera);
const rejectedWrite = await write(writeFailureSession, PTP_PROP.ExposureIndex, 640);
assert.equal(rejectedWrite.responseCode, 0x201F, 'set failure response should be preserved');
assert.equal(writeFailureCamera.getProperty(PTP_PROP.ExposureIndex), 100, 'rejected write must not change camera state');
await writeFailureSession.close();

const ignoredWriteCamera = new FakeNikonCamera({
  failures: {
    set: { [PTP_PROP.FNumber]: { responseCode: 0x2001, apply: false } },
  },
});
const ignoredWriteSession = await openIp(ignoredWriteCamera);
const acceptedIgnoredWrite = await write(ignoredWriteSession, PTP_PROP.FNumber, 800);
assert.equal(acceptedIgnoredWrite.responseCode, 0x2001, 'camera may accept a write without applying it');
const ignoredReadback = await read(ignoredWriteSession, PTP_PROP.FNumber);
assert.equal(
  decodePropValue(ignoredReadback.payload, PTP_PROP.FNumber),
  560,
  'readback should detect accepted but ignored writes',
);
await ignoredWriteSession.close();

const timeoutCamera = new FakeNikonCamera({
  failures: {
    get: { [PTP_PROP.ExposureMeteringMode]: { responseCode: 0x2001, delayMs: 80 } },
  },
});
const timeoutSession = await openIp(timeoutCamera);
await assert.rejects(
  () => read(timeoutSession, PTP_PROP.ExposureMeteringMode, 20),
  /超时/,
  'delayed response should trigger a protocol timeout',
);
await sleep(100);
await timeoutSession.close();

const usbCamera = new FakeNikonCamera();
const usbSession = new PtpUsbSession(usbCamera.createUsbTransport(), { onDiagnose: () => {} });
await usbSession.open();
const usbWrite = await write(usbSession, PTP_PROP.NikonLiveViewSelector, 1);
assert.equal(usbWrite.responseCode, 0x2001, 'USB UINT8 write should succeed');
const usbRead = await read(usbSession, PTP_PROP.NikonLiveViewSelector);
assert.equal(decodePropValue(usbRead.payload, PTP_PROP.NikonLiveViewSelector), 1, 'USB UINT8 readback should match');
await usbSession.close();

console.log('fake camera property tests passed');
