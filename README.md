# AirGap BigFile

English | [简体中文](README.zh-Hans.md)

AirGap BigFile is a browser-based optical sender for large files. It prepares one
local file, renders a sequence of CIMBAR frames, and is designed to interoperate
with the native iOS AirGapFree receiver. It is the recommended Sender for
AirGapFree, which is a separate project.

Selected files are processed locally in the browser: selection, hashing, encoding
and optical sending do not upload file contents to a server. The online page
needs network access to load; the downloaded standalone HTML can run offline.

## Use

### Online

Open the [GitHub Pages Sender](https://yocruzer.github.io/AirGapBigFile/) on your
computer. Page loading requires network access; your selected file stays local.

### Offline

Download [AirGapBigFile-v1.1.0.standalone.html](https://github.com/yoCruzer/AirGapBigFile/releases/download/v1.1.0/AirGapBigFile-v1.1.0.standalone.html)
from [GitHub Releases](https://github.com/yoCruzer/AirGapBigFile/releases/tag/v1.1.0).
After download, double-click it (`file://` is supported) to use it offline.
Download `SHA256SUMS.txt` alongside it and verify with `shasum -a 256 -c SHA256SUMS.txt`.

### Send a file

1. Open the online Sender or downloaded standalone.
2. Keep the recommended stable defaults: **15 FPS / 2×**.
3. Choose one file and wait for preparation to finish.
4. Start sending and scan the animated code with AirGapFree.
5. If AirGapFree reports a missing chunk, choose that number under **Focused
   resend**.

Preparation hashes the file incrementally and reads one 5 MiB or 10 MiB chunk at
a time. A file is rejected when 10 MiB chunks would exceed the Receiver's v1
limit of 120 chunks.

## Sender v1.1 controls

The header switches between English and Simplified Chinese without reloading or
resetting preparation or sending. A manual preference overrides browser language;
only `airgapBigFile.language` is saved in localStorage. Files, names, hashes and
contents are never persisted. If storage is unavailable, switching still works
but may not survive a reload.

Advanced controls offer 12 / **15 (default)** / 18 / 20 / 24 / 30 FPS and
1.2× (fast / experimental) / 1.5× / **2× (default)** / 3× burst factors.
FPS and redundancy are locked while sending or paused; Stop unlocks them.
Prepared chunk size stays locked. Lower redundancy shortens each burst but can
require more replays; high-FPS profiles are experimental and depend on browser,
display and receiver camera.
Neither setting is a performance or reliability promise.

Rendering uses requestAnimationFrame with fractional target deadlines, submitting
at most one optical frame per callback even after a stall. Actual FPS and frame
interval measure browser submissions over approximately two seconds of visible
sending, with at least one second of samples. Start and Resume reset samples;
pause time is excluded. This cannot verify physical display output or receiver
throughput. Burst remaining and sweep/focus duration estimates use actual FPS
when available, otherwise target FPS. They exclude preparation and do not model
future chunk loading delays.

Hidden pages pause automatically and require explicit Resume after returning.
A browser may not report ordinary window occlusion as hidden: keep the code
unobstructed. Screen Wake Lock is best effort while sending and released on pause,
stop or runtime error. If unavailable or denied, ensure the computer will not
turn off its display; sending still works.

There is **no ACK channel**. The Sender cannot know whether AirGapFree has
completed the file. Estimates are display-cycle durations, never receiver
completion countdowns or effective KiB/s. Focused resend restarts the selected
chunk's fountain sequence. See the [device test matrix](docs/SENDER_V1_1_DEVICE_TEST.md).

## Development

The maintainable source is `send.html` plus the scripts under `src/`. The
generated standalone file must not be edited by hand.

```bash
npm test
npm run check
python3 scripts/build-standalone.py
python3 scripts/verify-standalone.py
```

`send.html` uses local vendored assets and is convenient through a local static
server during development. `AirGapBigFile.standalone.html` is the primary
end-user artifact and does not require a server.

## Compatibility and design

- [AirGap BigFile v1 architecture](docs/AIRGAP_BIGFILE_V1.md)
- [Manifest v1 specification](docs/manifest-spec.md)
- [Upstream provenance](UPSTREAM.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The manifest deliberately remains `version: 1`, `tool: "cimbar-bigfile"`.
AirGapFree receiver code and libcimbar/Wirehair internals are outside this
repository and are not modified here.

## Status

User-reported real-device basic E2E is **PASS** for candidate `140c2d1`: the
Sender sent successfully and AirGapFree received successfully. The public
distribution preserves that Sender runtime. A broad device/performance matrix
has not been completed; experimental profiles remain device-dependent.

For vulnerabilities, use [private security reporting](SECURITY.md). Ordinary
bugs and compatibility reports belong in [Issues](https://github.com/yoCruzer/AirGapBigFile/issues).

## License

Project-authored code is MIT licensed; see [LICENSE](LICENSE). Vendored libcimbar
and Wirehair components retain their original licenses. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `vendor/`.
