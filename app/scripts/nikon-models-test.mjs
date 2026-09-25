import {
  detectNikonModel,
  extractPtpStrings,
  getNikonModelCatalog,
} from '../src/nikonModels.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(detectNikonModel('Z 30').id === 'z30', 'Z 30 should map to verified model');
assert(detectNikonModel('Nikon Z 6_2').id === 'z6ii', 'Z 6_2 should map to Z6II');
assert(detectNikonModel('unknown camera').id === 'nikon-generic', 'unknown model should stay generic');
assert(getNikonModelCatalog().every(model => model.status !== 'verified' || model.id === 'z30'), 'only Z30 may be marked verified');

const text = 'Nikon Corporation\0Z 30\0V1.20';
const payload = new Uint8Array(text.length * 2);
for (let index = 0; index < text.length; index += 1) {
  payload[index * 2] = text.charCodeAt(index) & 0xff;
  payload[index * 2 + 1] = text.charCodeAt(index) >> 8;
}
const extracted = extractPtpStrings(payload);
assert(extracted.includes('Nikon Corporation'), 'must extract manufacturer');
assert(extracted.includes('Z 30'), 'must extract camera model');
assert(extracted.includes('V1.20'), 'must extract firmware version');

console.log('nikon model tests passed');
