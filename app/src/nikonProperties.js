/**
 * Nikon Z30 PTP property codes and value conversions.
 *
 * The value tables below follow the property summaries published by
 * libgphoto2 for the Nikon Z30. Keep protocol-level values separate from the
 * labels shown in the UI so a label can never be written to the camera.
 */

export const PTP_PROP = Object.freeze({
  BatteryLevel: 0x5001,
  ImageSize: 0x5003,
  CompressionSetting: 0x5004,
  WhiteBalance: 0x5005,
  FNumber: 0x5007,
  FocalLength: 0x5008,
  FocusMode: 0x500A,
  ExposureMeteringMode: 0x500B,
  FlashMode: 0x500C,
  ExposureTime: 0x500D,
  ExposureProgramMode: 0x500E,
  ExposureIndex: 0x500F,
  ExposureBiasCompensation: 0x5010,
  DateTime: 0x5011,
  StillCaptureMode: 0x5013,
  BurstNumber: 0x5018,
  Artist: 0x501E,
  Copyright: 0x501F,
  NikonRecordingMedia: 0xD10B,
  NikonLiveViewSelector: 0xD1A6,
  NikonApplicationMode: 0xD1F0,
  NikonSelfTimer: 0xD063,
  NikonSelfTimerShootNum: 0xD0F5,
});

export const PTP_PROP_NAMES = Object.freeze({
  [PTP_PROP.WhiteBalance]: '白平衡',
  [PTP_PROP.FNumber]: '光圈',
  [PTP_PROP.FocusMode]: '对焦模式',
  [PTP_PROP.ExposureMeteringMode]: '测光模式',
  [PTP_PROP.ExposureTime]: '快门速度',
  [PTP_PROP.ExposureProgramMode]: '曝光模式',
  [PTP_PROP.ExposureIndex]: 'ISO',
  [PTP_PROP.ExposureBiasCompensation]: '曝光补偿',
  [PTP_PROP.StillCaptureMode]: '驱动模式',
  [PTP_PROP.NikonRecordingMedia]: '记录介质',
  [PTP_PROP.NikonLiveViewSelector]: '实时取景选择器',
  [PTP_PROP.NikonApplicationMode]: '应用模式',
});

// Nikon reports 0x500D in units of 100 microseconds.
export const NIKON_EXPOSURE_TIME_UNIT_MICROS = 100;

export function nikonExposureRawToMicros(value) {
  return Number(value) * NIKON_EXPOSURE_TIME_UNIT_MICROS;
}

export function nikonExposureMicrosToRaw(value) {
  return Math.round(Number(value) / NIKON_EXPOSURE_TIME_UNIT_MICROS);
}

const ADDITIONAL_PROP_NAMES = Object.freeze({
  [PTP_PROP.BatteryLevel]: '\u7535\u6c60\u7535\u91cf',
  [PTP_PROP.ImageSize]: '\u56fe\u50cf\u5c3a\u5bf8',
  [PTP_PROP.CompressionSetting]: '\u56fe\u50cf\u54c1\u8d28',
  [PTP_PROP.FocalLength]: '\u7126\u8ddd',
  [PTP_PROP.FlashMode]: '\u95ea\u5149\u706f\u6a21\u5f0f',
  [PTP_PROP.DateTime]: '\u65e5\u671f\u65f6\u95f4',
  [PTP_PROP.BurstNumber]: '\u8fde\u62cd\u5f20\u6570',
  [PTP_PROP.Artist]: '\u4f5c\u8005',
  [PTP_PROP.Copyright]: '\u7248\u6743\u4fe1\u606f',
  [PTP_PROP.NikonSelfTimer]: '\u81ea\u62cd\u5b9a\u65f6',
  [PTP_PROP.NikonSelfTimerShootNum]: '\u81ea\u62cd\u5f20\u6570',
});

export const SELF_TIMER_LABELS = Object.freeze({
  0: '\u5173\u95ed',
  1: '2 \u79d2',
  2: '5 \u79d2',
  3: '10 \u79d2',
  4: '20 \u79d2',
});

export function selfTimerLabel(value) {
  return SELF_TIMER_LABELS[Number(value)] || `\u6863\u4f4d ${value}`;
}

