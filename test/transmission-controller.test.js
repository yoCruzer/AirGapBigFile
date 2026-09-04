'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sender = require('../src/sender-state.js');
const controllerModule = require('../src/transmission-controller.js');

function preparedState(chunkCount = 10) {
  const state = sender.createSenderState();
  const file = { name: 'x.bin', size: chunkCount, slice() {} };
  sender.beginPreparation(state, file);
  sender.finishPreparation(state, {
    manifest: { filename: 'x.bin' },
    manifestBytes: new Uint8Array([1]),
    chunks: Array.from({ length: chunkCount }, (_, index) => ({ index, offset: index, size: 1, sha256: 'x' })),
  });
  return state;
}

function label(item) { return item.kind === 'manifest' ? 'M' : `C${item.index}`; }

test('focused resend is M,Ck repeated without receiver completion state', () => {
  const state = preparedState();
  const controller = controllerModule.createTransmissionController(state);
  controller.focus(7);
  controller.start();
  const sequence = Array.from({ length: 6 }, () => label(controller.nextUnit()));
  assert.deepEqual(sequence, ['M', 'C7', 'M', 'C7', 'M', 'C7']);
  assert.equal(Object.hasOwn(state, 'completedChunks'), false);
});

test('changing focused chunk restarts with a manifest beacon', () => {
  const state = preparedState();
  const controller = controllerModule.createTransmissionController(state);
  controller.start();
  assert.deepEqual([label(controller.nextUnit()), label(controller.nextUnit())], ['M', 'C0']);
  controller.focus(4);
  assert.deepEqual([label(controller.nextUnit()), label(controller.nextUnit())], ['M', 'C4']);
});

test('return to sweep continues from its saved position', () => {
  const state = preparedState(3);
  const controller = controllerModule.createTransmissionController(state);
  controller.start();
  assert.deepEqual([label(controller.nextUnit()), label(controller.nextUnit())], ['M', 'C0']);
  controller.focus(2);
  assert.deepEqual([label(controller.nextUnit()), label(controller.nextUnit())], ['M', 'C2']);
  controller.sweep();
  assert.deepEqual([label(controller.nextUnit()), label(controller.nextUnit())], ['M', 'C1']);
});

test('pause/resume returns the same active unit without advancing', () => {
  const state = preparedState();
  const controller = controllerModule.createTransmissionController(state);
  controller.start();
  const active = controller.nextUnit();
  controller.pause();
  assert.equal(controller.nextUnit(), null);
  assert.strictEqual(controller.resume(), active);
  assert.equal(label(controller.nextUnit()), 'C0');
});
