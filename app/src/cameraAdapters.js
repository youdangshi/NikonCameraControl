import { CAMERA_BRANDS } from './cameraBrands.js';

export const CAMERA_OPERATION_CODES = Object.freeze({
  getDeviceInfo: 0x1001,
  openSession: 0x1002,
  closeSession: 0x1003,
  getStorageIds: 0x1004,
  getObjectHandles: 0x1007,
  getObjectInfo: 0x1008,
  getObject: 0x1009,
  getThumbnail: 0x100A,
  initiateCapture: 0x100E,
  getDevicePropDesc: 0x1014,
  getDevicePropValue: 0x1015,
  setDevicePropValue: 0x1016,
});

const NIKON_COMMANDS = Object.freeze({
  ...CAMERA_OPERATION_CODES,
  startLiveView: 0x9201,
  endLiveView: 0x9202,
  getLiveViewImage: 0x9203,
  afDrive: 0x90C1,
  deviceReady: 0x90C8,
  changeApplicationMode: 0x9435,
  capture: 0x9207,
});

/**
 * Canon EOS operation codes are documented by libgphoto2/Canon EOS captures.
 * They are kept in the adapter for diagnostics and future hardware validation,
 * but vendor commands stay disabled until a Canon body is tested end to end.
 */
const CANON_COMMANDS = Object.freeze({
  ...CAMERA_OPERATION_CODES,
  getDeviceInfoEx: 0x9108,
  setDevicePropValueEx: 0x9110,
  setRemoteMode: 0x9114,
  remoteReleaseOn: 0x9128,
  remoteReleaseOff: 0x9129,
  getViewFinderData: 0x9153,
  doAf: 0x9154,
});

const ADAPTERS = Object.freeze({
  nikon: Object.freeze({
    id: 'nikon',
    label: 'Nikon Adapter',
    status: 'verified',
    commands: NIKON_COMMANDS,
    capabilities: CAMERA_BRANDS.nikon.capabilities,
    vendorCommandsEnabled: true,
    reference: 'Nikon PTP vendor operations validated on Z30.',
  }),
  canon: Object.freeze({
    id: 'canon',
    label: 'Canon EOS Adapter',
    status: 'source-derived',
    commands: CANON_COMMANDS,
    capabilities: Object.freeze({
      ...CAMERA_BRANDS.canon.capabilities,
      vendorProperties: true,
    }),
    vendorCommandsEnabled: false,
    reference: 'Canon EOS operation codes cross-checked against libgphoto2 camera dumps.',
  }),
  sony: Object.freeze({
    id: 'sony',
    label: 'Sony Adapter',
    status: 'discovery-only',
    commands: CAMERA_OPERATION_CODES,
    capabilities: CAMERA_BRANDS.sony.capabilities,
    vendorCommandsEnabled: false,
    reference: 'Sony remote-control command sequences vary by generation; no unverified command is enabled.',
  }),
  fujifilm: Object.freeze({
    id: 'fujifilm',
    label: 'Fujifilm Adapter',
    status: 'discovery-only',
    commands: CAMERA_OPERATION_CODES,
    capabilities: CAMERA_BRANDS.fujifilm.capabilities,
    vendorCommandsEnabled: false,
    reference: 'Fujifilm X/GFX PTP extensions require model-specific validation.',
  }),
  generic: Object.freeze({
    id: 'generic',
    label: 'Generic PTP Adapter',
    status: 'generic',
    commands: CAMERA_OPERATION_CODES,
    capabilities: CAMERA_BRANDS.generic.capabilities,
    vendorCommandsEnabled: false,
    reference: 'ISO 15740 common operations only.',
  }),
});

export function getCameraAdapter(brandOrId) {
  const id = typeof brandOrId === 'string' ? brandOrId : brandOrId?.id;
  return ADAPTERS[id] || ADAPTERS.generic;
}

export function getAdapterCatalog() {
  return Object.values(ADAPTERS);
}

export function assertAdapterCommand(adapterOrId, commandName) {
  const adapter = getCameraAdapter(adapterOrId);
  const opCode = adapter.commands[commandName];
  if (opCode == null) throw new Error(`${adapter.label} 未实现 ${commandName}`);
  if (!adapter.vendorCommandsEnabled && opCode >= 0x9000) {
    throw new Error(`${adapter.label} 的厂商扩展命令仍处于未验证状态，已阻止发送。`);
  }
  return opCode;
}
