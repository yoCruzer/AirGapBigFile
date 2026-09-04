(function (root, factory) {
  const isCommonJs = typeof module === 'object' && module.exports;
  const sender = isCommonJs ? require('./sender-state.js') : root.AirGapBigFile;
  const scheduling = isCommonJs ? require('./scheduler.js') : root.AirGapBigFile;
  const api = factory(sender, scheduling);
  if (isCommonJs) module.exports = api;
  root.AirGapBigFile = Object.assign(root.AirGapBigFile || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sender, scheduling) {
  'use strict';

  function createTransmissionController(state) {
    let scheduler = null;

    function start() {
      sender.startSending(state);
      scheduler = scheduling.createScheduler(state.chunks.length);
      if (state.mode === sender.MODE.FOCUS) scheduler.focus(state.focusedChunk);
    }

    function nextUnit() {
      if (state.status !== sender.STATUS.SENDING) return null;
      const item = scheduler.nextItem();
      if (!item) return null;
      state.currentItem = item;
      state.pass = item.pass;
      return item;
    }

    function pause() {
      sender.pauseSending(state);
      scheduler.pause();
    }

    function resume() {
      sender.resumeSending(state);
      scheduler.resume();
      // Deliberately return the existing unit: the caller should continue the
      // initialized libcimbar stream instead of calling init_encode again.
      return state.currentItem;
    }

    function stop() {
      sender.stopSending(state);
      scheduler = null;
    }

    function focus(index) {
      sender.focusChunk(state, index);
      if (scheduler) scheduler.focus(index);
      state.currentItem = null;
    }

    function sweep() {
      sender.useSweepMode(state);
      if (scheduler) scheduler.sweep();
      state.currentItem = null;
    }

    function snapshot() {
      return { state, scheduler: scheduler ? scheduler.snapshot() : null };
    }

    return { start, nextUnit, pause, resume, stop, focus, sweep, snapshot };
  }

  return { createTransmissionController };
});
