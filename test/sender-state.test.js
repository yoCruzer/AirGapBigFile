'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sender = require('../src/sender-state.js');

const fakeFile = { name: 'x.bin', size: 10, slice() {} };
const prepared = {
  manifest: { filename: 'x.bin' },
  manifestBytes: new Uint8Array([1]),
  chunks: [{ index: 0, offset: 0, size: 10, sha256: 'x' }],
};

function readyState() {
  const state = sender.createSenderState();
  sender.beginPreparation(state, fakeFile);
  sender.updatePreparationProgress(state, 10, 1);
  sender.finishPreparation(state, prepared);
  return state;
}

test('models preparation progress and readiness', () => {
  const state = sender.createSenderState();
  sender.beginPreparation(state, fakeFile);
  assert.equal(state.status, sender.STATUS.PREPARING);
  sender.updatePreparationProgress(state, 5, 1);
  assert.equal(state.preparation.percentage, 50);
  sender.finishPreparation(state, prepared);
  assert.equal(state.status, sender.STATUS.READY);
  assert.equal(state.preparation.percentage, 100);
});

test('supports sending, pause, resume, and stop transitions', () => {
  const state = readyState();
  sender.startSending(state);
  sender.pauseSending(state);
  assert.equal(state.status, sender.STATUS.PAUSED);
  sender.resumeSending(state);
  sender.stopSending(state);
  assert.equal(state.status, sender.STATUS.READY);
});

test('focus mode is explicit sender intent, not receiver completion', () => {
  const state = readyState();
  sender.focusChunk(state, 0);
  assert.equal(state.mode, sender.MODE.FOCUS);
  assert.equal(state.focusedChunk, 0);
  assert.equal(Object.hasOwn(state, 'completedChunks'), false);
  assert.equal(Object.hasOwn(state, 'receiverVerifiedChunks'), false);
  sender.useSweepMode(state);
  assert.equal(state.mode, sender.MODE.SWEEP);
  assert.equal(state.focusedChunk, null);
});

test('rejects invalid transitions and focus indexes', () => {
  const state = sender.createSenderState();
  assert.throws(() => sender.startSending(state), /Cannot start/);
  const ready = readyState();
  assert.throws(() => sender.focusChunk(ready, 1), /outside/);
});

test('cancellation clears partial preparation state', () => {
  const state = sender.createSenderState();
  sender.beginPreparation(state, fakeFile);
  sender.cancelPreparation(state);
  assert.deepEqual(state, sender.createSenderState());
});
