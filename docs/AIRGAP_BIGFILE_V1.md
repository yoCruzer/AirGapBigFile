# AirGap BigFile v1 Architecture

This document is the authoritative application-layer contract for v1. A change
to these rules must update tests and documentation in the same focused commit.

## Product boundary

AirGap BigFile is a standalone, offline browser sender. AirGapFree is a separate
native iOS receiver. v1 sends exactly one input file and has no network, cloud,
bundle, folder, acknowledgement, or receiver-control channel.

## Protocol

The wire/application protocol is the strict AirGapFree-compatible profile of
`cimbar-bigfile` manifest v1:

```json
{"version":1,"tool":"cimbar-bigfile"}
```

The full schema is in `manifest-spec.md`. Chunk count is at most 120. Product
chunk sizes are binary 5 MiB and 10 MiB. Five MiB is preferred; 10 MiB is chosen
when necessary to stay within 120 chunks. A larger file is rejected.

Receiver compatibility is enforced during preparation: empty files are rejected,
and logical filenames cannot be empty, `.`, `..`, contain path separators, or
contain Unicode `Cc`/`Cf` control and format characters.

Logical offset zero is the manifest; logical offset `i + 1` is chunk `i`.

```text
logicalEncodeID = (encode_id_base + logicalOffset) & 0xFFFF
wireID          = ((encode_id_base & 0x7F) +
                   (logicalOffset & 0x7F)) & 0x7F
```

`encode_id_base` is a random unsigned 16-bit transport epoch generated with
`crypto.getRandomValues`. It is not part of the Receiver's logical transfer
identity. Filename is only a consistency hint; Receiver chunk identity is the
expected wire ID, size, and SHA-256.

## State machine

```text
idle -> preparing -> ready -> sending
          |           ^        |  |
          v           |        |  +-> stopped -> ready
       cancelled      +--------+----> paused -> sending
          |
          v
        error
```

Transmission mode is `sweep` or `focus`. Sender state contains the selected
`File`, manifest, chunk descriptors, preparation progress, current scheduler
item/pass, mode, optional focused chunk, FPS, and burst factor. It never claims
that a Receiver saved or verified anything.

## Preparation and memory model

Production preparation never calls whole-file `file.arrayBuffer()`. It iterates
`File.slice(offset, end)`, reads one chunk, updates a genuine incremental
SHA-256, computes that chunk's SHA-256, then releases the chunk bytes. Persistent
prepared state stores only the File reference, manifest, and descriptors:

```text
{ index, offset, size, sha256 }
```

Encoding loads only the selected descriptor's slice. Intended JavaScript file
data residency is one current 5 MiB or 10 MiB chunk, plus the small manifest and
state. This is not a claim about total browser/WASM process RSS.

## Scheduler

Normal sweep is a manifest beacon before every chunk:

```text
M, C0, M, C1, ..., M, Cn, M, C0, ...
```

Focused resend of chunk `k` is:

```text
M, Ck, M, Ck, ...
```

The scheduler is independent of rendering. Pause freezes the current scheduler
unit. A unit already claimed from the scheduler remains owned while its ranged
chunk load is pending; Resume joins that same initialization promise and cannot
claim another unit. An initialized libcimbar stream also remains alive and Resume
continues rendering it without reinitialization. Switching units reinitializes
the encoder. Async completions commit readiness/render state only when their
ownership token is still the lifecycle's current initialized unit; invalidated
completions have no post-await runtime effects.

## Burst factor and fountain semantics

A burst factor controls how many frames are rendered from one continuously
initialized stream before switching. The engineering estimate is
`max(30, ceil(byteCount / 7500 * burstFactor))`; it is not an exact throughput or
decode guarantee.

Calling `cimbare_init_encode` creates/resets an encoder stream. Reinitializing a
chunk later starts its fountain sequence again and primarily retransmits the
same initial prefix. Only additional frames within one uninterrupted initialized
stream extend that stream's fountain-block prefix. v1 does not add block seeking
or encoder-resume APIs.

## Runtime and distribution

Development files load only repository-local classic scripts. The deterministic
build inlines application JavaScript, incremental SHA-256, Emscripten glue, and
the libcimbar WASM into `AirGapBigFile.standalone.html`. Normal runtime works from
`file://`, needs no server, and performs no network requests.

## Receiver assumptions

AirGapFree detects the manifest, stages chunks received before it, associates
chunks by expected wire ID + size + SHA-256, persists verified chunks, skips
replays, resumes at verified-chunk granularity, incrementally reassembles, checks
the whole-file SHA-256, publishes, and preserves deletion integrity. None of
that behavior is implemented or modified here.

## Non-goals and future work

Deferred: real optical acceptance, performance/FPS/ECC tuning, adaptive camera
feedback, reverse ACK, multi-file/folders, manifest v2, protocol servers, cloud
features, Receiver changes, and libcimbar/Wirehair changes.
