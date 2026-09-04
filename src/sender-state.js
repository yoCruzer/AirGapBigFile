(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS = Object.freeze({
    IDLE: 'idle',
    PREPARING: 'preparing',
    READY: 'ready',
    SENDING: 'sending',
    PAUSED: 'paused',
    ERROR: 'error',
  });

  const MODE = Object.freeze({ SWEEP: 'sweep', FOCUS: 'focus' });

  function createSenderState() {
    return {
      status: STATUS.IDLE,
      file: null,
      manifest: null,
      manifestBytes: null,
      chunks: [],
      preparation: { hashedBytes: 0, totalBytes: 0, currentChunk: 0, percentage: 0 },
      currentItem: null,
      pass: 1,
      mode: MODE.SWEEP,
      focusedChunk: null,
      fps: 15,
      burstFactor: 2,
      error: null,
    };
  }

  function requireStatus(state, allowed, action) {
    if (!allowed.includes(state.status)) {
      throw new Error(`Cannot ${action} while sender is ${state.status}`);
    }
  }

  function beginPreparation(state, file) {
    requireStatus(state, [STATUS.IDLE, STATUS.READY, STATUS.ERROR], 'prepare');
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size)) {
      throw new TypeError('A File/Blob-like input is required');
    }
    state.status = STATUS.PREPARING;
    state.file = file;
    state.manifest = null;
    state.manifestBytes = null;
    state.chunks = [];
    state.preparation = { hashedBytes: 0, totalBytes: file.size, currentChunk: 0, percentage: 0 };
    state.currentItem = null;
    state.pass = 1;
    state.mode = MODE.SWEEP;
    state.focusedChunk = null;
    state.error = null;
  }

  function updatePreparationProgress(state, hashedBytes, currentChunk) {
    requireStatus(state, [STATUS.PREPARING], 'update preparation progress');
    if (!Number.isSafeInteger(hashedBytes) || hashedBytes < 0 || hashedBytes > state.preparation.totalBytes) {
      throw new RangeError('hashedBytes is outside the input range');
    }
    state.preparation.hashedBytes = hashedBytes;
    state.preparation.currentChunk = currentChunk;
    state.preparation.percentage = state.preparation.totalBytes === 0
      ? 100
      : (hashedBytes / state.preparation.totalBytes) * 100;
  }

  function finishPreparation(state, prepared) {
    requireStatus(state, [STATUS.PREPARING], 'finish preparation');
    state.manifest = prepared.manifest;
    state.manifestBytes = prepared.manifestBytes;
    state.chunks = prepared.chunks;
    state.preparation.hashedBytes = state.preparation.totalBytes;
    state.preparation.percentage = 100;
    state.status = STATUS.READY;
  }

  function cancelPreparation(state) {
    requireStatus(state, [STATUS.PREPARING], 'cancel preparation');
    Object.assign(state, createSenderState());
  }

  function failPreparation(state, error) {
    requireStatus(state, [STATUS.PREPARING], 'fail preparation');
    state.status = STATUS.ERROR;
    state.manifest = null;
    state.manifestBytes = null;
    state.chunks = [];
    state.error = error instanceof Error ? error.message : String(error);
  }

  function startSending(state) {
    requireStatus(state, [STATUS.READY], 'start sending');
    if (!state.manifest || state.chunks.length === 0) throw new Error('No prepared transfer');
    state.status = STATUS.SENDING;
  }

  function pauseSending(state) {
    requireStatus(state, [STATUS.SENDING], 'pause');
    state.status = STATUS.PAUSED;
  }

  function resumeSending(state) {
    requireStatus(state, [STATUS.PAUSED], 'resume');
    state.status = STATUS.SENDING;
  }

  function stopSending(state) {
    requireStatus(state, [STATUS.SENDING, STATUS.PAUSED], 'stop');
    state.status = STATUS.READY;
    state.currentItem = null;
    state.pass = 1;
  }

  function focusChunk(state, chunkIndex) {
    requireStatus(state, [STATUS.READY, STATUS.SENDING, STATUS.PAUSED], 'focus a chunk');
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= state.chunks.length) {
      throw new RangeError('Focused chunk is outside the prepared transfer');
    }
    state.mode = MODE.FOCUS;
    state.focusedChunk = chunkIndex;
  }

  function useSweepMode(state) {
    requireStatus(state, [STATUS.READY, STATUS.SENDING, STATUS.PAUSED], 'return to sweep');
    state.mode = MODE.SWEEP;
    state.focusedChunk = null;
  }

  return {
    STATUS,
    MODE,
    createSenderState,
    beginPreparation,
    updatePreparationProgress,
    finishPreparation,
    cancelPreparation,
    failPreparation,
    startSending,
    pauseSending,
    resumeSending,
    stopSending,
    focusChunk,
    useSweepMode,
  };
});
