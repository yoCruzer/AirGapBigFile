// Bounded paired benchmark against a historical preparation implementation.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash, webcrypto } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const baseline = process.argv[2] || '5ac634d';
const protocol = require('../src/protocol.js');
const sha256 = require('../vendor/js-sha256-0.11.1/sha256.js');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function load(source) {
  const ctx = { AirGapBigFile: { ...protocol }, sha256, crypto: webcrypto, TextEncoder, Uint8Array };
  vm.runInNewContext(source, ctx);
  return ctx.AirGapBigFile.prepareFileByRanges;
}

async function run() {
  const versions = [
    load(execFileSync('git', ['show', baseline + ':src/preparation.js'], { cwd: root, encoding: 'utf8' })),
    load(fs.readFileSync(path.join(root, 'src/preparation.js'), 'utf8')),
  ];
  for (const mib of [5, 20]) {
    const bytes = Buffer.alloc(mib * 1024 * 1024, 83);
    const file = new File([bytes], 'synthetic.bin');
    const truth = digest(bytes);
    const samples = [[], []];
    for (let round = 0; round <= 7; round++) {
      for (const index of round % 2 ? [1, 0] : [0, 1]) {
        const start = performance.now();
        const result = await versions[index](file, { encodeIdBase: 1, yieldControl() {} });
        const elapsed = performance.now() - start;
        assert.equal(result.manifest.sha256, truth);
        for (const chunk of result.chunks) {
          assert.equal(chunk.sha256, digest(bytes.subarray(chunk.offset, chunk.offset + chunk.size)));
        }
        if (round > 0) samples[index].push(elapsed);
      }
    }
    const median = samples.map(times => times.sort((a, b) => a - b)[3].toFixed(2));
    console.log(mib + ' MiB, median of 7 pairs (ms), ' + baseline + ' / working tree: ' + median.join(' / '));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
