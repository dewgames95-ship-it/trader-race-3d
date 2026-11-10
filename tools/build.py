#!/usr/bin/env python3
"""Inject tools/r3d.js (the Three.js race renderer) into index.html.

Run from the repo root:  python3 tools/build.py
Safe to re-run: the injected blocks are replaced in place. Also refreshes the
byte-identical twin turbo_usdt_racer_3d.html.
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
TWIN = ROOT / "turbo_usdt_racer_3d.html"
THREE_VERSION = "0.187.0"

R3D_BEGIN = "  // >>> R3D-BEGIN (generated from tools/r3d.js)\n"
R3D_END = "  // <<< R3D-END\n"
LOADER_BEGIN = "<!-- R3D-LOADER-BEGIN -->\n"
LOADER_END = "<!-- R3D-LOADER-END -->\n"

LOADER = f"""<script type="module">
// Three.js for the race view: local copy first, pinned CDN second, 2D renderer if both fail.
const sources = [
  './assets/vendor/three/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}/build/three.module.js'
];
let lastError = 'three.js unavailable';
for (const src of sources) {{
  try {{ window.THREE = await import(src); break; }} catch (err) {{ lastError = String(err && err.message || err); }}
}}
if (!window.THREE) window.__trThreeError = lastError;
window.dispatchEvent(new Event('tr-three'));
</script>
"""

ANCHOR = "  resetToIdleState();\n  let lastSimWallMs = Date.now();\n"
MAIN_SCRIPT = "<script>\n(() => {\n  // ====="


def strip(src, begin, end):
    return re.sub(re.escape(begin) + r".*?" + re.escape(end), "", src, flags=re.S)


def once(src, old, new, what):
    if src.count(old) != 1:
        sys.exit(f"build: expected exactly one '{what}', found {src.count(old)}")
    return src.replace(old, new)


def main():
    src = HTML.open(encoding="utf-8", newline="").read()
    src = strip(strip(src, R3D_BEGIN, R3D_END), LOADER_BEGIN, LOADER_END)

    # The old Canvas 2D renderer stays as the fallback under a new name, and its
    # canvas becomes a transparent layer (position meter) above the WebGL canvas.
    if "function renderScene2D() {" not in src:
        src = once(src, "  function renderScene() {\n", "  function renderScene2D() {\n", "renderScene()")
    if "canvas.getContext('2d', { alpha: true })" not in src:
        src = once(src, "canvas.getContext('2d', { alpha: false })", "canvas.getContext('2d', { alpha: true })", "2d context")

    r3d = (ROOT / "tools" / "r3d.js").read_text(encoding="utf-8")
    src = once(src, ANCHOR, R3D_BEGIN + r3d + R3D_END + ANCHOR, "render-loop anchor")
    src = once(src, MAIN_SCRIPT, LOADER_BEGIN + LOADER + LOADER_END + MAIN_SCRIPT, "main script tag")

    with HTML.open("w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    shutil.copyfile(HTML, TWIN)
    print(f"build: ok, index.html {len(src.encode('utf-8'))} bytes, twin refreshed")


if __name__ == "__main__":
    main()
