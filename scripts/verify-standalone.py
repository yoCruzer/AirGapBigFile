#!/usr/bin/env python3
"""Verify the standalone artifact is current and self-contained."""

from __future__ import annotations

import base64
import hashlib
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD_SCRIPT = ROOT / "scripts" / "build-standalone.py"
ARTIFACT = ROOT / "AirGapBigFile.standalone.html"
EXPECTED_WASM_SHA256 = "8b6decf42cd6a79aa7ec1c9044f327959d1ee1fcf7b825f3c1d7e3c1b92b517e"


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 1


def load_builder():
    spec = importlib.util.spec_from_file_location("airgap_standalone_builder", BUILD_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load build script")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if not ARTIFACT.is_file():
        return fail(f"missing {ARTIFACT.name}")

    data = ARTIFACT.read_bytes()
    try:
        expected = load_builder().build_html().encode("utf-8")
    except (OSError, RuntimeError, ValueError) as error:
        return fail(str(error))
    if data != expected:
        return fail("artifact is stale or build is not deterministic")

    html = data.decode("utf-8")
    if re.search(r"<script\s+[^>]*src=", html, re.IGNORECASE):
        return fail("artifact contains an external script reference")
    if re.search(r"<link\s+[^>]*href=", html, re.IGNORECASE):
        return fail("artifact contains an external stylesheet reference")
    for required in (
        "AIRGAP INLINE BEGIN: vendor/js-sha256-0.11.1/sha256.js",
        "AIRGAP INLINE BEGIN: src/preparation.js",
        "AIRGAP INLINE BEGIN: src/scheduler.js",
        "AIRGAP INLINE BEGIN: src/app.js",
        "Module.wasmBinary",
    ):
        if required not in html:
            return fail(f"missing embedded runtime component: {required}")

    match = re.search(r'const AIRGAP_WASM_BASE64 = "([A-Za-z0-9+/=]+)";', html)
    if not match:
        return fail("embedded WASM payload marker is missing")
    try:
        wasm = base64.b64decode(match.group(1), validate=True)
    except ValueError as error:
        return fail(f"invalid embedded WASM base64: {error}")
    if hashlib.sha256(wasm).hexdigest() != EXPECTED_WASM_SHA256:
        return fail("embedded WASM does not match the pinned libcimbar binary")

    print(f"verified {ARTIFACT.name}")
    print(f"size: {len(data)} bytes")
    print(f"sha256: {hashlib.sha256(data).hexdigest()}")
    print("runtime assets: inline application JS + js-sha256 + libcimbar WASM/glue")
    print("required external runtime references: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
