# Trader Race 3D – working rules

AUTO-LEARN RULE: Before every change, read this file. Every correction or feedback from the owner becomes a permanent rule here; commit and push it with the change.

## How the race view is built
- Edit `tools/r3d.js` (renderer) and `tools/build.py` (HTML/sim patches), then run `python3 tools/build.py`. Never hand-edit the generated block in `index.html`. `turbo_usdt_racer_3d.html` must stay byte-identical (the build copies it).
- Assets live in `assets/game3d/` and carry a `?v=` cache-bust (`ASSET_V` in r3d.js). Bump it whenever an asset changes.
- Work on the branch, push, share a commit-pinned raw.githack preview link. Do not merge to `main` or touch the VPS until the owner says "deploy".
- Every feedback round: apply edits on top of the latest output; ignore older chat instructions.

## Owner's rules (from feedback)
- Cars: the owner's Ferrari GLB (`car.glb`), same design, only body paint changes: yellow left, blue middle (Player 1), red right (YOU). Glossy paint with reflections; tail lights and exhausts glow; rear engine cover shows detail, not solid black.
- Layout must follow the reference image: 3 lanes, START text, checkered line, white lane dashes visible from the grid, two BOOST pads (blue glow, ⚡BOOST text, arrows).
- Start circle: exactly centred horizontally in the screen.
- Left HUD buttons: compact (owner adjusted size twice). Players panel / user id stays unchanged.
- Camera: chase view showing all three cars fully; yellow car must not hide behind the Players panel.
- Buildings: glass towers with reflections and varied shades/types, set far back and smaller; no harsh grid pattern.
- Trees: real leafy trees (owner's maple + pine packs), mixed small/medium, uneven density. No blob trees.
- Grass: short and soft; smooth ground texture.
- Road: dark asphalt with texture and slight sheen; gentle curves.
- Guard rail: plain metal with posts, no glow.
- Lighting: warm sunshine, bright colours, real HDRI sky, light distance fog.
- Gameplay feel: slow sense of speed (reduced several times); fewer obstacles and boosters than default; rail scrape on over-steer; jump ramps; two-lane broken trucks; car-to-car hits.
