import { PtpIpSession, PtpUsbSession } from '../src/ptpip.js';
import {
  PTP_PROP,
  WHITE_BALANCE_CODES,
  METERING_CODES,
  FOCUS_MODE_CODES,
  DRIVE_MODE_CODES,
  encodePropValue,
  decodePropValue,
  shutterLabelToMicros,
  apertureLabelToHundredths,
  exposureCompensationToMilliEv,
} from '../src/nikonProperties.js';

const u16 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes, offset) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

function writeU16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function ipPacket(type, payload = new Uint8Array(0)) {
  const packet = new Uint8Array(8 + payload.length);
  writeU32(packet, 0, packet.length);
  writeU32(packet, 4, type);
  packet.set(payload, 8);
  return packet;
}

function usbContainer(type, code, tx, payload = new Uint8Array(0)) {
  const packet = new Uint8Array(12 + payload.length);
  writeU32(packet, 0, packet.length);
  writeU16(packet, 4, type);
  writeU16(packet, 6, code);
  writeU32(packet, 8, tx);
  packet.set(payload, 12);
  return packet;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertBytes(actual, expected, label) {
  const actualHex = Array.from(actual).map((value) => value.toString(16).padStart(2, '0')).join('');
  const expectedHex = Array.from(expected).map((value) => value.toString(16).padStart(2, '0')).join('');
  if (actualHex !== expectedHex) {
    throw new Error(`${label}: expected ${expectedHex}, got ${actualHex}`);
  }
}

function ipResponse(code, tx, params = []) {
  const payload = new Uint8Array(6 + params.length * 4);
  writeU16(payload, 0, code);
  writeU32(payload, 2, tx);
  params.forEach((value, index) => writeU32(payload, 6 + index * 4, value));
  return ipPacket(7, payload);
}

class FakeIpTransport {
  onData(cb) { this.onCommand = cb; }
  onEventData(cb) { this.onEvent = cb; }
  async connect() {}
  async connectEvent() {}
  async close() {}

  async write(bytes) {
    const type = u32(bytes, 4);
    if (type === 1) {
      const payload = new Uint8Array(26);
      writeU32(payload, 0, 7);
      const name = 'Z30';
      for (let i = 0; i < name.length; i++) writeU16(payload, 20 + i * 2, name.charCodeAt(i));
      this.onCommand(ipPacket(2, payload));
      return;
    }
    if (type === 6) {
      const opCode = u16(bytes, 12);
      const tx = u32(bytes, 14);
      if (opCode === 0x1001) {
        const start = new Uint8Array(12);
        writeU32(start, 0, tx);
        writeU32(start, 4, 3);
        const end = new Uint8Array(7);
        writeU32(end, 0, tx);
        end.set([1, 2, 3], 4);
        this.onCommand(ipPacket(9, start));
        this.onCommand(ipPacket(12, end));
      }
      this.onCommand(ipResponse(0x2001, tx));
    }
  }

  async writeEvent(bytes) {
    const type = u32(bytes, 4);
    if (type === 3) this.onEvent(ipPacket(4));
    if (type === 13) this.onEvent(ipPacket(14));
  }
}

class FakeUsbTransport {
  onData(cb) { this.onDataCallback = cb; }
  onState() { return () => {}; }
  async connect() {}
  async close() {}

  async write(bytes) {
    const type = u16(bytes, 4);
    if (type === 1) {
      const opCode = u16(bytes, 6);
      const tx = u32(bytes, 8);
      if (opCode === 0x1001) {
        this.onDataCallback(usbContainer(2, opCode, tx, new Uint8Array([1, 2, 3])));
      }
      this.onDataCallback(usbContainer(3, 0x2001, tx));
      return;
    }
    if (type === 2) {
      const opCode = u16(bytes, 6);
      const tx = u32(bytes, 8);
      this.onDataCallback(usbContainer(3, 0x2001, tx));
    }
  }
}

const ip = new PtpIpSession(new FakeIpTransport(), { onDiagnose: () => {} });
await ip.open('127.0.0.1', 15740);
if (ip.sessionId !== 7) throw new Error('PTP/IP session id mismatch');
const ipInfo = await ip.command(0x1001, []);
if (ipInfo.payload.length !== 3 || ipInfo.payload[2] !== 3) throw new Error('PTP/IP data phase mismatch');
await ip.close();

const usb = new PtpUsbSession(new FakeUsbTransport(), { onDiagnose: () => {} });
await usb.open();
const usbInfo = await usb.command(0x1001, []);
if (usbInfo.payload.length !== 3 || usbInfo.payload[2] !== 3) throw new Error('USB data phase mismatch');
const prop = await usb.command(0x1016, [0x5005], 8000, new Uint8Array([2, 0]));
if (prop.responseCode !== 0x2001) throw new Error('USB data-out phase failed');
await usb.close();

// Nikon Z30 property conversions: labels must never be passed to SetDevicePropValue.
assertEqual(shutterLabelToMicros('1/125'), 8000, 'shutter 1/125');
assertEqual(shutterLabelToMicros('1"'), 1_000_000, 'shutter 1 second');
assertEqual(apertureLabelToHundredths('F5.6'), 560, 'aperture F5.6');
assertEqual(apertureLabelToHundredths('f1.4'), 140, 'aperture F1.4');
assertEqual(exposureCompensationToMilliEv(-0.333), -333, 'exposure compensation');

assertEqual(WHITE_BALANCE_CODES.CLOUDY, 32784, 'white balance cloudy');
assertEqual(METERING_CODES.MATRIX, 3, 'metering matrix');
assertEqual(FOCUS_MODE_CODES['AF-S'], 32784, 'focus AF-S');
assertEqual(DRIVE_MODE_CODES.CH, 2, 'drive CH');

assertBytes(encodePropValue(PTP_PROP.WhiteBalance, WHITE_BALANCE_CODES.CLOUDY), [0x10, 0x80], 'WB UINT16');
assertBytes(encodePropValue(PTP_PROP.ExposureBiasCompensation, -333), [0xb3, 0xfe], 'signed exposure bias');
assertEqual(decodePropValue(new Uint8Array([0xb3, 0xfe]), PTP_PROP.ExposureBiasCompensation), -333, 'decode signed exposure bias');
assertEqual(decodePropValue(new Uint8Array([3, 0]), PTP_PROP.ExposureMeteringMode), 3, 'decode UINT16 property');
assertBytes(encodePropValue(PTP_PROP.ExposureTime, 25000), [0xfa, 0x00, 0x00, 0x00], 'Nikon 1/40 shutter encoding');
assertEqual(decodePropValue(new Uint8Array([0xfa, 0x00, 0x00, 0x00]), PTP_PROP.ExposureTime), 25000, 'Nikon shutter decode to microseconds');

console.log('protocol smoke tests passed');
