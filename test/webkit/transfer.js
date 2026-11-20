// Body of callAsyncJavaScript in the test's ephemeral WKWebView.
const el = id => document.getElementById(id);
async function waitFor(predicate, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (window.AirGapBigFileApp && !el('errorBox').hidden) throw Error(el('errorBox').textContent);
    if (performance.now() >= deadline) throw Error('Timed out waiting for the sender');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

await waitFor(() => window.Module && Module.calledRun, 10000);
const bytes = Uint8Array.from({ length: 5242880 + 1234 }, (_, i) => i % 251);
const input = new DataTransfer();
input.items.add(new File([bytes], 'synthetic.bin'));
el('fileInput').files = input.files;
el('fileInput').dispatchEvent(new Event('change'));
await waitFor(() => !el('startButton').disabled, 10000);

const decoded = new Map();
const submitted = new Map();
const wireParts = new Map();
const src = el('canvas');
const canvas = document.createElement('canvas');
const scale = 1.25;
canvas.width = Math.ceil(src.width * scale) + 48;
canvas.height = Math.ceil(src.height * scale) + 48;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
Module._cimbard_configure_decode(68);
const img = Module._malloc(canvas.width * canvas.height * 4);
const capacity = Module._cimbard_get_bufsize();
const fountain = Module._malloc(capacity);
const outSize = Module._cimbard_get_decompress_bufsize();
const out = Module._malloc(outSize);
let failure;

function scanFrame() {
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.filter = 'blur(0.75px)';
  ctx.drawImage(src, 24, 24, src.width * scale, src.height * scale);
  Module.HEAPU8.set(ctx.getImageData(0, 0, canvas.width, canvas.height).data, img);
  const length = Module._cimbard_scan_extract_decode(img, canvas.width, canvas.height, 4, fountain, capacity);
  if (length <= 0) return;
  const id = Module._cimbard_fountain_decode(fountain, length);
  if (id <= 0n) return;
  const key = Number(id & 0xffffffffn);
  const n = Module._cimbard_get_filename(key, out, outSize);
  if (n <= 0) throw Error('Missing decoded filename');
  const name = new TextDecoder().decode(Module.HEAPU8.slice(out, out + n));
  const parts = [];
  for (;;) {
    const count = Module._cimbard_decompress_read(key, out, outSize);
    if (count <= 0) break;
    parts.push(Module.HEAPU8.slice(out, out + count));
  }
  const wire = key & 127; // v0.6.4 FountainMetadata, first byte in little-endian WASM.
  if (wireParts.has(wire)) throw Error('Duplicate wire identity for distinct decoded units');
  const blob = new Blob(parts);
  decoded.set(name, blob);
  wireParts.set(wire, blob);
}

const render = Module._cimbare_render;
function sample() {
  const result = render();
  Module._cimbare_render = sample; // The glue replaces its export on first use.
  if (failure || result !== 1) return result;
  try {
    const item = AirGapBigFileApp.state.currentItem;
    const name = item.kind === 'manifest' ? 'manifest.json' : 'synthetic.part0' + item.index + '.bin';
    submitted.set(name, (submitted.get(name) || 0) + 1);
    if (!decoded.has(name)) scanFrame();
  } catch (error) { failure = error; }
  return result;
}
Module._cimbare_render = sample;
if (shorten || el('shortenRepeats')) el('shortenRepeats').checked = shorten;
el('fps').value = '30';
const started = performance.now();
el('startButton').click();
try {
  await waitFor(() => decoded.size === 3 || failure, 95000);
  if (failure) throw failure;
} finally {
  el('stopButton').click();
  Module._cimbare_render = render;
  for (const pointer of [img, fountain, out]) Module._free(pointer);
}
const elapsedMs = Math.round(performance.now() - started);
const manifest = JSON.parse(await decoded.get('manifest.json').text());
const hash = async data => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
};
if (manifest.chunk_count !== 2 || manifest.filename !== 'synthetic.bin') throw Error('Unexpected manifest');
if (wireParts.get(manifest.encode_id_base % 128) !== decoded.get('manifest.json')) {
  throw Error('Manifest wire ID differs');
}
const parts = [];
for (const [i, descriptor] of manifest.chunks.entries()) {
  const part = await wireParts.get((manifest.encode_id_base + i + 1) % 128).arrayBuffer();
  if (descriptor.index !== i || part.byteLength !== descriptor.size || await hash(part) !== descriptor.sha256) {
    throw Error('Chunk verification failed');
  }
  parts.push(part);
}
const recovered = new Uint8Array(await new Blob(parts).arrayBuffer());
const truth = 'a488ad775d9305e156c6f482310f8b5d0c6cbb5ef9af2aafc74706da872d3d23';
if (manifest.sha256 !== truth || await hash(recovered) !== truth || recovered.length !== bytes.length ||
    !bytes.every((value, index) => value === recovered[index])) throw Error('Reconstruction differs');
const resources = performance.getEntriesByType('resource').map(entry => entry.name);
if (resources.length) throw Error('Unexpected resource requests: ' + resources.join(', '));
return JSON.stringify({ shorten, elapsedMs, frames: Object.fromEntries(submitted), size: recovered.length, sha256: truth, resources });
