import assert from 'node:assert/strict';
import {
  CAMERA_BRANDS,
  detectCameraBrand,
  getBrandCapabilities,
  isNikonVendorCommandSupported,
  brandSummary,
} from '../src/cameraBrands.js';
import { PTP_PROP, encodePropValue, decodePropValue } from '../src/nikonProperties.js';
import { PtpIpSession } from '../src/ptpip.js';
import { FakeNikonCamera } from './fake-camera.mjs';

const detectionCases = [
  ['Nikon Z30', null, 0x04B0, 'nikon'],
  ['Canon EOS R6', null, null, 'canon'],
  ['ILCE-7M4', null, null, 'sony'],
  ['Fujifilm X-T5', null, null, 'fujifilm'],
  ['Unknown PTP camera', 0x0000000B, null, 'canon'],
  ['Unknown PTP camera', null, 0x054C, 'sony'],
  ['Unknown PTP camera', null, null, 'generic'],
];

for (const [model, vendorExtensionId, usbVendorId, expected] of detectionCases) {
  const detected = detectCameraBrand({ model, vendorExtensionId, usbVendorId });
  assert.equal(detected.id, expected, `${model} should detect as ${expected}`);
}

assert.equal(getBrandCapabilities('nikon').capabilities.liveView, true, 'Nikon live view is implemented');
assert.equal(getBrandCapabilities('canon').capabilities.liveView, false, 'Canon live view must not be claimed before implementation');
assert.equal(getBrandCapabilities('sony').capabilities.vendorProperties, false, 'Sony vendor properties must remain disabled');
assert.equal(isNikonVendorCommandSupported('nikon'), true, 'Nikon vendor commands stay enabled for Nikon');
assert.equal(isNikonVendorCommandSupported('canon'), false, 'Nikon vendor commands must never be sent to Canon');

const canon = brandSummary('canon');
assert.equal(canon.status, 'experimental', 'Canon adapter should be marked experimental');
assert.match(canon.transport, /CCAPI/, 'Canon transport should document CCAPI');

const standardProperties = [
  PTP_PROP.ExposureProgramMode,
  PTP_PROP.ExposureIndex,
  PTP_PROP.ExposureTime,
  PTP_PROP.FNumber,
  PTP_PROP.WhiteBalance,
  PTP_PROP.ExposureMeteringMode,
  PTP_PROP.ExposureBiasCompensation,
];

for (const [model, usbVendorId] of [['Canon EOS R6', 0x04A9], ['Sony ILCE-7M4', 0x054C]]) {
  const brand = detectCameraBrand({ model, usbVendorId });
  const camera = new FakeNikonCamera({ model, defaultPropertiesOnly: true });
  const session = new PtpIpSession(camera.createIpTransport(), { onDiagnose: () => {} });
  await session.open('127.0.0.1', 15740);

  for (const propCode of standardProperties) {
    const initial = await session.command(0x1015, [propCode], 1000);
    assert.equal(initial.responseCode, 0x2001, `${brand.label} standard PTP read should work in simulation`);
    assert.equal(
      decodePropValue(initial.payload, propCode),
      camera.getProperty(propCode),
      `${brand.label} standard property should match`,
    );
  }

  const targetIso = 640;
  const write = await session.command(
    0x1016,
    [PTP_PROP.ExposureIndex],
    1000,
    encodePropValue(PTP_PROP.ExposureIndex, targetIso),
  );
  assert.equal(write.responseCode, 0x2001, `${brand.label} standard PTP write should work in simulation`);
  assert.equal(camera.getProperty(PTP_PROP.ExposureIndex), targetIso, `${brand.label} simulated write should apply`);
  await session.close();
}

assert.equal(CAMERA_BRANDS.generic.capabilities.vendorProperties, false, 'generic adapter must stay conservative');

console.log('brand adapter tests passed');
