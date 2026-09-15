(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createRenderTiming(fps) {
    const interval = 1000 / fps;
    let deadline = null;
    let samples = [];

    function reset() { deadline = null; samples = []; }

    // Consume time deadlines, never data frames. Fractional deadlines preserve
    // 24 FPS on 60 Hz displays; a stalled callback still submits at most one.
    function due(now) {
      if (deadline === null) deadline = now;
      if (now + 0.001 < deadline) return false;
      const elapsedSlots = Math.max(1, Math.floor((now - deadline + 0.001) / interval) + 1);
      deadline += elapsedSlots * interval;
      return true;
    }

    function record(now) {
      samples.push(now);
      while (samples.length > 1 && samples[0] < now - 2000) samples.shift();
    }

    function measurement(now) {
      const recent = samples.filter((sample) => sample >= now - 2000);
      if (recent.length < 2 || recent.at(-1) - recent[0] < 1000) return null;
      // Extend through now so loading/stalls within visible sending reduce FPS.
      const frameInterval = (now - recent[0]) / (recent.length - 1);
      return { fps: 1000 / frameInterval, interval: frameInterval };
    }

    return { due, record, measurement, reset };
  }

  return { createRenderTiming };
});
