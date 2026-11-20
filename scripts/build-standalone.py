#!/usr/bin/env python3
"""Build the deterministic, fully inlined AirGap BigFile artifact."""

from __future__ import annotations

import base64
import hashlib
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "send.html"
OUTPUT = ROOT / "AirGapBigFile.standalone.html"
WASM_RELATIVE = "vendor/cimbar-wasm-v0.6.4/cimbar_js.2026-01-20T0312.wasm"
GLUE_RELATIVE = "vendor/cimbar-wasm-v0.6.4/cimbar_js.2026-01-20T0312.js"
SCRIPT_PATTERN = re.compile(r'<script src="([^"]+)"></script>')
SCRIPT_END_PATTERN = re.compile(r"</script[\s/>]", re.IGNORECASE)


def _local_file(relative: str) -> Path:
    path = (ROOT / relative).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError as error:
        raise ValueError(f"script escapes repository: {relative}") from error
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def _inline_script(relative: str, wasm_base64: str) -> str:
    source = _local_file(relative).read_text(encoding="utf-8")
    if SCRIPT_END_PATTERN.search(source):
        raise ValueError(f"cannot safely inline script containing </script: {relative}")
    prefix = f"// AIRGAP INLINE BEGIN: {relative}\n"
    if relative == GLUE_RELATIVE:
        prefix += (
            "// Embedded before Emscripten glue so normal runtime performs no WASM fetch.\n"
            f'const AIRGAP_WASM_BASE64 = "{wasm_base64}";\n'
            "Module.wasmBinary = (() => {\n"
            "  const binary = atob(AIRGAP_WASM_BASE64);\n"
            "  const bytes = new Uint8Array(binary.length);\n"
            "  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);\n"
            "  return bytes;\n"
            "})();\n"
        )
    return f"<script>\n{prefix}{source}\n// AIRGAP INLINE END: {relative}\n</script>"


def build_html() -> str:
    html = SOURCE.read_text(encoding="utf-8")
    wasm = _local_file(WASM_RELATIVE).read_bytes()
    wasm_base64 = base64.b64encode(wasm).decode("ascii")
    scripts = SCRIPT_PATTERN.findall(html)
    if not scripts or scripts[-1] != GLUE_RELATIVE:
        raise ValueError("send.html must load libcimbar glue last")
    if len(set(scripts)) != len(scripts):
        raise ValueError("send.html contains duplicate runtime script references")
    hashes = []

    def embed(match):
        tag = _inline_script(match.group(1), wasm_base64)
        script = tag[len("<script>"):-len("</script>")].encode("utf-8")
        digest = base64.b64encode(hashlib.sha256(script).digest()).decode("ascii")
        hashes.append(f"'sha256-{digest}'")
        return tag

    html = SCRIPT_PATTERN.sub(embed, html)
    return html.replace("connect-src 'self'", "connect-src 'none'", 1).replace(
        "script-src 'self'", "script-src " + " ".join(hashes), 1)


def main() -> int:
    try:
        output = build_html()
        temporary = tempfile.NamedTemporaryFile(dir=OUTPUT.parent, delete=False)
        try:
            with temporary:
                temporary.write(output.encode("utf-8"))
            os.chmod(temporary.name, 0o644)
            os.replace(temporary.name, OUTPUT)
        finally:
            if os.path.exists(temporary.name):
                os.unlink(temporary.name)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"built {OUTPUT.name} ({OUTPUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
