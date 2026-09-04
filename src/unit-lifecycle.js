(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createAsyncUnitLifecycle({ nextUnit, loadUnit, initializeUnit }) {
    if (typeof nextUnit !== 'function' || typeof loadUnit !== 'function' ||
        typeof initializeUnit !== 'function') {
      throw new TypeError('nextUnit, loadUnit, and initializeUnit are required');
    }

    let revision = 0;
    let pending = null;
    let initialized = null;

    function ensureInitialized() {
      if (initialized) return Promise.resolve(initialized);
      if (pending) return pending.promise;

      const item = nextUnit();
      if (!item) return Promise.resolve(null);
      const ownerRevision = revision;
      const promise = Promise.resolve()
        .then(() => loadUnit(item))
        .then((payload) => {
          if (ownerRevision !== revision) return null;
          const value = initializeUnit(item, payload);
          if (ownerRevision !== revision) return null;
          initialized = Object.freeze({ item, value });
          return initialized;
        })
        .catch((error) => {
          if (ownerRevision !== revision) return null;
          throw error;
        })
        .finally(() => {
          if (pending && pending.revision === ownerRevision) pending = null;
        });

      pending = Object.freeze({ item, revision: ownerRevision, promise });
      return promise;
    }

    function advance() {
      if (!initialized) throw new Error('Cannot advance before the current unit is initialized');
      revision += 1;
      initialized = null;
      return ensureInitialized();
    }

    function invalidate() {
      revision += 1;
      pending = null;
      initialized = null;
    }

    function snapshot() {
      return Object.freeze({
        revision,
        pendingItem: pending ? pending.item : null,
        initializedItem: initialized ? initialized.item : null,
      });
    }

    return { ensureInitialized, advance, invalidate, snapshot };
  }

  return { createAsyncUnitLifecycle };
});
