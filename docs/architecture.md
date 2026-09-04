# Implementation Structure

The normative design is [AIRGAP_BIGFILE_V1.md](AIRGAP_BIGFILE_V1.md). This file
maps that design to maintainable source.

```text
send.html                         browser UI shell
src/protocol.js                   manifest/profile and ID mapping
src/sender-state.js               sender-owned state machine
src/preparation.js                ranged reads and incremental hashing
src/scheduler.js                  pure sweep/focus item selection
src/unit-lifecycle.js             async unit ownership and initialization join
src/app.js                        DOM, libcimbar adapter, render loop
vendor/js-sha256-0.11.1/          pinned incremental SHA-256
vendor/cimbar-wasm-v0.6.4/        unmodified encoder glue and WASM
scripts/build-standalone.py       deterministic source inliner
scripts/verify-standalone.py      offline/static artifact checks
test/                             Node unit/integration tests
```

Classic scripts are used so the generated file works directly from `file://`.
Each source module also exports through CommonJS for dependency-free Node tests.

The application state is `idle`, `preparing`, `ready`, `sending`, `paused`, or
`error`. Its transfer mode is independently `sweep` or `focus`. State is strictly
sender-local: there is no field for Receiver completion or verification.

The libcimbar adapter initializes a stream only when the pure scheduler selects a
different transmission unit. Once selected, an async lifecycle object owns that
unit until loading and initialization finish. Pausing retains both pending and
initialized ownership; resuming joins a pending load or continues the initialized
stream without advancing the scheduler. Advancing, switching focus, or stopping
invalidates ownership explicitly.
