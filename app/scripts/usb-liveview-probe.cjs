/*
 * USB PTP live-view probe for Nikon Z-series cameras.
 *
 * This script intentionally uses the same standard USB PTP container format as
 * the desktop server, but logs every container and tries the Nikon command
 * sequence used by working remote-control implementations.
 */
const usb = require('usb');

const VENDOR_NIKON = 0x04b0;
const PRODUCT_Z30 = 0x0452;

function readU32LE(buffer, offset) {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
}

function writeU32LE(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function hex(value) {
  return `0x${Number(value).toString(16).padStart(4, '0')}`;
}

function buildContainer(type, code, transactionId, payload = Buffer.alloc(0)) {
  const buffer = Buffer.alloc(12 + payload.length);
  writeU32LE(buffer, 0, buffer.length);
  buffer[4] = type & 0xff;
  buffer[5] = (type >>> 8) & 0xff;
  buffer[6] = code & 0xff;
  buffer[7] = (code >>> 8) & 0xff;
  writeU32LE(buffer, 8, transactionId);
  payload.copy(buffer, 12);
  return buffer;
}

function parseContainers(bytes) {
  const containers = [];
  let offset = 0;
  while (offset + 12 <= bytes.length) {
    const length = readU32LE(bytes, offset);
    const type = bytes[offset + 4] | (bytes[offset + 5] << 8);
    if (length < 12 || type < 1 || type > 4 || offset + length > bytes.length) break;
    containers.push({
      length,
      type,
      code: bytes[offset + 6] | (bytes[offset + 7] << 8),
      transactionId: readU32LE(bytes, offset + 8),
      payload: Buffer.from(bytes.subarray(offset + 12, offset + length)),
    });
    offset += length;
  }
  return { containers, consumed: offset };
}

function paramsFromPayload(payload) {
  const params = [];
  for (let offset = 0; offset + 4 <= payload.length; offset += 4) {
    params.push(readU32LE(payload, offset));
  }
  return params;
}

function transfer(endpoint, length) {
  return new Promise((resolve, reject) => {
    endpoint.transfer(length, (error, data) => error ? reject(error) : resolve(Buffer.from(data || [])));
  });
}

async function drainInput(endpoint, idleMs = 450) {
  const startedAt = Date.now();
  let total = 0;
  while (Date.now() - startedAt < idleMs) {
    try {
      endpoint.timeout = 250;
      const data = await transfer(endpoint, 65536);
      if (!data.length) continue;
      total += data.length;
      console.log(`[drain] ${data.length} bytes: ${data.subarray(0, Math.min(32, data.length)).toString('hex')}`);
    } catch {
      break;
    }
  }
  endpoint.timeout = 0;
  return total;
}

async function main() {
  const device = usb.getDeviceList().find((item) =>
    item.deviceDescriptor.idVendor === VENDOR_NIKON &&
    item.deviceDescriptor.idProduct === PRODUCT_Z30
  );
  if (!device) {
    throw new Error('Nikon Z30 (04b0:0452) not found');
  }

  console.log(`[device] bus=${device.busNumber} address=${device.deviceAddress}`);
  device.open();
  const iface = device.interfaces[0];
  iface.claim();
  const outEndpoint = iface.endpoints.find((endpoint) => endpoint.direction === 'out');
  const inEndpoint = iface.endpoints.find((endpoint) => endpoint.direction === 'in');
  if (!outEndpoint || !inEndpoint) throw new Error('USB endpoints not found');

  let transactionId = 0;
  let pendingData = Buffer.alloc(0);
  let liveViewStarted = false;

  async function command(code, params = [], timeoutMs = 15000) {
    const transaction = ++transactionId;
    const payload = Buffer.alloc(params.length * 4);
    params.forEach((value, index) => writeU32LE(payload, index * 4, value >>> 0));
    const request = buildContainer(1, code, transaction, payload);

    console.log(`\n[tx] op=${hex(code)} tx=${transaction} params=${params.map(hex).join(',') || '-'} bytes=${request.length}`);
    await transfer(outEndpoint, request);

    const startedAt = Date.now();
    pendingData = Buffer.alloc(0);
    while (Date.now() - startedAt < timeoutMs) {
      let chunk;
      try {
        const remainingMs = Math.max(250, timeoutMs - (Date.now() - startedAt));
        chunk = await new Promise((resolve, reject) => {
          const watchdog = setTimeout(() => {
            console.error(`[result] op=${hex(code)} timeout after ${Date.now() - startedAt}ms`);
            process.exit(2);
          }, remainingMs);
          transfer(inEndpoint, 65536).then(
            (data) => { clearTimeout(watchdog); resolve(data); },
            (error) => { clearTimeout(watchdog); reject(error); },
          );
        });
      } catch (error) {
        throw error;
      }

      console.log(`[rx] ${chunk.length} bytes: ${chunk.subarray(0, Math.min(48, chunk.length)).toString('hex')}`);
      const parsed = parseContainers(chunk);
      if (!parsed.containers.length && chunk.length >= 12) {
        console.log('[rx] unparsed container bytes');
      }

      for (const container of parsed.containers) {
        console.log(`[container] type=${container.type} code=${hex(container.code)} tx=${container.transactionId} payload=${container.payload.length}`);
        if (container.type === 2) {
          pendingData = Buffer.concat([pendingData, container.payload]);
        }
        if (container.type === 3 && container.transactionId === transaction) {
          const result = {
            code,
            responseCode: container.code,
            transactionId: transaction,
            data: pendingData,
            params: paramsFromPayload(pendingData),
            elapsedMs: Date.now() - startedAt,
          };
          console.log(`[result] op=${hex(code)} response=${hex(container.code)} elapsed=${result.elapsedMs}ms data=${result.data.length}`);
          return result;
        }
      }
    }

    throw new Error(`command 0x${code.toString(16)} timed out after ${Date.now() - startedAt}ms`);
  }

  try {
    // A fresh port reset leaves no stale data. Avoid using endpoint.timeout here:
    // node-usb can surface a native callback exception when a timed-out transfer
    // is superseded by the next command.
    const drained = 0;
    if (drained > 0) console.log(`[drain] ${drained} bytes`);
    const opened = await command(0x1002, [1]);
    if (opened.responseCode !== 0x2001 && opened.responseCode !== 0x201e) {
      throw new Error(`OpenSession failed: ${opened.responseCode === null ? 'timeout' : hex(opened.responseCode)}`);
    }

    const deviceInfo = await command(0x1001);
    const appMode = await command(0x9435, [1], 8000);
    if (appMode.responseCode === 0x2001) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await command(0x90c8, [], 5000);
    const start = await command(0x9201, [], 15000);
    if (start.responseCode === 0x2001 || start.responseCode === 0x201e) {
      liveViewStarted = true;
      await command(0x90c8, [], 5000);
      for (let index = 0; index < 3; index += 1) {
        const frame = await command(0x9203, [], 15000);
        if (frame.responseCode === 0x2001 && frame.data.length) {
          const jpegOffset = frame.data.indexOf(Buffer.from([0xff, 0xd8]));
          console.log(`[frame] index=${index} bytes=${frame.data.length} jpegOffset=${jpegOffset}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
    console.log(`[summary] deviceInfoBytes=${deviceInfo.data.length} changeApplicationMode=${appMode.responseCode === null ? 'timeout' : hex(appMode.responseCode)} startLiveView=${start.responseCode === null ? 'timeout' : hex(start.responseCode)}`);
  } finally {
    if (liveViewStarted) {
      try { await command(0x9202, [], 3000); } catch {}
    }
    try { iface.release(true, () => {}); } catch {}
    try { device.close(); } catch {}
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  // libusb can keep a stalled transfer alive after a timeout. This is a
  // diagnostic CLI, so exit deterministically once the result is known.
  process.exit(1);
});
