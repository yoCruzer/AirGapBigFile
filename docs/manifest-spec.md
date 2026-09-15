# cimbar-bigfile Manifest v1 Profile

AirGap BigFile v1 preserves the existing application schema so AirGapFree can
receive it without a protocol fork.

```json
{
  "version": 1,
  "tool": "cimbar-bigfile",
  "filename": "example.bin",
  "total_size": 123456789,
  "sha256": "<whole-file-sha256>",
  "chunk_size": 5242880,
  "chunk_count": 24,
  "encode_id_base": 12345,
  "chunks": [
    {"index": 0, "size": 5242880, "sha256": "<chunk-sha256>"}
  ]
}
```

## Fields and validation

- `version` is exactly integer `1`.
- `tool` is exactly `"cimbar-bigfile"`.
- `filename` is a non-empty UTF-8 string and is not chunk identity. To match
  AirGapFree it cannot be `.`, `..`, contain `/` or `\\`, or contain Unicode
  control characters in Unicode General Categories `Cc` or `Cf` (including
  soft-hyphen, bidi, and other format controls).
- `total_size`, `chunk_size`, and every chunk `size` are positive safe integers.
  Zero-byte transfers are rejected.
- `sha256` fields are lowercase 64-character hexadecimal SHA-256 values.
- `chunk_count` is `chunks.length`, is at least one, and is at most 120.
- Chunks have consecutive zero-based indexes. Every non-final chunk has exactly
  `chunk_size` bytes, no chunk exceeds it, and sizes sum to `total_size`.
- `encode_id_base` is an unsigned 16-bit integer.

Production AirGap BigFile manifests use binary 5 MiB or 10 MiB chunks. Five MiB
is the safer default when it stays within 120 chunks. Ten MiB is used when needed;
files above 120 × 10 MiB are rejected. The general v1 schema permits smaller
sizes for the cross-language fixture in `protocol/fixtures/v1/`.

## Stream mapping

```text
logical offset 0     = manifest
logical offset i + 1 = chunk i

logicalEncodeID = (encode_id_base + logicalOffset) & 0xFFFF
wireID          = ((encode_id_base & 0x7F) +
                   (logicalOffset & 0x7F)) & 0x7F
```

The manifest stream filename is `manifest.json`. Chunk `i` uses
`<basename>.partNN.bin`, with at least two digits. Receiver identity is the
expected wire ID plus size plus SHA-256, not this filename.

The base is generated with browser cryptographic randomness. It is a transport
epoch, so a later resend of the same logical file may use another base without
changing Receiver transfer identity.

## Serialization

Runtime serialization is compact JSON encoded as UTF-8. Unknown fields do not
change the meaning of required v1 fields. A change to required field semantics
would require a future protocol version and is outside v1.
