# AirGap BigFile

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

## Development

The maintainable source is `send.html` plus the scripts under `src/`. The
generated standalone file must not be edited by hand.

```bash
npm test
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

The standalone candidate is locally testable. Real Mac-screen-to-iPhone optical
acceptance and performance tuning are **PENDING DEVICE TEST**.

## License

Project-authored code is MIT licensed; see [LICENSE](LICENSE). Vendored libcimbar
and Wirehair components retain their original licenses. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `vendor/`.
