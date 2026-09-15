# AirGap BigFile

English | [简体中文](README.zh-Hans.md)

AirGap BigFile is a browser-based optical sender for large files. It prepares one
local file, renders a sequence of CIMBAR frames, and is designed to interoperate
with the native iOS AirGapFree receiver.

The selected file stays on this computer. The application has no upload path and
the distributable runs without a network connection.

## Use

1. Download `AirGapBigFile.standalone.html`.
2. Double-click it (a `file://` URL is supported).
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
require more replays; higher FPS depends on browser, display and receiver camera.
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

Browser acceptance is **MANUAL BROWSER ACCEPTANCE PENDING**.
The standalone candidate is locally testable. Real Mac-screen-to-iPhone optical
acceptance and performance tuning are **PENDING DEVICE TEST**.

## License

Project-authored code is MIT licensed; see [LICENSE](LICENSE). Vendored libcimbar
and Wirehair components retain their original licenses. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `vendor/`.
