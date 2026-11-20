(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function initializeEncoder(module, filename, encodeId, bytes) {
    const name = new TextEncoder().encode(filename);
    const blockSize = module._cimbare_encode_bufsize();
    if (!Number.isSafeInteger(blockSize) || blockSize <= 0) throw new Error('Invalid libcimbar buffer size');
    const pointer = module._malloc(Math.max(name.length, blockSize));
    if (!pointer) throw new Error('libcimbar allocation failed');
    try {
      module.HEAPU8.set(name, pointer);
      if (module._cimbare_init_encode(pointer, name.length, encodeId) !== 0) {
        throw new Error('libcimbar initialization failed');
      }
      // v0.6.4 finalizes on the first short block. An exact multiple
      // needs a final zero-length call. The heap can grow between calls.
      for (let offset = 0; offset <= bytes.length; offset += blockSize) {
        const block = bytes.subarray(offset, offset + blockSize);
        module.HEAPU8.set(block, pointer);
        const result = module._cimbare_encode(pointer, block.length);
        const final = block.length < blockSize;
        if (result !== (final ? 0 : 1)) throw new Error('libcimbar encoding failed');
        if (final) break;
      }
    } finally {
      module._free(pointer);
    }
  }

  return { initializeEncoder };
});
