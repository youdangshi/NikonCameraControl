import {
  assertAdapterCommand,
  getAdapterCatalog,
  getCameraAdapter,
} from '../src/cameraAdapters.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(getCameraAdapter('nikon').commands.startLiveView === 0x9201, 'Nikon live view opcode mismatch');
assert(getCameraAdapter('canon').commands.getViewFinderData === 0x9153, 'Canon viewfinder opcode mismatch');
assert(getCameraAdapter('sony').vendorCommandsEnabled === false, 'Sony vendor commands must stay disabled');
assert(getCameraAdapter('fujifilm').vendorCommandsEnabled === false, 'Fujifilm vendor commands must stay disabled');
assert(assertAdapterCommand('nikon', 'capture') === 0x9207, 'Nikon capture should be enabled');

let blocked = false;
try { assertAdapterCommand('canon', 'getViewFinderData'); } catch { blocked = true; }
assert(blocked, 'unverified Canon vendor command must be blocked');
assert(getAdapterCatalog().some(adapter => adapter.status === 'verified'), 'catalog needs a verified adapter');

console.log('camera adapter tests passed');
