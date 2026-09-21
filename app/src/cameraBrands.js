/**
 * Camera brand adapters.
 *
 * Standard PTP properties can be shared across brands, while live view,
 * autofocus, capture and vendor properties must be enabled only by a real
 * adapter. Keeping those capabilities explicit prevents "rename the model"
 * code from pretending that unsupported cameras are fully compatible.
 */

export const CAMERA_BRANDS = Object.freeze({
  nikon: Object.freeze({
    id: 'nikon',
    label: 'Nikon',
    vendorExtensionId: 0x0000000A,
    usbVendors: [0x04B0],
    aliases: ['nikon', 'z 30', 'z30', 'z 50', 'z50', 'z fc', 'zfc'],
    status: 'verified',
    transport: 'PTP/IP + PTP over USB',
    capabilities: Object.freeze({
      standardProperties: true,
      vendorProperties: true,
      liveView: true,
      autofocus: true,
      capture: true,
      photoEnumeration: true,
    }),
  }),
  canon: Object.freeze({
    id: 'canon',
    label: 'Canon',
    vendorExtensionId: 0x0000000B,
    usbVendors: [0x04A9],
    aliases: ['canon', 'eos', 'powershot', 'ccapi'],
    status: 'experimental',
    transport: 'PTP + Canon CCAPI',
    capabilities: Object.freeze({
      standardProperties: true,
      vendorProperties: false,
      liveView: false,
      autofocus: false,
      capture: false,
      photoEnumeration: true,
    }),
  }),
  sony: Object.freeze({
    id: 'sony',
    label: 'Sony',
    vendorExtensionId: 0x00000011,
    usbVendors: [0x054C],
    aliases: ['sony', 'alpha', 'ilce', 'camera remote'],
    status: 'experimental',
    transport: 'PTP + Sony Camera Remote',
    capabilities: Object.freeze({
      standardProperties: true,
      vendorProperties: false,
      liveView: false,
      autofocus: false,
      capture: false,
      photoEnumeration: true,
    }),
  }),
  fujifilm: Object.freeze({
    id: 'fujifilm',
    label: 'Fujifilm',
    vendorExtensionId: 0x0000000F,
    usbVendors: [0x04CB],
    aliases: ['fujifilm', 'fuji', 'x-t', 'x-s', 'gfx'],
    status: 'experimental',
    transport: 'PTP + Fujifilm vendor extensions',
    capabilities: Object.freeze({
      standardProperties: true,
      vendorProperties: false,
      liveView: false,
      autofocus: false,
      capture: false,
      photoEnumeration: true,
    }),
  }),
  generic: Object.freeze({
    id: 'generic',
    label: '通用 PTP',
    vendorExtensionId: null,
    usbVendors: [],
    aliases: [],
    status: 'generic',
    transport: 'PTP / PTP-IP',
    capabilities: Object.freeze({
      standardProperties: true,
      vendorProperties: false,
      liveView: false,
      autofocus: false,
      capture: false,
      photoEnumeration: true,
    }),
  }),
});

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = /^0x/i.test(text) ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesText(brand, model) {
  const text = String(model || '').toLowerCase();
  return brand.aliases.some(alias => text.includes(alias));
}

/**
 * Detect a brand from model text, PTP vendor-extension ID, or USB vendor ID.
 * Precise protocol IDs take priority over human-readable model names.
 */
export function detectCameraBrand(input = {}) {
  const vendorExtensionId = parseNumber(input.vendorExtensionId);
  const usbVendorId = parseNumber(input.usbVendorId ?? input.vendorId);

  if (vendorExtensionId != null) {
    const byExtension = Object.values(CAMERA_BRANDS).find(
      brand => brand.vendorExtensionId === vendorExtensionId,
    );
    if (byExtension) return byExtension;
  }

  if (usbVendorId != null) {
    const byUsb = Object.values(CAMERA_BRANDS).find(
      brand => brand.usbVendors.includes(usbVendorId),
    );
    if (byUsb) return byUsb;
  }

  const model = String(input.model || '');
  const byName = Object.values(CAMERA_BRANDS).find(
    brand => brand.id !== 'generic' && matchesText(brand, model),
  );
  return byName || CAMERA_BRANDS.generic;
}

export function getBrandCapabilities(brandOrId) {
  const brand = typeof brandOrId === 'string'
    ? CAMERA_BRANDS[brandOrId] || CAMERA_BRANDS.generic
    : brandOrId || CAMERA_BRANDS.generic;
  return { brand, capabilities: brand.capabilities };
}

export function isNikonVendorCommandSupported(brandOrId) {
  const brand = typeof brandOrId === 'string'
    ? CAMERA_BRANDS[brandOrId] || CAMERA_BRANDS.generic
    : brandOrId || CAMERA_BRANDS.generic;
  return brand.id === 'nikon';
}

export function brandSummary(brandOrId) {
  const { brand, capabilities } = getBrandCapabilities(brandOrId);
  return {
    id: brand.id,
    label: brand.label,
    status: brand.status,
    transport: brand.transport,
    capabilities: { ...capabilities },
  };
}
