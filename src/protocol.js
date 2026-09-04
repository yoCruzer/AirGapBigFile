(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MANIFEST_VERSION = 1;
  const MANIFEST_TOOL = 'cimbar-bigfile';
  const MAX_CHUNK_COUNT = 120;
  const CHUNK_SIZE_5_MIB = 5 * 1024 * 1024;
  const CHUNK_SIZE_10_MIB = 10 * 1024 * 1024;
  const PROFILE_CHUNK_SIZES = Object.freeze([CHUNK_SIZE_5_MIB, CHUNK_SIZE_10_MIB]);
  const SHA256_RE = /^[0-9a-f]{64}$/;

  function assertSafeNonNegative(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer`);
    }
  }

  function chunkCountFor(fileSize, chunkSize) {
    assertSafeNonNegative(fileSize, 'fileSize');
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new TypeError('chunkSize must be a positive safe integer');
    }
    return Math.max(1, Math.ceil(fileSize / chunkSize));
  }

  function selectProfileChunkSize(fileSize, requestedSize) {
    assertSafeNonNegative(fileSize, 'fileSize');
    if (requestedSize !== undefined && !PROFILE_CHUNK_SIZES.includes(requestedSize)) {
      throw new RangeError('AirGap BigFile v1 supports only 5 MiB or 10 MiB chunks');
    }

    const candidates = requestedSize === undefined
      ? PROFILE_CHUNK_SIZES
      : [requestedSize];
    for (const size of candidates) {
      if (chunkCountFor(fileSize, size) <= MAX_CHUNK_COUNT) return size;
    }

    if (requestedSize === CHUNK_SIZE_5_MIB &&
        chunkCountFor(fileSize, CHUNK_SIZE_10_MIB) <= MAX_CHUNK_COUNT) {
      return CHUNK_SIZE_10_MIB;
    }
    throw new RangeError('File exceeds the AirGap BigFile v1 limit of 120 × 10 MiB');
  }

  function randomEncodeIdBase(cryptoObject) {
    const source = cryptoObject || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!source || typeof source.getRandomValues !== 'function') {
      throw new Error('Cryptographic randomness is unavailable');
    }
    return source.getRandomValues(new Uint16Array(1))[0];
  }

  function logicalEncodeId(base, logicalOffset) {
    assertSafeNonNegative(base, 'base');
    assertSafeNonNegative(logicalOffset, 'logicalOffset');
    if (base > 0xFFFF) throw new RangeError('base must fit unsigned 16 bits');
    return (base + logicalOffset) & 0xFFFF;
  }

  function wireId(base, logicalOffset) {
    assertSafeNonNegative(base, 'base');
    assertSafeNonNegative(logicalOffset, 'logicalOffset');
    if (base > 0xFFFF) throw new RangeError('base must fit unsigned 16 bits');
    return ((base & 0x7F) + (logicalOffset & 0x7F)) & 0x7F;
  }

  function validateManifest(manifest, options) {
    const profile = !options || options.profile !== false;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new TypeError('manifest must be an object');
    }
    if (manifest.version !== MANIFEST_VERSION) throw new Error('unsupported manifest version');
    if (manifest.tool !== MANIFEST_TOOL) throw new Error('unsupported manifest tool');
    if (typeof manifest.filename !== 'string' || manifest.filename.length === 0) {
      throw new Error('filename must be a non-empty string');
    }
    assertSafeNonNegative(manifest.total_size, 'total_size');
    if (!SHA256_RE.test(manifest.sha256)) throw new Error('invalid whole-file SHA-256');
    if (!Number.isSafeInteger(manifest.chunk_size) || manifest.chunk_size <= 0) {
      throw new Error('chunk_size must be a positive safe integer');
    }
    if (profile && !PROFILE_CHUNK_SIZES.includes(manifest.chunk_size)) {
      throw new Error('chunk_size is outside the AirGap BigFile v1 profile');
    }
    if (!Number.isSafeInteger(manifest.chunk_count) ||
        manifest.chunk_count < 1 || manifest.chunk_count > MAX_CHUNK_COUNT) {
      throw new Error(`chunk_count must be between 1 and ${MAX_CHUNK_COUNT}`);
    }
    if (!Number.isSafeInteger(manifest.encode_id_base) ||
        manifest.encode_id_base < 0 || manifest.encode_id_base > 0xFFFF) {
      throw new Error('encode_id_base must be an unsigned 16-bit integer');
    }
    if (!Array.isArray(manifest.chunks) || manifest.chunks.length !== manifest.chunk_count) {
      throw new Error('chunks length must equal chunk_count');
    }

    let sizeSum = 0;
    manifest.chunks.forEach((chunk, index) => {
      if (!chunk || chunk.index !== index) throw new Error(`chunk ${index} index mismatch`);
      if (!Number.isSafeInteger(chunk.size) || chunk.size < 0 || chunk.size > manifest.chunk_size) {
        throw new Error(`chunk ${index} has invalid size`);
      }
      if (index < manifest.chunk_count - 1 && chunk.size !== manifest.chunk_size) {
        throw new Error(`chunk ${index} must have the declared chunk_size`);
      }
      if (!SHA256_RE.test(chunk.sha256)) throw new Error(`chunk ${index} has invalid SHA-256`);
      sizeSum += chunk.size;
    });
    if (sizeSum !== manifest.total_size) throw new Error('chunk metadata size does not match total_size');
    return manifest;
  }

  function createManifest(input) {
    const manifest = {
      version: MANIFEST_VERSION,
      tool: MANIFEST_TOOL,
      filename: input.filename,
      total_size: input.totalSize,
      sha256: input.sha256,
      chunk_size: input.chunkSize,
      chunk_count: input.chunks.length,
      encode_id_base: input.encodeIdBase,
      chunks: input.chunks.map(({ index, size, sha256 }) => ({ index, size, sha256 })),
    };
    return validateManifest(manifest);
  }

  function partFilename(filename, index, chunkCount) {
    const dot = filename.lastIndexOf('.');
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    const width = Math.max(2, String(chunkCount - 1).length);
    return `${base}.part${String(index).padStart(width, '0')}.bin`;
  }

  return {
    MANIFEST_VERSION,
    MANIFEST_TOOL,
    MAX_CHUNK_COUNT,
    CHUNK_SIZE_5_MIB,
    CHUNK_SIZE_10_MIB,
    PROFILE_CHUNK_SIZES,
    chunkCountFor,
    selectProfileChunkSize,
    randomEncodeIdBase,
    logicalEncodeId,
    wireId,
    validateManifest,
    createManifest,
    partFilename,
  };
});
