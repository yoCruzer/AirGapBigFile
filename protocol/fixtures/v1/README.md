# Manifest v1 golden fixture

`fixture.bin` is the bytewise concatenation of `part00.bin` and `part01.bin`.
The intentionally tiny `chunk_size` keeps this cross-language fixture small; it
validates the general manifest-v1 schema, while production AirGap BigFile uses
the stricter 5 MiB/10 MiB profile.

| Item | SHA-256 |
| --- | --- |
| `part00.bin` (9 B) | `e8171c6244e4ee58bc162be05d326c28cb8dbb0ad766c1263af98937c254a2f4` |
| `part01.bin` (8 B) | `af6377eb43ee89cb3cb5917e76d0d3fe1d5eba0759051b819878add118bc5ea4` |
| whole fixture (17 B) | `623154896e8320c01ce5cde37a917cf3df1884690f32d3012b462484c8826285` |

The encode base is 65530:

| Logical item | Logical offset | Logical encode ID | Expected 7-bit wire ID |
| --- | ---: | ---: | ---: |
| manifest | 0 | 65530 | 122 |
| chunk 0 | 1 | 65531 | 123 |
| chunk 1 | 2 | 65532 | 124 |
