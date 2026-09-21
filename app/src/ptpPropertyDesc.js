/**
 * Minimal PTP DevicePropDesc parser for ISO 15740 property descriptors.
 * Nikon exposes its supported shutter, ISO, aperture and mode values here,
 * so the UI can avoid hard-coded assumptions.
 */

function readValue(bytes, offset, dataType) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (Number(dataType)) {
    case 0x0001: return { value: view.getInt8(offset), next: offset + 1 };
    case 0x0002: return { value: view.getUint8(offset), next: offset + 1 };
    case 0x0003: return { value: view.getInt16(offset, true), next: offset + 2 };
    case 0x0004: return { value: view.getUint16(offset, true), next: offset + 2 };
    case 0x0005: return { value: view.getInt32(offset, true), next: offset + 4 };
    case 0x0006: return { value: view.getUint32(offset, true), next: offset + 4 };
    case 0x0007: return { value: Number(view.getBigInt64(offset, true)), next: offset + 8 };
    case 0x0008: return { value: Number(view.getBigUint64(offset, true)), next: offset + 8 };
    default: throw new Error(`不支持的 PTP 属性数据类型: 0x${Number(dataType).toString(16)}`);
  }
}

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function parseDevicePropDesc(payload) {
  if (!payload || payload.length < 11) throw new Error('PTP 属性描述数据过短');
  const propertyCode = readUint16(payload, 0);
  const dataType = readUint16(payload, 2);
  const getSet = payload[4];

  let offset = 5;
  const defaultValue = readValue(payload, offset, dataType);
  offset = defaultValue.next;
  const currentValue = readValue(payload, offset, dataType);
  offset = currentValue.next;

  const formFlag = payload[offset];
  offset += 1;
  const result = {
    propertyCode,
    dataType,
    getSet,
    defaultValue: defaultValue.value,
    currentValue: currentValue.value,
    formFlag,
    form: 'none',
  };

  if (formFlag === 0x01) {
    const minimum = readValue(payload, offset, dataType);
    offset = minimum.next;
    const maximum = readValue(payload, offset, dataType);
    offset = maximum.next;
    const step = readValue(payload, offset, dataType);
    return {
      ...result,
      form: 'range',
      minimum: minimum.value,
      maximum: maximum.value,
      step: step.value,
    };
  }

  if (formFlag === 0x02) {
    const count = readUint16(payload, offset);
    offset += 2;
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const item = readValue(payload, offset, dataType);
      values.push(item.value);
      offset = item.next;
    }
    return {
      ...result,
      form: 'enumeration',
      values,
    };
  }

  return result;
}
