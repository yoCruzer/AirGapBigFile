#!/usr/bin/env python3
"""Verify the standalone artifact is current and self-contained."""

from __future__ import annotations

import base64
import hashlib
import re
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD_SCRIPT = ROOT / "scripts" / "build-standalone.py"
ARTIFACT = ROOT / "AirGapBigFile.standalone.html"
EXPECTED_WASM_SHA256 = "8b6decf42cd6a79aa7ec1c9044f327959d1ee1fcf7b825f3c1d7e3c1b92b517e"
VENDOR_SCRIPTS = {
    "vendor/js-sha256-0.11.1/sha256.js": "2db6c8e554fbee14672368a0d7551a8ddd841ee96c91526eb7987a0179cfc717",
    "vendor/cimbar-wasm-v0.6.4/cimbar_js.2026-01-20T0312.js": "5a94ff537547063c125542a4aead646f93fb44154fc1385c9a117a7d38dd7cd1",
}


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 1


def load_builder():
    namespace = runpy.run_path(str(BUILD_SCRIPT))
    return namespace["build_html"]


def main() -> int:
    if not ARTIFACT.is_file():
        return fail(f"missing {ARTIFACT.name}")

    data = ARTIFACT.read_bytes()
    try:
        expected = load_builder()().encode("utf-8")
    except (OSError, RuntimeError, ValueError) as error:
        return fail(str(error))
    if data != expected:
        return fail("artifact is stale or build is not deterministic")

    html = data.decode("utf-8")
    for path, digest in VENDOR_SCRIPTS.items():
        if hashlib.sha256((ROOT / path).read_bytes()).hexdigest() != digest:
            return fail(f"vendored script differs from its pin: {path}")
    scripts = re.findall(r"<script>(.*?)</script>", html, re.DOTALL)
    hashes = {"'sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() + "'" for s in scripts}
    policy = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)">', html)
    if not policy:
        return fail("standalone CSP is missing")
    directives = {}
    for directive in policy[1].split(";"):
        name, *sources = directive.split()
        if name in directives:
            return fail(f"duplicate CSP directive: {name}")
        directives[name] = set(sources)
    if directives != {
        "default-src": {"'none'"}, "base-uri": {"'none'"}, "form-action": {"'none'"},
        "connect-src": {"'none'"}, "style-src": {"'unsafe-inline'"},
        "script-src": hashes | {"'wasm-unsafe-eval'"},
    }:
        return fail("standalone CSP must restrict connections and pin every inline script")
    if re.search(r"<script\s+[^>]*src=", html, re.IGNORECASE):
        return fail("artifact contains an external script reference")
    if re.search(r"<link\s+[^>]*href=", html, re.IGNORECASE):
        return fail("artifact contains an external stylesheet reference")
    for required in (
        "AIRGAP INLINE BEGIN: vendor/js-sha256-0.11.1/sha256.js",
        "AIRGAP INLINE BEGIN: src/preparation.js",
        "AIRGAP INLINE BEGIN: src/scheduler.js",
        "AIRGAP INLINE BEGIN: src/unit-lifecycle.js",
        "AIRGAP INLINE BEGIN: src/i18n.js",
        "AIRGAP INLINE BEGIN: src/render-timing.js",
        "AIRGAP INLINE BEGIN: src/wake-lock.js",
        "AIRGAP INLINE BEGIN: src/app.js",
        "AIRGAP INLINE BEGIN: src/encoder.js",
        "简体中文",
        "Actual FPS",
        "发送已自动暂停",
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
