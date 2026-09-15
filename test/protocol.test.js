'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const protocol = require('../src/protocol.js');

const H = '0'.repeat(64);

function validManifest(overrides = {}) {
  return {
    version: 1,
    tool: 'cimbar-bigfile',
    filename: 'example.bin',
    total_size: 6 * 1024 * 1024,
    sha256: H,
    chunk_size: protocol.CHUNK_SIZE_5_MIB,
    chunk_count: 2,
    encode_id_base: 12345,
    chunks: [
      { index: 0, size: protocol.CHUNK_SIZE_5_MIB, sha256: H },
      { index: 1, size: 1024 * 1024, sha256: H },
    ],
    ...overrides,
  };
}

test('validates the v1 profile manifest', () => {
  assert.equal(protocol.validateManifest(validManifest()).tool, 'cimbar-bigfile');
});

test('rejects wrong tool and version', () => {
  assert.throws(() => protocol.validateManifest(validManifest({ tool: 'airgap-bigfile' })), /tool/);
  assert.throws(() => protocol.validateManifest(validManifest({ version: 2 })), /version/);
});

test('rejects more than 120 chunks', () => {
  const chunks = Array.from({ length: 121 }, (_, index) => ({ index, size: 1, sha256: H }));
  assert.throws(() => protocol.validateManifest(validManifest({
    total_size: 121,
    chunk_size: 1,
    chunk_count: 121,
    chunks,
  }), { profile: false }), /chunk_count/);
});

test('rejects inconsistent chunk metadata', () => {
  const manifest = validManifest();
  manifest.chunks[1].size = 1;
  assert.throws(() => protocol.validateManifest(manifest), /total_size/);
});

test('rejects zero-byte manifests and zero-size chunks', () => {
  assert.throws(() => protocol.validateManifest(validManifest({ total_size: 0 })), /total_size.*positive/);
  const manifest = validManifest();
  manifest.chunks[1].size = 0;
  manifest.total_size = protocol.CHUNK_SIZE_5_MIB;
  assert.throws(() => protocol.validateManifest(manifest), /chunk 1.*invalid size/);
  assert.throws(() => protocol.chunkCountFor(0, protocol.CHUNK_SIZE_5_MIB), /fileSize.*positive/);
});

test('matches AirGapFree logical filename safety rules', () => {
  for (const filename of ['', '.', '..', 'dir/file.bin', 'dir\\file.bin', 'line\nbreak.bin',
    'nul\0byte.bin', 'delete\u007f.bin', 'control\u0085.bin', 'soft\u00adhyphen.bin',
    'left\u200emark.bin', 'isolate\u2066control.bin']) {
    assert.equal(protocol.isSafeLogicalFilename(filename), false, JSON.stringify(filename));
    assert.throws(() => protocol.validateManifest(validManifest({ filename })), /filename.*safe/);
  }
  assert.equal(protocol.isSafeLogicalFilename('传输文件.bin'), true);
  assert.equal(protocol.validateManifest(validManifest({ filename: '传输文件.bin' })).filename, '传输文件.bin');
});

test('selects a compatible profile chunk size', () => {
  assert.equal(protocol.selectProfileChunkSize(120 * protocol.CHUNK_SIZE_5_MIB), protocol.CHUNK_SIZE_5_MIB);
  assert.equal(protocol.selectProfileChunkSize(121 * protocol.CHUNK_SIZE_5_MIB), protocol.CHUNK_SIZE_10_MIB);
  assert.throws(() => protocol.selectProfileChunkSize(120 * protocol.CHUNK_SIZE_10_MIB + 1), /exceeds/);
});

test('uses cryptographic randomness for the unsigned base', () => {
  let called = false;
  const fakeCrypto = { getRandomValues(view) { called = true; view[0] = 65535; return view; } };
  assert.equal(protocol.randomEncodeIdBase(fakeCrypto), 65535);
  assert.equal(called, true);
});

test('logical and wire IDs wrap at their respective boundaries', () => {
  const cases = [
    [0, 0, 0, 0],
    [127, 1, 128, 0],
    [128, 127, 255, 127],
    [65530, 5, 65535, 127],
    [65530, 6, 0, 0],
    [65535, 1, 0, 0],
    [65535, 129, 128, 0],
  ];
  for (const [base, offset, logical, wire] of cases) {
    assert.equal(protocol.logicalEncodeId(base, offset), logical, `logical base=${base} offset=${offset}`);
    assert.equal(protocol.wireId(base, offset), wire, `wire base=${base} offset=${offset}`);
  }
});

test('golden fixture matches hashes and ID mapping', () => {
  const fixtureDir = path.join(__dirname, '..', 'protocol', 'fixtures', 'v1');
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'));
  protocol.validateManifest(manifest, { profile: false });
  const parts = manifest.chunks.map((chunk, index) => {
    const data = fs.readFileSync(path.join(fixtureDir, `part0${index}.bin`));
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), chunk.sha256);
    assert.equal(protocol.logicalEncodeId(manifest.encode_id_base, index + 1), 65531 + index);
    assert.equal(protocol.wireId(manifest.encode_id_base, index + 1), 123 + index);
    return data;
  });
  assert.equal(
    crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex'),
    manifest.sha256,
  );
});