export const PROPERTY_PROBES = Object.freeze([
  { code: PTP_PROP.BatteryLevel, label: '\u7535\u6c60\u7535\u91cf' },
  { code: PTP_PROP.ImageSize, label: '\u56fe\u50cf\u5c3a\u5bf8' },
  { code: PTP_PROP.CompressionSetting, label: '\u56fe\u50cf\u54c1\u8d28' },
  { code: PTP_PROP.WhiteBalance, label: '\u767d\u5e73\u8861' },
  { code: PTP_PROP.FNumber, label: '\u5149\u5708' },
  { code: PTP_PROP.FocalLength, label: '\u7126\u8ddd' },
  { code: PTP_PROP.FocusMode, label: '\u5bf9\u7126\u6a21\u5f0f' },
  { code: PTP_PROP.ExposureMeteringMode, label: '\u6d4b\u5149\u6a21\u5f0f' },
  { code: PTP_PROP.FlashMode, label: '\u95ea\u5149\u706f' },
  { code: PTP_PROP.ExposureTime, label: '\u5feb\u95e8' },
  { code: PTP_PROP.ExposureProgramMode, label: '\u66dd\u5149\u6a21\u5f0f' },
  { code: PTP_PROP.ExposureIndex, label: 'ISO' },
  { code: PTP_PROP.ExposureBiasCompensation, label: '\u66dd\u5149\u8865\u507f' },
  { code: PTP_PROP.StillCaptureMode, label: '\u9a71\u52a8\u6a21\u5f0f' },
  { code: PTP_PROP.BurstNumber, label: '\u8fde\u62cd\u5f20\u6570' },
  { code: PTP_PROP.NikonSelfTimer, label: '\u81ea\u62cd\u5b9a\u65f6' },
  { code: PTP_PROP.NikonSelfTimerShootNum, label: '\u81ea\u62cd\u5f20\u6570' },
]);

export function ptpPropertyLabel(propCode) {
  const code = Number(propCode);
  if (ADDITIONAL_PROP_NAMES[code]) return ADDITIONAL_PROP_NAMES[code];
  return PTP_PROP_NAMES[code] || `相机属性 0x${code.toString(16).padStart(4, '0').toUpperCase()}`;
}

export const EXPOSURE_PROGRAM_CODES = Object.freeze({
  M: 1,
  P: 2,
  A: 3,
  S: 4,
  AUTO: 32784,
  U1: 32848,
  U2: 32849,
  U3: 32850,
});

export const EXPOSURE_PROGRAM_LABELS = Object.freeze({
  1: 'M',
  2: 'P',
  3: 'A',
  4: 'S',
  5: 'P',
  32784: 'AUTO',
  32848: 'U1',
  32849: 'U2',
  32850: 'U3',
});

export const WHITE_BALANCE_CODES = Object.freeze({
  AUTO: 2,
  INCANDESCENT: 4,
  FLUORESCENT: 5,
  DIRECT_SUNLIGHT: 6,
  FLASH: 7,
  CLOUDY: 32784,
  SHADE: 32785,
  COLOR_TEMP: 32786,
  PRESET: 32787,
  AUTO_NATURAL: 32790,
});

export const METERING_CODES = Object.freeze({
  CENTER_WEIGHTED: 2,
  MATRIX: 3,
  SPOT: 4,
  HIGHLIGHT_WEIGHTED: 32784,
});

export const FOCUS_MODE_CODES = Object.freeze({
  MF: 1,
  'AF-S': 32784,
  'AF-C': 32785,
  'AF-A': 32786,
});

export const DRIVE_MODE_CODES = Object.freeze({
  S: 1,
  CH: 2,
  CL: 32784,
  Q: 32785,
  TIMER: 32793,
});

// Z30 reports these values as UINT16.
const UINT16_PROPS = new Set([
  PTP_PROP.BatteryLevel,
  PTP_PROP.ImageSize,
  PTP_PROP.CompressionSetting,
  PTP_PROP.WhiteBalance,
  PTP_PROP.FNumber,
  PTP_PROP.FocalLength,
  PTP_PROP.FocusMode,
  PTP_PROP.ExposureMeteringMode,
  PTP_PROP.FlashMode,
  PTP_PROP.ExposureProgramMode,
  PTP_PROP.ExposureIndex,
  PTP_PROP.StillCaptureMode,
  PTP_PROP.BurstNumber,
  PTP_PROP.NikonSelfTimer,
  PTP_PROP.NikonSelfTimerShootNum,
]);

