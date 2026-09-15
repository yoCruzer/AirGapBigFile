'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sender = require('../src/sender-state.js');
const controllerModule = require('../src/transmission-controller.js');
const lifecycleModule = require('../src/unit-lifecycle.js');

function readyState(chunkCount = 2) {
  const state = sender.createSenderState();
  sender.beginPreparation(state, { name: 'x.bin', size: chunkCount, slice() {} });
  sender.finishPreparation(state, {
    manifest: { filename: 'x.bin' },
    manifestBytes: new Uint8Array([1]),
    chunks: Array.from({ length: chunkCount }, (_, index) => ({ index, offset: index, size: 1, sha256: 'x' })),
  });
  return state;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function label(item) { return item.kind === 'manifest' ? 'M' : `C${item.index}`; }

test('Pause then Resume joins a pending chunk initialization without advancing', async () => {
  const state = readyState();
  const controller = controllerModule.createTransmissionController(state);
  controller.start();
  const chunkLoad = deferred();
  const initialized = [];
  const lifecycle = lifecycleModule.createAsyncUnitLifecycle({
    nextUnit: controller.nextUnit,
    loadUnit(item) {
      return item.kind === 'chunk' ? chunkLoad.promise : Promise.resolve('manifest bytes');
    },
    initializeUnit(item) {
      initialized.push(label(item));
      return label(item);
    },
  });

  await lifecycle.ensureInitialized();
  assert.deepEqual(initialized, ['M']);

  const pendingChunk = lifecycle.advance();
  assert.equal(label(lifecycle.snapshot().pendingItem), 'C0');
  controller.pause();
  controller.resume();
  const resumedInitialization = lifecycle.ensureInitialized();
  assert.strictEqual(resumedInitialization, pendingChunk);

  chunkLoad.resolve('chunk 0 bytes');
  const [firstResult, resumedResult] = await Promise.all([pendingChunk, resumedInitialization]);
  assert.strictEqual(firstResult, resumedResult);
  assert.deepEqual(initialized, ['M', 'C0']);
  assert.equal(label(lifecycle.snapshot().initializedItem), 'C0');

  const schedulerState = controller.snapshot().scheduler;
  assert.equal(label(schedulerState.current), 'C0');
  assert.equal(schedulerState.phase, 'manifest');
  assert.equal(schedulerState.nextSweepChunk, 1);

  await lifecycle.ensureInitialized();
  assert.deepEqual(initialized, ['M', 'C0']);
  await lifecycle.advance();
  assert.deepEqual(initialized, ['M', 'C0', 'M']);
});

test('Resume of an initialized stream reuses it without reinitializing', async () => {
  const state = readyState();
  const controller = controllerModule.createTransmissionController(state);
  controller.start();
  let initializeCount = 0;
  const lifecycle = lifecycleModule.createAsyncUnitLifecycle({
    nextUnit: controller.nextUnit,
    loadUnit: async () => 'bytes',
    initializeUnit: () => { initializeCount += 1; },
  });

  const initialized = await lifecycle.ensureInitialized();
  controller.pause();
  controller.resume();
  const resumed = await lifecycle.ensureInitialized();
  assert.strictEqual(resumed, initialized);
  assert.equal(initializeCount, 1);
  assert.equal(label(controller.snapshot().scheduler.current), 'M');
});

test('invalidating a pending load prevents stale initialization', async () => {
  const state = readyState();
  const controller = controllerModule.createTransmissionController(state);
  controller.start();
  const load = deferred();
  let initializeCount = 0;
  const lifecycle = lifecycleModule.createAsyncUnitLifecycle({
    nextUnit: controller.nextUnit,
    loadUnit: () => load.promise,
    initializeUnit: () => { initializeCount += 1; },
  });

  const pending = lifecycle.ensureInitialized();
  lifecycle.invalidate();
  load.resolve('stale bytes');
  assert.equal(await pending, null);
  assert.equal(initializeCount, 0);
});

test('stale mode-change completion cannot clobber the new stream readiness', async () => {
  const state = readyState();
  const controller = controllerModule.createTransmissionController(state);
  controller.start();
  const oldChunkLoad = deferred();
  const encoderInitializations = [];
  let ready = false;
  let scheduled = false;
  const lifecycle = lifecycleModule.createAsyncUnitLifecycle({
    nextUnit: controller.nextUnit,
    loadUnit(item) {
      if (item.kind === 'chunk' && item.index === 0) return oldChunkLoad.promise;
      return Promise.resolve(`${label(item)} bytes`);
    },
    initializeUnit(item) {
      encoderInitializations.push(label(item));
    },
  });

  async function ensureCurrent() {
    const ownership = await lifecycle.ensureInitialized();
    if (!lifecycle.isCurrent(ownership)) return false;
    ready = true;
    scheduled = true;
    return true;
  }

  async function advanceCurrent() {
    ready = false;
    scheduled = false;
    const ownership = await lifecycle.advance();
    if (!lifecycle.isCurrent(ownership)) return false;
    ready = true;
    scheduled = true;
    return true;
  }

  assert.equal(await ensureCurrent(), true);
  assert.deepEqual(encoderInitializations, ['M']);

  const staleAdvance = advanceCurrent();
  assert.equal(label(lifecycle.snapshot().pendingItem), 'C0');

  lifecycle.invalidate();
  controller.focus(1);
  assert.equal(await ensureCurrent(), true);
  assert.deepEqual(encoderInitializations, ['M', 'M']);
  assert.equal(ready, true);
  assert.equal(scheduled, true);

  oldChunkLoad.resolve('stale C0 bytes');
  assert.equal(await staleAdvance, false);
  assert.deepEqual(encoderInitializations, ['M', 'M']);
  assert.equal(ready, true);
  assert.equal(scheduled, true);
  assert.equal(label(lifecycle.snapshot().initializedItem), 'M');
  assert.equal(label(controller.snapshot().scheduler.current), 'M');
  assert.equal(controller.snapshot().scheduler.phase, 'chunk');
});
