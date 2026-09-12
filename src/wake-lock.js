(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createScreenWakeLock(api, onStatus) {
    let revision = 0;
    let held = null;
    const releaseSentinel = async (sentinel) => {
      try { await sentinel.release(); } catch (_) { /* Best effort, never fatal. */ }
    };

    function release() {
      revision += 1;
      const previous = held;
      held = null;
      onStatus('wakeOff');
      return previous ? releaseSentinel(previous) : Promise.resolve();
    }

    async function acquire() {
      const previous = held;
      held = null;
      const owner = ++revision;
      if (previous) await releaseSentinel(previous);
      if (owner !== revision) return;
      if (!api || typeof api.request !== 'function') {
        onStatus('wakeUnavailable');
        return;
      }
      onStatus('wakePending');
      try {
        const sentinel = await api.request('screen');
        if (owner !== revision) { await releaseSentinel(sentinel); return; }
        held = sentinel;
        sentinel.addEventListener('release', () => {
          if (held !== sentinel) return;
          held = null;
          onStatus('wakeUnavailable');
        });
        if (sentinel.released) {
          held = null;
          onStatus('wakeUnavailable');
        } else onStatus('wakeHeld');
      } catch (_) {
        if (owner === revision) onStatus('wakeUnavailable');
      }
    }

    return { acquire, release };
  }

  return { createScreenWakeLock };
});
