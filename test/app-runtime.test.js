'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'send.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

async function flush() { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }
function harness() {
  class Element {
    constructor() {
      this.value = ''; this.textContent = ''; this.disabled = false;
      this.hidden = false; this.style = {}; this.dataset = {}; this.children = [];
      this.listeners = {}; this.clientWidth = 600; this.clientHeight = 600;
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    emit(name, event = {}) { if (this.listeners[name]) this.listeners[name](event); }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
  }
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map((m) => [m[1], new Element()]));
  elements.fps.value = '15'; elements.burstFactor.value = '2'; elements.chunkSize.value = 'auto';
  const labels = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => {
    const element = new Element(); element.dataset.i18n = m[1]; return element;
  });
  const document = new Element();
  document.hidden = false;
  document.documentElement = {};
  document.getElementById = (id) => { assert.ok(elements[id], id); return elements[id]; };
  document.querySelectorAll = () => labels;
  document.createElement = () => new Element();
  const api = Object.assign({}, ...['protocol', 'sender-state', 'scheduler', 'transmission-controller',
    'unit-lifecycle', 'encoder', 'i18n', 'render-timing', 'wake-lock'].map((name) => require(`../src/${name}.js`)));
  api.prepareFileByRanges = async () => ({
    manifest: { filename: 'x.bin', sha256: 'abc', chunk_size: 5242880, chunk_count: 2, encode_id_base: 1 },
    manifestBytes: new Uint8Array([1]),
    chunks: [{ index: 0, size: 750000, offset: 0 }, { index: 1, size: 750000, offset: 750000 }],
  });
  api.loadChunk = async () => new Uint8Array(750000);
  let now = 0; let rafId = 0;
  const callbacks = new Map(); const storage = new Map();
  const context = {
    AirGapBigFile: api, document, navigator: { language: 'en-US' },
    localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    performance: { now: () => now }, TextEncoder, Uint8Array, AbortController,
    console: { info() {}, error() {} },
    requestAnimationFrame: (fn) => { callbacks.set(++rafId, fn); return rafId; },
    cancelAnimationFrame: (id) => callbacks.delete(id), addEventListener() {},
  };
  context.window = context;
  vm.runInNewContext(app, context);
  let renders = 0; let advances = 0; let inits = 0;
  Object.assign(context.Module, {
    HEAPU8: new Uint8Array(8192), _malloc: () => 4, _free() {},
    _cimbare_configure: () => 0, _cimbare_get_aspect_ratio: () => 1,
    _cimbare_init_encode: () => { inits += 1; return 0; },
    _cimbare_encode_bufsize: () => 4096, _cimbare_encode: (_, length) => length === 4096 ? 1 : 0,
    _cimbare_render: () => { renders += 1; return 1; }, _cimbare_next_frame: () => { advances += 1; return advances; },
  });
  context.Module.onRuntimeInitialized();
  return {
    elements, document, context, storage,
    state: context.AirGapBigFileApp.state,
    counts: () => ({ renders, advances, inits }),
    async prepare(file = { name: 'x.bin', size: 1500000, slice() {} }) {
      elements.fileInput.emit('change', { target: { files: [file] } });
      await flush();
    },
    async click(id) { elements[id].emit('click'); await flush(); },
    async frame(time) {
      now = time;
      const pending = [...callbacks.values()]; callbacks.clear();
      assert.ok(pending.length <= 1, 'only one RAF may be queued');
      for (const callback of pending) callback(time);
      await flush();
    },
    async visibility(hidden) { document.hidden = hidden; document.emit('visibilitychange'); await flush(); },
    language(value) { elements.language.value = value; elements.language.emit('change'); },
  };
}

test('runtime preserves burst and encoder on pause, visibility, resume and language switch', async () => {
  const h = harness();
  await h.prepare();
  assert.equal(h.elements.fps.disabled, false);
  await h.click('startButton');
  assert.equal(h.elements.fps.disabled, true);
  assert.equal(h.elements.burstFactor.disabled, true);
  assert.equal(h.state.status, 'sending');
  assert.equal(h.elements.wakeValue.textContent, 'Unavailable');
  await h.frame(0);
  await h.frame(500);
  assert.deepEqual(h.counts(), { renders: 2, advances: 2, inits: 1 });
  const item = h.state.currentItem;
  const file = h.state.file;
  const burst = h.elements.burstValue.textContent;
  h.language('zh-Hans');
  assert.equal(h.document.documentElement.lang, 'zh-Hans');
  assert.equal(h.state.file, file);
  assert.equal(h.state.currentItem, item);
  assert.deepEqual(h.counts(), { renders: 2, advances: 2, inits: 1 });
  assert.deepEqual([...h.storage], [['airgapBigFile.language', 'zh-Hans']]);
  h.language('en');
  assert.equal(h.elements.burstValue.textContent, burst);
  await h.visibility(true);
  assert.equal(h.state.status, 'paused');
  assert.equal(h.elements.visibilityNotice.hidden, false);
  assert.equal(h.elements.fps.disabled, true);
  assert.equal(h.elements.burstFactor.disabled, true);
  await h.frame(1000);
  await h.visibility(false);
  assert.equal(h.state.status, 'paused');
  await h.frame(10000);
  assert.equal(h.counts().renders, 2);
  await h.click('pauseButton');
  await h.frame(10000);
  assert.deepEqual(h.counts(), { renders: 3, advances: 3, inits: 1 });
  assert.equal(h.elements.actualFpsValue.textContent, '—');
  assert.equal(h.elements.visibilityNotice.hidden, true);
  await h.click('pauseButton');
  await h.visibility(true);
  await h.visibility(false);
  assert.equal(h.state.status, 'paused');
  assert.equal(h.elements.visibilityNotice.hidden, true, 'manual pause stays manual');
  await h.click('stopButton');
  assert.equal(h.state.status, 'ready');
  assert.equal(h.elements.fps.disabled, false);
  assert.equal(h.elements.burstFactor.disabled, false);
});

