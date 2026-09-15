(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ITEM = Object.freeze({ MANIFEST: 'manifest', CHUNK: 'chunk' });
  const MODE = Object.freeze({ SWEEP: 'sweep', FOCUS: 'focus' });
  const ESTIMATED_BYTES_PER_FRAME = 7500;

  function framesForBurst(byteCount, burstFactor) {
    if (!Number.isSafeInteger(byteCount) || byteCount < 0) throw new RangeError('byteCount must be non-negative');
    if (!Number.isFinite(burstFactor) || burstFactor < 1) throw new RangeError('burstFactor must be at least 1');
    return Math.max(30, Math.ceil((byteCount / ESTIMATED_BYTES_PER_FRAME) * burstFactor));
  }

  function framesForCycle(manifestBytes, chunks, burstFactor, focusedChunk = null) {
    const manifestFrames = framesForBurst(manifestBytes, burstFactor);
    const selected = focusedChunk === null ? chunks : [chunks[focusedChunk]];
    return selected.reduce((total, chunk) => total + manifestFrames + framesForBurst(chunk.size, burstFactor), 0);
  }

  function createScheduler(chunkCount) {
    if (!Number.isInteger(chunkCount) || chunkCount < 1) {
      throw new RangeError('chunkCount must be a positive integer');
    }

    let mode = MODE.SWEEP;
    let focusedChunk = null;
    let sweepChunk = 0;
    let phase = ITEM.MANIFEST;
    let pass = 1;
    let paused = false;
    let current = null;

    function nextItem() {
      if (paused) return null;
      if (phase === ITEM.MANIFEST) {
        current = Object.freeze({ kind: ITEM.MANIFEST, pass, mode });
        phase = ITEM.CHUNK;
        return current;
      }

      const index = mode === MODE.FOCUS ? focusedChunk : sweepChunk;
      current = Object.freeze({ kind: ITEM.CHUNK, index, pass, mode });
      phase = ITEM.MANIFEST;
      if (mode === MODE.SWEEP) {
        sweepChunk += 1;
        if (sweepChunk === chunkCount) {
          sweepChunk = 0;
          pass += 1;
        }
      }
      return current;
    }

    function focus(index) {
      if (!Number.isInteger(index) || index < 0 || index >= chunkCount) {
        throw new RangeError('Focused chunk is outside the transfer');
      }
      mode = MODE.FOCUS;
      focusedChunk = index;
      phase = ITEM.MANIFEST;
      current = null;
    }

    function sweep() {
      mode = MODE.SWEEP;
      focusedChunk = null;
      phase = ITEM.MANIFEST;
      current = null;
    }

    function pause() { paused = true; }
    function resume() { paused = false; }

    function snapshot() {
      return Object.freeze({
        chunkCount,
        mode,
        focusedChunk,
        nextSweepChunk: sweepChunk,
        phase,
        pass,
        paused,
        current,
      });
    }

    return { nextItem, focus, sweep, pause, resume, snapshot };
  }

  return { ITEM, SCHEDULER_MODE: MODE, ESTIMATED_BYTES_PER_FRAME, framesForBurst, framesForCycle, createScheduler };
});
