(function () {
  'use strict';

  const A = window.AirGapBigFile;
  const state = A.createSenderState();
  let preference = null;
  try { preference = localStorage.getItem(A.LANGUAGE_KEY); } catch (_) { /* Storage is optional. */ }
  let language = A.detectLanguage(preference, navigator.language);
  const t = (key, values) => A.translate(language, key, values);
  let controller = null;
  let wasmReady = false;
  let prepareAbort = null;
  let renderTimer = null;
  let unitLifecycle = null;
  let streamReady = false;
  let framesInBurst = 0;
  let framesInBurstTarget = 0;
  let lastError = '';
  let idealRatio = 1;
  let timing = A.createRenderTiming(state.fps);
  let pauseReason = null;
  let wakeStatus = 'wakeOff';
  let lastMetricsRender = 0;
  const wakeLock = A.createScreenWakeLock(navigator.wakeLock, (status) => {
    wakeStatus = status;
    render();
  });

  const byId = (id) => document.getElementById(id);

  function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    const units = ['KiB', 'MiB', 'GiB'];
    let size = value;
    let unit = -1;
    do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
    return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unit]}`;
  }

  function currentItemLabel() {
    if (!state.currentItem) return '—';
    if (state.currentItem.kind === A.ITEM.MANIFEST) return t('manifest');
    return t('chunkPosition', { index: state.currentItem.index + 1, count: state.chunks.length });
  }

  function setText(id, value) { byId(id).textContent = value; }

  function renderFocusOptions() {
    const select = byId('focusChunk');
    const selected = select.value;
    select.replaceChildren();
    state.chunks.forEach((chunk) => {
      const option = document.createElement('option');
      option.value = String(chunk.index);
      option.textContent = t('chunk', { index: chunk.index + 1 });
      select.append(option);
    });
    if (selected && Number(selected) < state.chunks.length) select.value = selected;
  }

  function formatDuration(seconds) {
    const rounded = Math.ceil(seconds);
    return rounded < 60 ? t('duration', { seconds: rounded })
      : t('durationMinutes', { minutes: Math.floor(rounded / 60), seconds: rounded % 60 });
  }

  function render() {
    const prepared = Boolean(state.manifest);
    const preparing = state.status === A.STATUS.PREPARING;
    const active = A.activeParametersLocked(state.status);

    const targetFps = active ? state.fps : Number(byId('fps').value);
    const factor = active ? state.burstFactor : Number(byId('burstFactor').value);
    const measured = state.status === A.STATUS.SENDING ? timing.measurement(performance.now()) : null;
    const estimateFps = measured ? measured.fps : targetFps;
    setText('targetFpsValue', String(targetFps));
    setText('actualFpsValue', measured ? measured.fps.toFixed(1) : '—');
    setText('intervalValue', measured ? `${measured.interval.toFixed(1)} ms` : '—');
    setText('remainingValue', streamReady
      ? formatDuration(Math.max(0, framesInBurstTarget - framesInBurst) / estimateFps) : '—');
    setText('estimateLabel', t(state.mode === A.MODE.FOCUS ? 'focusEstimate' : 'estimate'));
    setText('estimateValue', prepared ? formatDuration(A.framesForCycle(
      state.manifestBytes.length, state.chunks, factor,
      state.mode === A.MODE.FOCUS ? state.focusedChunk : null) / estimateFps) : '—');
    setText('wakeValue', t(wakeStatus));
    byId('visibilityNotice').hidden = pauseReason !== 'visibility';
    setText('visibilityNotice', t('visibilityNotice'));
    byId('wakeNotice').hidden = wakeStatus !== 'wakeUnavailable';
    setText('wakeNotice', t('wakeNotice'));
    byId('fps').disabled = active;
    byId('burstFactor').disabled = active;

    setText('stateValue', t('status.' + state.status));
    setText('wasmValue', t(wasmReady ? 'status.ready' : 'loading'));
    setText('modeValue', state.mode === A.MODE.FOCUS
      ? t('focusMode', { index: state.focusedChunk + 1 })
      : t('sweepMode'));
    setText('currentValue', currentItemLabel());
    setText('passValue', prepared ? String(state.pass) : '—');
    setText('burstValue', streamReady ? t('frames', { done: framesInBurst, total: framesInBurstTarget }) : '—');
    setText('filenameValue', state.file ? state.file.name : '—');
    setText('fileSizeValue', state.file ? formatBytes(state.file.size) : '—');
    setText('hashValue', prepared ? state.manifest.sha256 : '—');
    setText('chunkSizeValue', prepared ? formatBytes(state.manifest.chunk_size) : '—');
    setText('chunkCountValue', prepared ? String(state.manifest.chunk_count) : '—');
    setText('encodeBaseValue', prepared ? String(state.manifest.encode_id_base) : '—');

    const pct = preparing ? state.preparation.percentage : prepared ? 100 : 0;
    byId('prepareBar').style.width = `${pct}%`;
    setText('prepareLabel', preparing
      ? t('preparingProgress', { done: formatBytes(state.preparation.hashedBytes), total: formatBytes(state.preparation.totalBytes), index: state.preparation.currentChunk })
      : t(prepared ? 'preparedComplete' : 'chooseBegin'));

    byId('startButton').disabled = !prepared || !wasmReady || state.status !== A.STATUS.READY;
    byId('pauseButton').disabled = !active;
    byId('pauseButton').textContent = t(state.status === A.STATUS.PAUSED ? 'resume' : 'pause');
    byId('stopButton').disabled = !active;
    byId('cancelPrepareButton').hidden = !preparing;
    byId('fileInput').disabled = preparing || active;
    byId('chunkSize').disabled = preparing || active || prepared;
    byId('focusChunk').disabled = !prepared || preparing;
    byId('focusButton').disabled = !prepared || preparing;
    byId('sweepButton').disabled = !prepared || preparing || state.mode === A.MODE.SWEEP;
    byId('fullscreenButton').disabled = !streamReady;
    byId('errorBox').hidden = !lastError;
    setText('errorBox', lastError ? t(lastError) : '');
    byId('canvasWrap').classList.toggle('active', active);
  }

  async function prepareFile(file) {
    if (!file) return;
    if (state.status === A.STATUS.PREPARING ||
        state.status === A.STATUS.SENDING ||
        state.status === A.STATUS.PAUSED) return;
    lastError = '';
    controller = null;
    A.beginPreparation(state, file);
    prepareAbort = new AbortController();
    render();
    try {
      const selected = byId('chunkSize').value;
      const chunkSize = selected === 'auto' ? undefined : Number(selected);
      const result = await A.prepareFileByRanges(file, {
        chunkSize,
        signal: prepareAbort.signal,
        onProgress(progress) {
          A.updatePreparationProgress(state, progress.hashedBytes, progress.currentChunk);
          render();
        },
      });
      A.finishPreparation(state, result);
      controller = A.createTransmissionController(state);
      renderFocusOptions();
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (state.status === A.STATUS.PREPARING) A.cancelPreparation(state);
      } else {
        if (state.status === A.STATUS.PREPARING) A.failPreparation(state, error);
        console.error(error);
        lastError = A.errorTranslationKey(error);
      }
    } finally {
      prepareAbort = null;
      render();
    }
  }

  function initEncode(filename, encodeId) {
    const filenameBytes = new TextEncoder().encode(filename);
    const pointer = Module._malloc(filenameBytes.length);
    try {
      new Uint8Array(Module.HEAPU8.buffer, pointer, filenameBytes.length).set(filenameBytes);
      const result = Module._cimbare_init_encode(pointer, filenameBytes.length, encodeId);
      if (result < 0) throw new Error(`libcimbar rejected ${filename}`);
    } finally {
      Module._free(pointer);
    }
  }

  function feedEncoder(bytes) {
    const bufferSize = Module._cimbare_encode_bufsize();
    const pointer = Module._malloc(bufferSize);
    try {
      const wasmBuffer = new Uint8Array(Module.HEAPU8.buffer, pointer, bufferSize);
      for (let offset = 0; offset < bytes.length; offset += bufferSize) {
        const count = Math.min(bufferSize, bytes.length - offset);
        wasmBuffer.set(bytes.subarray(offset, offset + count));
        Module._cimbare_encode(pointer, count);
      }
      Module._cimbare_encode(pointer, 0);
    } finally {
      Module._free(pointer);
    }
  }

  function createUnitLifecycle() {
    const transfer = {
      file: state.file,
      manifest: state.manifest,
      manifestBytes: state.manifestBytes,
      chunks: state.chunks,
      burstFactor: state.burstFactor,
    };
    return A.createAsyncUnitLifecycle({
      nextUnit: controller.nextUnit,
      async loadUnit(item) {
        if (item.kind === A.ITEM.MANIFEST) {
          return { bytes: transfer.manifestBytes, filename: 'manifest.json', logicalOffset: 0 };
        }
        const descriptor = transfer.chunks[item.index];
        return {
          bytes: await A.loadChunk(transfer.file, descriptor),
          filename: A.partFilename(transfer.manifest.filename, item.index, transfer.chunks.length),
          logicalOffset: item.index + 1,
        };
      },
      initializeUnit(_item, payload) {
        initEncode(payload.filename,
          A.logicalEncodeId(transfer.manifest.encode_id_base, payload.logicalOffset));
        feedEncoder(payload.bytes);
        framesInBurst = 0;
        framesInBurstTarget = A.framesForBurst(payload.bytes.length, transfer.burstFactor);
        return framesInBurstTarget;
      },
    });
  }

  async function ensureCurrentUnit() {
    const lifecycle = unitLifecycle;
    const ownership = await lifecycle.ensureInitialized();
    if (!lifecycle.isCurrent(ownership)) return false;
    streamReady = true;
    render();
    return true;
  }

  async function advanceCurrentUnit() {
    const lifecycle = unitLifecycle;
    streamReady = false;
    render();
    const ownership = await lifecycle.advance();
    if (!lifecycle.isCurrent(ownership)) return false;
    streamReady = true;
    render();
    return true;
  }

  function clearRenderTimer() {
    if (renderTimer !== null) cancelAnimationFrame(renderTimer);
    renderTimer = null;
  }

  function scheduleFrame() {
    clearRenderTimer();
    if (state.status !== A.STATUS.SENDING || !streamReady || document.hidden) return;
    renderTimer = requestAnimationFrame(renderFrame);
  }

  function renderFrame() {
    renderTimer = null;
    if (A.shouldPauseForVisibility(state.status, document.hidden)) { pauseSending('visibility'); return; }
    if (state.status !== A.STATUS.SENDING || !streamReady) return;
    const now = performance.now();
    try {
      if (timing.due(now)) {
        // Leave the final frame on the canvas for a full paced interval before
        // loading/initializing the next unit, which can change the canvas.
        if (framesInBurst >= framesInBurstTarget) {
          void advanceCurrentUnit().then((ready) => {
            if (ready) scheduleFrame();
          }).catch(handleRuntimeError);
          return;
        }
        Module._cimbare_render();
        Module._cimbare_next_frame(false);
        framesInBurst += 1;
        timing.record(performance.now());
      }
      if (now - lastMetricsRender >= 250) { lastMetricsRender = now; render(); }
      scheduleFrame();
    } catch (error) {
      handleRuntimeError(error);
    }
  }

  function pauseSending(reason) {
    clearRenderTimer();
    controller.pause();
    pauseReason = reason;
    timing.reset();
    void wakeLock.release();
    render();
  }

  function handleRuntimeError(error) {
    clearRenderTimer();
    void wakeLock.release();
    pauseReason = null;
    timing.reset();
    if (unitLifecycle) unitLifecycle.invalidate();
    unitLifecycle = null;
    streamReady = false;
    console.error(error);
    lastError = A.errorTranslationKey(error);
    if (controller && (state.status === A.STATUS.SENDING || state.status === A.STATUS.PAUSED)) {
      controller.stop();
    }
    render();
  }

  async function startSending() {
    if (document.hidden) return;
    lastError = '';
    state.fps = Number(byId('fps').value);
    state.burstFactor = Number(byId('burstFactor').value);
    controller.start();
    pauseReason = null;
    timing = A.createRenderTiming(state.fps);
    void wakeLock.acquire();
    unitLifecycle = createUnitLifecycle();
    render();
    try {
      if (await ensureCurrentUnit()) scheduleFrame();
    } catch (error) {
      handleRuntimeError(error);
    }
  }

  async function togglePause() {
    if (state.status === A.STATUS.SENDING) {
      pauseSending('manual');
      return;
    }
    if (state.status !== A.STATUS.PAUSED || document.hidden) return;
    controller.resume();
    pauseReason = null;
    timing.reset();
    void wakeLock.acquire();
    render();
    try {
      if (!streamReady && !(await ensureCurrentUnit())) return;
      scheduleFrame();
    } catch (error) {
      handleRuntimeError(error);
    }
  }

  function stopSending() {
    clearRenderTimer();
    void wakeLock.release();
    pauseReason = null;
    timing.reset();
    if (unitLifecycle) unitLifecycle.invalidate();
    unitLifecycle = null;
    streamReady = false;
    framesInBurst = 0;
    framesInBurstTarget = 0;
    controller.stop();
    render();
  }

  function changeMode(mode) {
    if (unitLifecycle) unitLifecycle.invalidate();
    streamReady = false;
    clearRenderTimer();
    if (mode === A.MODE.FOCUS) controller.focus(Number(byId('focusChunk').value));
    else controller.sweep();
    render();
    if (state.status === A.STATUS.SENDING) {
      void ensureCurrentUnit().then((ready) => { if (ready) scheduleFrame(); }).catch(handleRuntimeError);
    }
  }

  function fitCanvas() {
    const wrap = byId('canvasWrap');
    const canvas = byId('canvas');
    const width = Math.max(160, wrap.clientWidth - 24);
    const height = Math.max(160, wrap.clientHeight - 24);
    if (width / height > idealRatio) {
      canvas.style.height = `${height}px`;
      canvas.style.width = `${height * idealRatio}px`;
    } else {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${width / idealRatio}px`;
    }
  }

  function applyLanguage() {
    document.documentElement.lang = language;
    byId('language').value = language;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    byId('canvasWrap').dataset.placeholder = t('canvasPlaceholder');
    renderFocusOptions();
    render();
  }

  document.addEventListener('visibilitychange', () => {
    if (A.shouldPauseForVisibility(state.status, document.hidden)) pauseSending('visibility');
  });
  for (const id of ['fps', 'burstFactor']) {
    byId(id).addEventListener('change', () => { timing.reset(); render(); });
  }
  byId('language').addEventListener('change', () => {
    language = byId('language').value;
    try { localStorage.setItem(A.LANGUAGE_KEY, language); } catch (_) { /* Storage is optional. */ }
    applyLanguage();
  });
  byId('fileInput').addEventListener('change', (event) => void prepareFile(event.target.files[0]));
  byId('dropzone').addEventListener('click', () => byId('fileInput').click());
  byId('dropzone').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') byId('fileInput').click();
  });
  for (const name of ['dragenter', 'dragover']) {
    byId('dropzone').addEventListener(name, (event) => { event.preventDefault(); byId('dropzone').classList.add('over'); });
  }
  for (const name of ['dragleave', 'drop']) {
    byId('dropzone').addEventListener(name, (event) => { event.preventDefault(); byId('dropzone').classList.remove('over'); });
  }
  byId('dropzone').addEventListener('drop', (event) => void prepareFile(event.dataTransfer.files[0]));
  byId('cancelPrepareButton').addEventListener('click', () => prepareAbort && prepareAbort.abort());
  byId('startButton').addEventListener('click', () => void startSending());
  byId('pauseButton').addEventListener('click', () => void togglePause());
  byId('stopButton').addEventListener('click', stopSending);
  byId('focusButton').addEventListener('click', () => changeMode(A.MODE.FOCUS));
  byId('sweepButton').addEventListener('click', () => changeMode(A.MODE.SWEEP));
  byId('fullscreenButton').addEventListener('click', () => {
    const target = byId('canvasWrap');
    const request = target.requestFullscreen || target.webkitRequestFullscreen;
    if (request) Promise.resolve().then(() => request.call(target)).catch((error) => {
      console.error(error);
      lastError = A.errorTranslationKey(error);
      render();
    });
  });
  window.addEventListener('resize', fitCanvas);
  document.addEventListener('fullscreenchange', fitCanvas);

  window.Module = {
    canvas: byId('canvas'),
    onRuntimeInitialized() {
      wasmReady = true;
      Module._cimbare_configure(68, -1);
      idealRatio = Module._cimbare_get_aspect_ratio() || 1;
      fitCanvas();
      render();
    },
    print(text) { console.info('[libcimbar]', text); },
    printErr(text) { console.error('[libcimbar]', text); },
  };

  window.AirGapBigFileApp = Object.freeze({ state });
  applyLanguage();
  fitCanvas();
})();
