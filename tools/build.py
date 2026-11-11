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

LOADER = f"""<style>#centerStartCircle {{ scale: 0.5; }} #leaderboardBtn, #modeSelectHudBtn, #raceInfoBtn, #howToPlayBtn {{ zoom: 0.7; }}</style>
<script type="importmap">
{{ "imports": {{ "three": "./assets/vendor/three/build/three.module.js", "three/addons/": "./assets/vendor/three/addons/" }} }}
</script>
<script type="module">
// Three.js for the race view: local copy first, pinned CDN second, 2D renderer if both fail.
const CDN = 'https://cdn.jsdelivr.net/npm/three@{THREE_VERSION}';
const sources = [
  {{ core: 'three', gltf: 'three/addons/loaders/GLTFLoader.js', draco: 'three/addons/loaders/DRACOLoader.js', dracoPath: './assets/vendor/three/addons/libs/draco/' }},
  {{ core: CDN + '/+esm', gltf: CDN + '/examples/jsm/loaders/GLTFLoader.js/+esm', draco: CDN + '/examples/jsm/loaders/DRACOLoader.js/+esm', dracoPath: CDN + '/examples/jsm/libs/draco/gltf/' }}
];
let lastError = 'three.js unavailable';
for (const src of sources) {{
  try {{
    const [core, gltf, draco] = await Promise.all([import(src.core), import(src.gltf), import(src.draco)]);
    window.__trThreeAddons = {{ GLTFLoader: gltf.GLTFLoader, DRACOLoader: draco.DRACOLoader, dracoPath: src.dracoPath }};
    window.THREE = core;
    break;
  }} catch (err) {{ lastError = String(err && err.message || err); }}
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

    # Brief v3: three lanes, fixed grid order (yellow / blue / red), more and more varied obstacles.
    SIM = [
        ("const LANE_CENTERS = [-0.75, -0.25, 0.25, 0.75];", "const LANE_CENTERS = [-0.6667, 0, 0.6667];", 1),
        ("    const availLanes = [0, 1, 2, 3];\n    for (let i = availLanes.length - 1; i > 0; i--) {", "    const availLanes = [1, 2, 0]; // grid: bot2 left, bot1 middle, player right\n    for (let i = 0; i > 0; i--) {", 1),
        ("{ id: 1, z: 76, lane: 1, x: LANE_CENTERS[1],", "{ id: 1, z: 76, lane: 0, x: LANE_CENTERS[0],", 1),
        ("{ id: 4, z: 215, lane: 3, x: LANE_CENTERS[3],", "{ id: 4, z: 215, lane: 1, x: LANE_CENTERS[1],", 1),
        ("const obstacleTypes = ['barrier', 'cone', 'barrel', 'brokentruck', 'brokencar'];", "const obstacleTypes = ['barrier', 'cone', 'tyres', 'roadblock', 'oil', 'barricade', 'barrel'];", 1),
        ("dist < FINISH_LINE_Z - 110; dist += 84)", "dist < FINISH_LINE_Z - 110; dist += 64)", 1),
        ("const l = Math.floor(rng() * 4);", "const l = Math.floor(rng() * 3);", 1),
        ("const freeLanes = [0, 1, 2, 3].filter(", "const freeLanes = [0, 1, 2].filter(", 1),
        ("Math.min(3, player.lane + dir)", "Math.min(2, player.lane + dir)", 1),
        ("Math.min(3, victim.lane + knockDir)", "Math.min(2, victim.lane + knockDir)", 1),
        ("Math.min(3, altLane)", "Math.min(2, altLane)", 1),
        ("const altLane = rearCar.lane < 2 ?", "const altLane = rearCar.lane < 1 ?", 1),
        ("tel.lane >= 0 && tel.lane <= 3)", "tel.lane >= 0 && tel.lane <= 2)", 1),
        ("    const scores = [0, 0, 0, 0];", "    const scores = [0, 0, 0];", 1),
        ("for (let l = 0; l < 4; l++) {", "for (let l = 0; l < 3; l++) {", 2),
        ("const MIN_DX = 0.34;", "const MIN_DX = 0.44;", 1),
    ]
    for old, new, count in SIM:
        if new in src and old not in src:
            continue
        if src.count(old) != count:
            sys.exit(f"build: sim patch expected {count} of '{old[:40]}', found {src.count(old)}")
        src = src.replace(old, new)

    r3d = (ROOT / "tools" / "r3d.js").read_text(encoding="utf-8")
    src = once(src, ANCHOR, R3D_BEGIN + r3d + R3D_END + ANCHOR, "render-loop anchor")
    src = once(src, MAIN_SCRIPT, LOADER_BEGIN + LOADER + LOADER_END + MAIN_SCRIPT, "main script tag")

    with HTML.open("w", encoding="utf-8", newline="") as fh:
        fh.write(src)
    shutil.copyfile(HTML, TWIN)
    print(f"build: ok, index.html {len(src.encode('utf-8'))} bytes, twin refreshed")


if __name__ == "__main__":
    main()
