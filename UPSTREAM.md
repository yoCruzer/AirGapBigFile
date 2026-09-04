# Upstream Provenance

- Repository: <https://github.com/peipei-labs/cimbar-bigfile>
- Audited foundation: `5ba3ac26e1ea3a5736083b3714648760a503e2a3`
- Commit message: `Merge pull request #12 from peipei-labs/fix/clear-prepared-file`
- Foundation date used by this project: 2026-09-04

## Reused

The Git history, MIT project license, manifest-v1 format, standalone-build idea,
and unmodified libcimbar v0.6.4 WASM/glue assets are retained. The vendored WASM
continues to embed Wirehair.

## Intentionally changed

The product is now a one-file AirGapFree sender. Application code is modular,
preparation is memory-bounded with incremental whole-file hashing, scheduling
uses manifest beacons, focused resend is explicit, and the primary artifact is
`AirGapBigFile.standalone.html`. CFC-specific confirmation, persisted receiver
completion, bundles, and misleading fountain-continuation claims are removed
from the active product.

No libcimbar or Wirehair source/protocol internal is changed.

## License notes

Upstream project-authored code is MIT licensed under `LICENSE`. Vendored
libcimbar is MPL-2.0 and Wirehair is BSD-3-Clause; full texts remain under
`vendor/`. Corresponding libcimbar source is available from its v0.6.4 tag, as
recorded in `vendor/README.md`.