const UINT8_PROPS = new Set([
  PTP_PROP.NikonRecordingMedia,
  PTP_PROP.NikonLiveViewSelector,
  PTP_PROP.NikonApplicationMode,
]);

function toUnsigned(value, bits) {
  const max = 2 ** bits;
  return ((Number(value) % max) + max) % max;
}

function writeLittleEndian(value, byteLength) {
  const out = new Uint8Array(byteLength);
  const unsigned = toUnsigned(value, byteLength * 8);
  for (let i = 0; i < byteLength; i++) out[i] = (unsigned >>> (i * 8)) & 0xff;
  return out;
}

function descriptorByteLength(descriptor) {
  switch (Number(descriptor?.dataType)) {
    case 0x0001:
    case 0x0002:
      return 1;
    case 0x0003:
    case 0x0004:
      return 2;
    case 0x0005:
    case 0x0006:
      return 4;
    default:
      return 0;
  }
}

export function encodePropValue(propCode, value, descriptor = null) {
  const describedLength = descriptorByteLength(descriptor);
  if (describedLength > 0) {
    return writeLittleEndian(Math.round(value), describedLength);
  }
  if (propCode === PTP_PROP.ExposureBiasCompensation) {
    return writeLittleEndian(Math.round(value), 2);
  }
  if (propCode === PTP_PROP.ExposureTime) {
    return writeLittleEndian(nikonExposureMicrosToRaw(value), 4);
  }
  if (UINT8_PROPS.has(propCode)) {
    return writeLittleEndian(Math.round(value), 1);
  }
  if (UINT16_PROPS.has(propCode)) {
    return writeLittleEndian(Math.round(value), 2);
  }
  return writeLittleEndian(Math.round(value), 4);
}

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export function decodePropValue(payload, propCode, descriptor = null) {
  if (!payload || payload.length === 0) return 0;
  const describedLength = descriptorByteLength(descriptor);
  if (describedLength === 1) return payload[0];
  if (describedLength === 2 && payload.length >= 2) return readU16LE(payload, 0);
  if (describedLength === 4 && payload.length >= 4) return readU32LE(payload, 0);
  if (propCode === PTP_PROP.ExposureBiasCompensation && payload.length >= 2) {
    const value = readU16LE(payload, 0);
    return value >= 0x8000 ? value - 0x10000 : value;
  }
  if (propCode === PTP_PROP.ExposureTime && payload.length >= 4) {
    return nikonExposureRawToMicros(readU32LE(payload, 0));
  }
  if (UINT16_PROPS.has(propCode) && payload.length >= 2) return readU16LE(payload, 0);
  return payload.length >= 4 ? readU32LE(payload, 0) : payload[0];
}

export function shutterLabelToMicros(label) {
  const text = String(label || '').trim();
  const fraction = text.match(/^1\/(\d+(?:\.\d+)?)$/);
  if (fraction) return Math.max(1, Math.round(1_000_000 / Number(fraction[1])));
  const seconds = text.match(/^(\d+(?:\.\d+)?)"$/);
  if (seconds) return Math.round(Number(seconds[1]) * 1_000_000);
  throw new Error(`Unsupported shutter label: ${text}`);
}

export function apertureLabelToHundredths(label) {
  const text = String(label || '').trim().replace(/^F/i, '');
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Unsupported aperture label: ${label}`);
  return Math.round(value * 100);
}

export function exposureCompensationToMilliEv(stops) {
  return Math.round(Number(stops) * 1000);
}

export function exposureProgramLabel(value) {
  return EXPOSURE_PROGRAM_LABELS[Number(value)] || `0x${Number(value).toString(16).toUpperCase()}`;
}

export function exposureTimeMicrosToLabel(value) {
  const micros = Number(value) >>> 0;
  if (micros === 0xFFFFFFFF) return 'Bulb';
  if (micros <= 0) return '--';
  if (micros >= 1_000_000) {
    const seconds = micros / 1_000_000;
    return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}"`;
  }
  const denominator = 1_000_000 / micros;
  return `1/${denominator >= 10 ? Math.round(denominator) : denominator.toFixed(1).replace(/\.0$/, '')}`;
}

export function fNumberLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '--';
  const f = number / 100;
  return `F${Number.isInteger(f) ? f.toFixed(0) : f.toFixed(1)}`;
}

export function reverseEnumCode(table, key) {
  const value = table?.[key];
  return typeof value === 'number' ? value : null;
}
