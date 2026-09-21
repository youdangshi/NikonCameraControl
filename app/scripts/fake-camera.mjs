import { encodePropValue, decodePropValue } from '../src/nikonProperties.js';

const DEFAULT_PROPERTIES = {
  0x5005: 2,
  0x5007: 560,
  0x500A: 32784,
  0x500B: 3,
  0x500D: 8000,
  0x500E: 1,
  0x500F: 100,
  0x5010: 0,
  0x5013: 1,
};

const readU16LE = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const readU32LE = (bytes, offset) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

function writeU16LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeU32LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

export function ipPacket(type, payload = new Uint8Array(0)) {
  const packet = new Uint8Array(8 + payload.length);
  writeU32LE(packet, 0, packet.length);
  writeU32LE(packet, 4, type);
  packet.set(payload, 8);
  return packet;
}

export function ipResponse(code, tx, params = [], payload = new Uint8Array(0)) {
  const body = new Uint8Array(6 + params.length * 4 + payload.length);
  writeU16LE(body, 0, code);
  writeU32LE(body, 2, tx);
  params.forEach((value, index) => writeU32LE(body, 6 + index * 4, value));
  body.set(payload, 6 + params.length * 4);
  return ipPacket(7, body);
}

export function usbContainer(type, code, tx, payload = new Uint8Array(0)) {
  const packet = new Uint8Array(12 + payload.length);
  writeU32LE(packet, 0, packet.length);
  writeU16LE(packet, 4, type);
  writeU16LE(packet, 6, code);
  writeU32LE(packet, 8, tx);
  packet.set(payload, 12);
  return packet;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function failureSpec(failures, operation, propCode) {
  const group = failures?.[operation];
  if (!group) return null;
  return group[propCode]
    ?? group[String(propCode)]
    ?? group[`0x${Number(propCode).toString(16)}`]
    ?? group[`0x${Number(propCode).toString(16).toUpperCase()}`]
    ?? null;
}

/**
 * In-memory Nikon PTP camera used by protocol tests and the self-test workflow.
 * Failure specifications can model response codes, delayed/dropped responses,
 * and accepted writes that the camera silently ignores.
 */
export class FakeNikonCamera {
  constructor(options = {}) {
    this.model = options.model || 'Nikon Z30';
    this.sessionId = options.sessionId || 7;
    this.properties = new Map(
      Object.entries({ ...DEFAULT_PROPERTIES, ...(options.properties || {}) })
        .map(([code, value]) => [Number(code), Number(value)]),
    );
    this.failures = options.failures || {};
    this.failureCounters = new Map();
    this.operations = [];
    this.closed = false;
  }

  getProperty(propCode) {
    return this.properties.get(Number(propCode)) ?? 0;
  }

  setProperty(propCode, value) {
    this.properties.set(Number(propCode), Number(value));
  }

  _nextFailure(operation, propCode) {
    const spec = failureSpec(this.failures, operation, propCode);
    if (!spec) return { responseCode: 0x2001, delayMs: 0, drop: false, apply: true };
    const normalized = typeof spec === 'number'
      ? { responseCode: spec }
      : { ...spec };
    const key = `${operation}:${propCode}`;
    const used = this.failureCounters.get(key) || 0;
    const times = normalized.times == null ? Infinity : Number(normalized.times);
    if (used >= times) {
      return { responseCode: 0x2001, delayMs: 0, drop: false, apply: true };
    }
    this.failureCounters.set(key, used + 1);
    return {
      responseCode: normalized.responseCode ?? normalized.code ?? 0x2005,
      delayMs: normalized.delayMs || 0,
      drop: Boolean(normalized.drop),
      apply: normalized.apply !== false,
    };
  }

  async handleCommand(opCode, params = [], dataOut = null) {
    const propCode = Number(params[0] ?? 0);
    const operation = opCode === 0x1015 ? 'get' : opCode === 0x1016 ? 'set' : 'command';
    const failure = operation === 'command'
      ? { responseCode: 0x2001, delayMs: 0, drop: false, apply: true }
      : this._nextFailure(operation, propCode);

    this.operations.push({
      opCode,
      propCode,
      dataOut: dataOut ? new Uint8Array(dataOut) : null,
      responseCode: failure.drop ? null : failure.responseCode,
      timestamp: Date.now(),
    });

    if (failure.delayMs) await delay(failure.delayMs);
    if (failure.drop) return { drop: true, responseCode: null, payload: new Uint8Array(0) };

    if (opCode === 0x1001) {
      return {
        responseCode: failure.responseCode,
        payload: new Uint8Array([0x00, 0x00, 0x00, 0x00]),
      };
    }
    if (opCode === 0x1002 || opCode === 0x1003 || opCode === 0x1010) {
      return { responseCode: failure.responseCode, payload: new Uint8Array(0) };
    }
    if (opCode === 0x1015) {
      if (failure.responseCode !== 0x2001) {
        return { responseCode: failure.responseCode, payload: new Uint8Array(0) };
      }
      return {
        responseCode: 0x2001,
        payload: encodePropValue(propCode, this.getProperty(propCode)),
      };
    }
    if (opCode === 0x1016) {
      if (failure.responseCode === 0x2001 && failure.apply && dataOut?.length) {
        this.setProperty(propCode, decodePropValue(dataOut, propCode));
      }
      return { responseCode: failure.responseCode, payload: new Uint8Array(0) };
    }
    return { responseCode: failure.responseCode, payload: new Uint8Array(0) };
  }

  createIpTransport() {
    return new FakeIpTransport(this);
  }

  createUsbTransport() {
    return new FakeUsbTransport(this);
  }
}

export class FakeIpTransport {
  constructor(camera) {
    this.camera = camera;
    this.pendingDataOut = null;
  }

  onData(callback) {
    this.onCommand = callback;
  }

  onEventData(callback) {
    this.onEvent = callback;
  }

  async connect() {}
  async connectEvent() {}
  async close() {}

  _initResponse() {
    const name = this.camera.model;
    const payload = new Uint8Array(20 + name.length * 2 + 2);
    writeU32LE(payload, 0, this.camera.sessionId);
    for (let i = 0; i < name.length; i++) {
      writeU16LE(payload, 20 + i * 2, name.charCodeAt(i));
    }
    return ipPacket(2, payload);
  }

  async _respond(opCode, tx, params, dataOut) {
    const result = await this.camera.handleCommand(opCode, params, dataOut);
    if (result.drop) return;
    if (opCode === 0x1015 && result.payload?.length) {
      const start = new Uint8Array(12);
      writeU32LE(start, 0, tx);
      writeU32LE(start, 4, result.payload.length);
      this.onCommand(ipPacket(9, start));
      if (result.payload.length < 128) {
        const end = new Uint8Array(4 + result.payload.length);
        writeU32LE(end, 0, tx);
        end.set(result.payload, 4);
        this.onCommand(ipPacket(12, end));
      } else {
        const middle = new Uint8Array(4 + result.payload.length);
        writeU32LE(middle, 0, tx);
        middle.set(result.payload, 4);
        this.onCommand(ipPacket(10, middle));
        const end = new Uint8Array(4);
        writeU32LE(end, 0, tx);
        this.onCommand(ipPacket(12, end));
      }
    }
    this.onCommand(ipResponse(result.responseCode, tx));
  }

  async write(bytes) {
    const type = readU32LE(bytes, 4);
    if (type === 1) {
      this.onCommand(this._initResponse());
      return;
    }
    if (type === 6) {
      const dataPhase = readU32LE(bytes, 8);
      const opCode = readU16LE(bytes, 12);
      const tx = readU32LE(bytes, 14);
      const params = [];
      for (let offset = 18; offset + 4 <= bytes.length; offset += 4) {
        params.push(readU32LE(bytes, offset));
      }
      if (dataPhase === 2) {
        this.pendingDataOut = { opCode, tx, params, expected: 0, chunks: [] };
        return;
      }
      void this._respond(opCode, tx, params, null);
      return;
    }
    if (type === 9 && this.pendingDataOut) {
      this.pendingDataOut.expected = readU32LE(bytes, 12);
      return;
    }
    if ((type === 10 || type === 12) && this.pendingDataOut) {
      const tx = readU32LE(bytes, 8);
      const chunk = bytes.subarray(12);
      if (tx === this.pendingDataOut.tx && chunk.length) {
        this.pendingDataOut.chunks.push(new Uint8Array(chunk));
      }
      if (type === 12) {
        const pending = this.pendingDataOut;
        this.pendingDataOut = null;
        const dataOut = pending.chunks.length ? concatBytes(pending.chunks) : new Uint8Array(0);
        void this._respond(pending.opCode, pending.tx, pending.params, dataOut);
      }
    }
  }

  async writeEvent(bytes) {
    const type = readU32LE(bytes, 4);
    if (type === 3) this.onEvent(ipPacket(4));
    if (type === 13) this.onEvent(ipPacket(14));
  }
}

export class FakeUsbTransport {
  constructor(camera) {
    this.camera = camera;
  }

  onData() {
    return () => {};
  }

  onState() {
    return () => {};
  }

  async connect() {}
  async reset() {}
  async drain() { return 0; }
  async close() {}

  async request(command, _timeoutMs, dataOutContainer) {
    const opCode = readU16LE(command, 6);
    const tx = readU32LE(command, 8);
    const params = [];
    for (let offset = 12; offset + 4 <= command.length; offset += 4) {
      params.push(readU32LE(command, offset));
    }
    const dataOut = dataOutContainer?.length > 12
      ? dataOutContainer.subarray(12)
      : new Uint8Array(0);
    const result = await this.camera.handleCommand(opCode, params, dataOut);
    if (result.drop) return new Promise(() => {});

    const containers = [];
    if (opCode === 0x1015 && result.payload?.length) {
      containers.push(usbContainer(2, opCode, tx, result.payload));
    }
    containers.push(usbContainer(3, result.responseCode, tx));
    return { bytes: concatBytes(containers), complete: true };
  }
}
