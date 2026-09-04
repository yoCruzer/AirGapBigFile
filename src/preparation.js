(function (root, factory) {
  const isCommonJs = typeof module === 'object' && module.exports;
  const protocol = isCommonJs ? require('./protocol.js') : root.AirGapBigFile;
  const sha256 = isCommonJs ? require('../vendor/js-sha256-0.11.1/sha256.js') : root.sha256;
  const api = factory(protocol, sha256);
  if (isCommonJs) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (protocol, sha256) {
  'use strict';

  function abortError() {
    const error = new Error('File preparation was cancelled');
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw abortError();
  }

  function defaultYield() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function readBlobRange(file, offset, size) {
    const blob = file.slice(offset, offset + size);
    const buffer = await blob.arrayBuffer();
    if (buffer.byteLength !== size) {
      throw new Error(`Short ranged read at ${offset}: expected ${size}, got ${buffer.byteLength}`);
    }
    return new Uint8Array(buffer);
  }

  async function prepareFileByRanges(file, options) {
    const config = options || {};
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0) {
      throw new TypeError('A File/Blob-like input is required');
    }
    if (!sha256 || typeof sha256.create !== 'function') {
      throw new Error('Incremental SHA-256 dependency is unavailable');
    }

    const chunkSize = protocol.selectProfileChunkSize(file.size, config.chunkSize);
    const chunkCount = protocol.chunkCountFor(file.size, chunkSize);
    const encodeIdBase = config.encodeIdBase === undefined
      ? protocol.randomEncodeIdBase(config.cryptoObject)
      : config.encodeIdBase;
    const onProgress = typeof config.onProgress === 'function' ? config.onProgress : function () {};
    const yieldControl = typeof config.yieldControl === 'function' ? config.yieldControl : defaultYield;
    const wholeHasher = sha256.create();
    const chunks = [];
    let hashedBytes = 0;

    for (let index = 0; index < chunkCount; index += 1) {
      throwIfAborted(config.signal);
      const offset = index * chunkSize;
      const size = Math.min(chunkSize, Math.max(0, file.size - offset));
      const bytes = await readBlobRange(file, offset, size);
      throwIfAborted(config.signal);

      wholeHasher.update(bytes);
      const chunkSha = sha256.create().update(bytes).hex();
      chunks.push({ index, offset, size, sha256: chunkSha });
      hashedBytes += size;
      onProgress({
        hashedBytes,
        totalBytes: file.size,
        currentChunk: index + 1,
        chunkCount,
        percentage: file.size === 0 ? 100 : (hashedBytes / file.size) * 100,
      });

      // Drop the only local reference to `bytes` before yielding to the browser.
      await yieldControl();
    }

    throwIfAborted(config.signal);
    const manifest = protocol.createManifest({
      filename: file.name || 'unnamed.bin',
      totalSize: file.size,
      sha256: wholeHasher.hex(),
      chunkSize,
      encodeIdBase,
      chunks,
    });
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    return { file, manifest, manifestBytes, chunks };
  }

  async function loadChunk(file, descriptor) {
    if (!descriptor || !Number.isSafeInteger(descriptor.offset) || !Number.isSafeInteger(descriptor.size)) {
      throw new TypeError('A valid chunk descriptor is required');
    }
    return readBlobRange(file, descriptor.offset, descriptor.size);
  }

  return { prepareFileByRanges, loadChunk };
});
