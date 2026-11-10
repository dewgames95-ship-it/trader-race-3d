# Race view assets

| File | What it is | Source | Licence |
|---|---|---|---|
| `car.glb` | Sports car used for all three racers | `ferrari_f8_tributo.glb` supplied by the project owner, from https://sketchfab.com/3d-models/ferrari-f8-tributo-61d8929fd08048bf8ee2e143df2de796 | Listed there as CC-BY 4.0. Note: the original textures carry "Asphalt 8 Airborne / Gameloft" plate artwork, so the mesh appears to come from that game. Clear the rights before any commercial release. |
| `car_ao.png` | Soft contact shadow under the car | three.js examples (`examples/models/gltf/ferrari_ao.png`) | Same as the car model |
| `sky.jpg`, `sky_front.jpg` | Sky photo (reflections and visible sky) | "Kloofendal 48d Partly Cloudy (Pure Sky)" HDRI, Poly Haven | CC0 |
| `flora.webp` | Tree and rock cut-outs | Renders of Poly Haven models: Fir Tree 01, Pine Tree 01, Tree Small 02, Jacaranda Tree, Island Tree 01, Rock Moss Set 01 | CC0 |

## Changes made to the car model

- Shape, UVs and textures are unchanged. Only the body paint colour is set per car (yellow, blue, red).
- The number plate texture is replaced with a blank plate.
- Textures are re-encoded as JPEG and the geometry is Draco-compressed (`tools/build-car.mjs`).

Road, markings, START/FINISH, boost pads, guard rails, skyline towers, obstacles and particles are generated in code (`tools/r3d.js`).
