# Credits

## 3D models

- **Ferrari F8 Tributo** — car model used for all three race cars.
  Source: https://sketchfab.com/3d-models/ferrari-f8-tributo-61d8929fd08048bf8ee2e143df2de796
  License: CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Changes: mesh simplified, textures resized/converted to WebP, meshopt compressed, body paint recoloured at runtime.
- **Pine trees pack** and **Maple (Acer) trees pack** — roadside trees (LOD1 meshes of a few variants).
  Supplied by the project owner (Sketchfab exports). Changes: unused variants/LODs removed, textures resized to 1024px WebP, meshopt compressed.

## Libraries

- **three.js** r170 (MIT) — `lib/three.module.min.js`, `lib/GLTFLoader.js`, `lib/BufferGeometryUtils.js`.
- **meshoptimizer** decoder (MIT) — `lib/meshopt_decoder.module.js`.

Everything else in the scene (road, lane lines, START/FINISH markings, boost pads, guard rails, grass, rocks, towers, obstacles) is generated in code in `scene3d.js`.