test('RAF submits at most one frame; next unit initializes only after the final frame interval', async () => {
  const h = harness();
  await h.prepare();
  h.elements.fps.value = '30';
  await h.click('startButton');
  for (let tick = 0; tick < 59; tick += 1) {
    const before = h.counts().renders;
    await h.frame(tick * 1000 / 60);
    assert.ok(h.counts().renders - before <= 1);
  }
  assert.deepEqual(h.counts(), { renders: 30, advances: 30, inits: 1 });
  await h.frame(1000);
  assert.deepEqual(h.counts(), { renders: 30, advances: 30, inits: 2 });
  await h.frame(1034);
  assert.deepEqual(h.counts(), { renders: 31, advances: 31, inits: 2 });
  assert.equal(h.state.currentItem.index, 0);
});

test('render failure cancels frames, releases wake lock and unlocks controls', async () => {
  const h = harness();
  await h.prepare(); await h.click('startButton');
  h.context.Module._cimbare_render = () => { throw new Error('libcimbar failed'); };
  await h.frame(0);
  assert.equal(h.state.status, 'ready');
  assert.equal(h.elements.fps.disabled, false);
  assert.equal(h.elements.wakeValue.textContent, 'Not held');
  assert.equal(h.elements.errorBox.hidden, false);
  await h.frame(1000);
  assert.equal(h.counts().advances, 1);
});

test('only submitted frames count and a failed display configuration disables Start', async () => {
  const h = harness();
  h.context.Module._cimbare_configure = () => -1;
  h.context.Module.onRuntimeInitialized();
  await h.prepare();
  assert.equal(h.elements.startButton.disabled, true);
  assert.equal(h.elements.errorBox.hidden, false);
  for (const [name, result] of [['_cimbare_next_frame', -1], ['_cimbare_render', 0]]) {
    const run = harness();
    await run.prepare(); await run.click('startButton');
    run.context.Module[name] = () => result;
    await run.frame(0);
    assert.equal(run.state.status, 'ready');
    assert.equal(run.elements.errorBox.hidden, false);
    assert.equal(run.elements.actualFpsValue.textContent, '—');
  }
});

test('shorten repeats respects the manifest and floor, and is opt-in', async () => {
  for (const [enabled, repeats, expectedFrames] of [[true, true, 30], [false, true, 200], [true, false, 200]]) {
    const h = harness();
    await h.prepare();
    h.elements.shortenRepeats.checked = enabled;
    h.elements.fps.value = '30';
    let sequence = 0;
    h.context.Module._cimbare_next_frame = () => {
      sequence += 1;
      return repeats ? 1 + ((sequence - 1) % 7) : sequence;
    };
    await h.click('startButton');
    assert.equal(h.elements.shortenRepeats.disabled, true);
    for (let tick = 0; tick <= 31 + expectedFrames; tick++) await h.frame(tick * 1000 / 30);
    assert.equal(h.counts().inits, 3);
    assert.equal(h.counts().renders, 30 + expectedFrames);
    assert.equal(h.state.currentItem.kind, 'manifest');
    await h.click('stopButton');
    assert.equal(h.elements.shortenRepeats.disabled, false);
  }
});

test('a late final frame stays up for a paced interval measured from submission', async () => {
  const h = harness();
  await h.prepare();
  h.elements.fps.value = '30';
  await h.click('startButton');
  for (let i = 0; i < 29; i++) await h.frame(i * 1000 / 30);
  await h.frame(996);
  await h.frame(1001);
  assert.equal(h.counts().inits, 1);
  await h.frame(1030);
  assert.equal(h.counts().inits, 2);
  await h.frame(1046);
  assert.equal(h.counts().renders, 31);
});

test('a changed file stops before chunk initialization and can be prepared again', async () => {
  const h = harness();
  const preparation = require('../src/preparation.js');
  let prepared;
  let loaded;
  h.context.AirGapBigFile.prepareFileByRanges = (file, options) => {
    prepared = preparation.prepareFileByRanges(file, { ...options, encodeIdBase: 7, yieldControl() {} });
    return prepared;
  };
  h.context.AirGapBigFile.loadChunk = (...args) => {
    loaded = preparation.loadChunk(...args);
    return loaded;
  };
  let contents = 'hello';
  const file = { name: 'synthetic.bin', size: 5, slice() { return new Blob([contents]); } };
  await h.prepare(file);
  await prepared; await flush();
  contents = 'world';
  await h.click('startButton');
  for (let i = 0; i <= 30; i++) await h.frame(i * 1000 / 15);
  await assert.rejects(loaded, /digest mismatch/);
  await flush();
  assert.equal(h.counts().inits, 1);
  assert.equal(h.elements.errorBox.textContent, h.context.AirGapBigFile.translate('en', 'errorChanged'));
  assert.equal(h.state.status, 'ready');
  await h.prepare(file);
  await prepared; await flush();
  assert.equal(h.state.status, 'ready');
  assert.equal(h.elements.errorBox.hidden, true);
});
