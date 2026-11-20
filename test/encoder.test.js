'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { initializeEncoder } = require('../src/encoder.js');

function encoderMock() {
  const blocks = [];
  const freed = [];
  const module = {
    HEAPU8: new Uint8Array(64),
    _malloc: () => 8,
    _free: pointer => freed.push(pointer),
    _cimbare_encode_bufsize: () => 4,
    _cimbare_init_encode: () => 0,
    _cimbare_encode(pointer, size) {
      blocks.push([...this.HEAPU8.slice(pointer, pointer + size)]);
      this.HEAPU8 = new Uint8Array(64);
      return size === 4 ? 1 : 0;
    },
  };
  return { module, blocks, freed };
}

test('ABI writer finalizes once for short, exact and partial blocks across heap changes', () => {
  for (const [length, sizes] of [[1, [1]], [4, [4, 0]], [9, [4, 4, 1]]]) {
    const { module, blocks, freed } = encoderMock();
    const bytes = Uint8Array.from({ length }, (_, i) => i + 11);
    initializeEncoder(module, 'x', 65535, bytes);
    assert.deepEqual(blocks.map(b => b.length), sizes);
    assert.deepEqual(blocks.flat(), [...bytes]);
    assert.deepEqual(freed, [8]);
  }
});

test('ABI errors stop feeding and release only owned allocations', () => {
  for (const [method, value] of [['_malloc', 0], ['_cimbare_encode_bufsize', 0],
    ['_cimbare_init_encode', -5], ['_cimbare_encode', -2], ['_cimbare_encode', 0]]) {
    const { module, freed } = encoderMock();
    module[method] = () => value;
    assert.throws(() => initializeEncoder(module, 'x', 128, new Uint8Array(9)), /libcimbar/);
    assert.deepEqual(freed, ['_malloc', '_cimbare_encode_bufsize'].includes(method) ? [] : [8]);
  }
});

test('pinned WASM restarts compressible data and continues fresh frames for dense data', async () => {
  const prefix = path.join(__dirname, '../vendor/cimbar-wasm-v0.6.4/cimbar_js.2026-01-20T0312');
  const module = { wasmBinary: fs.readFileSync(prefix + '.wasm') };
  const ready = new Promise((resolve, reject) => {
    module.onRuntimeInitialized = resolve;
    module.onAbort = reject;
  });
  vm.runInNewContext(fs.readFileSync(prefix + '.js', 'utf8'), { Module: module, console, TextDecoder, performance });
  await ready;
  const bytes = new Uint8Array(5 * 1024 * 1024);
  for (const dense of [false, true]) {
    if (dense) {
      let seed = 42;
      for (let i = 0; i < bytes.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        bytes[i] = seed & 255;
      }
    }
    initializeEncoder(module, 'part00.bin', 127, bytes);
    const sequence = Array.from({ length: 31 }, () => module._cimbare_next_frame(false));
    assert.equal(sequence[0], 1);
    if (dense) assert.deepEqual(sequence, Array.from({ length: 31 }, (_, i) => i + 1));
    else assert.ok(sequence.slice(1).includes(1));
  }
});
