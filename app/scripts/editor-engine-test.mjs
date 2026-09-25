import { buildChannelCurveLut } from '../src/editor/imageEngine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const identity = buildChannelCurveLut([0, 0, 0, 0, 0]);
assert(identity.length === 256, 'identity LUT must contain 256 samples');
for (let index = 0; index < identity.length; index += 1) {
  assert(identity[index] === index, `identity LUT mismatch at ${index}`);
}

const contrast = buildChannelCurveLut([-22, -10, 0, 12, 24]);
for (let index = 1; index < contrast.length; index += 1) {
  assert(contrast[index] >= contrast[index - 1], `curve must be monotonic at ${index}`);
}
assert(contrast[32] < identity[32], 'black-point control must darken shadows');
assert(contrast[224] > identity[224], 'white-point control must brighten highlights');

const invertLike = buildChannelCurveLut([100, 50, 0, -50, -100]);
for (let index = 1; index < invertLike.length; index += 1) {
  assert(invertLike[index] <= invertLike[index - 1], `reverse curve must remain monotonic at ${index}`);
}

console.log('editor engine tests passed');
