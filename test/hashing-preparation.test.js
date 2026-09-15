'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sha256 = require('../vendor/js-sha256-0.11.1/sha256.js');
const protocol = require('../src/protocol.js');
const preparation = require('../src/preparation.js');

test('vendored incremental SHA-256 passes standard vectors', () => {
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['The quick brown fox jumps over the lazy dog', 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
  ];
  for (const [input, expected] of vectors) {
    const incremental = sha256.create();
    for (const byte of Buffer.from(input)) incremental.update(Uint8Array.of(byte));
    assert.equal(incremental.hex(), expected);
  }
});

test('vendored SHA-256 matches Node crypto for representative bytes', () => {
  const bytes = crypto.createHash('sha256').update('deterministic seed').digest();
  assert.equal(sha256(bytes), crypto.createHash('sha256').update(bytes).digest('hex'));
});

test('golden fixture whole hash is incremental across chunks', () => {
  const fixtureDir = path.join(__dirname, '..', 'protocol', 'fixtures', 'v1');
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'));
  const hasher = sha256.create();
  hasher.update(fs.readFileSync(path.join(fixtureDir, 'part00.bin')));
  hasher.update(fs.readFileSync(path.join(fixtureDir, 'part01.bin')));
  assert.equal(hasher.hex(), manifest.sha256);
});

test('preparation uses bounded slice reads and stores descriptors only', async () => {
  const chunkSize = protocol.CHUNK_SIZE_5_MIB;
  const source = Buffer.alloc(chunkSize + 17);
  for (let index = 0; index < source.length; index += 1) source[index] = index % 251;
  const ranges = [];
  let wholeFileReadAttempted = false;
  const file = {
    name: 'synthetic.bin',
    size: source.length,
    async arrayBuffer() {
      wholeFileReadAttempted = true;
      throw new Error('whole-file read forbidden');
    },
    slice(start, end) {
      ranges.push([start, end]);
      const view = source.subarray(start, end);
      return { async arrayBuffer() { return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength); } };
    },
  };
  const progress = [];
  const result = await preparation.prepareFileByRanges(file, {
    chunkSize,
    encodeIdBase: 123,
    onProgress: (value) => progress.push(value),
    yieldControl: async () => {},
  });

  assert.equal(wholeFileReadAttempted, false);
  assert.deepEqual(ranges, [[0, chunkSize], [chunkSize, chunkSize + 17]]);
  assert.equal(Math.max(...ranges.map(([start, end]) => end - start)), chunkSize);
  assert.equal(result.chunks.length, 2);
  assert.equal(result.chunks.some((chunk) => Object.hasOwn(chunk, 'bytes')), false);
  assert.equal(result.manifest.sha256, crypto.createHash('sha256').update(source).digest('hex'));
  assert.equal(result.manifest.chunks[0].sha256,
    crypto.createHash('sha256').update(source.subarray(0, chunkSize)).digest('hex'));
  assert.equal(progress.at(-1).percentage, 100);
});

test('preparation can be cancelled between ranged reads', async () => {
  const chunkSize = protocol.CHUNK_SIZE_5_MIB;
  const controller = new AbortController();
  let reads = 0;
  const file = {
    name: 'cancel.bin',
    size: chunkSize + 1,
    slice(start, end) {
      reads += 1;
      const buffer = new ArrayBuffer(end - start);
      return { async arrayBuffer() { return buffer; } };
    },
  };
  await assert.rejects(
    preparation.prepareFileByRanges(file, {
      chunkSize,
      encodeIdBase: 1,
      signal: controller.signal,
      yieldControl: async () => controller.abort(),
    }),
    { name: 'AbortError' },
  );
  assert.equal(reads, 1);
});

test('preparation rejects an empty file before any ranged read', async () => {
  let reads = 0;
  const file = {
    name: 'empty.bin',
    size: 0,
    slice() { reads += 1; throw new Error('must not read'); },
  };
  await assert.rejects(preparation.prepareFileByRanges(file, { encodeIdBase: 1 }), /empty file/);
  assert.equal(reads, 0);
});

test('preparation rejects an unsafe filename before hashing', async () => {
  let reads = 0;
  const file = {
    name: '../unsafe.bin',
    size: 1,
    slice() { reads += 1; throw new Error('must not read'); },
  };
  await assert.rejects(preparation.prepareFileByRanges(file, { encodeIdBase: 1 }), /filename.*safe/);
  assert.equal(reads, 0);
});
