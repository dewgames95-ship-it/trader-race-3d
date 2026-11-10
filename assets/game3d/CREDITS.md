# Race view assets

| File | What it is | Source | Licence |
|---|---|---|---|
| `car.glb` | Sports car used for all three racers (Ferrari F8 Tributo, textures removed, badges dropped, simplified) | "Ferrari F8 Tributo" on Sketchfab: https://sketchfab.com/3d-models/ferrari-f8-tributo-61d8929fd08048bf8ee2e143df2de796 | CC-BY 4.0 (credit required) |
| `car_ao.png` | Soft contact shadow under the car | three.js examples (`examples/models/gltf/ferrari_ao.png`) | Same as the car model |
| `sky.jpg`, `sky_front.jpg` | Sky photo (reflections and visible sky) | "Kloofendal 48d Partly Cloudy (Pure Sky)" HDRI, Poly Haven | CC0 |
| `flora.webp` | Tree and rock cut-outs | Renders of Poly Haven models: Fir Tree 01, Pine Tree 01, Tree Small 02, Jacaranda Tree, Island Tree 01, Rock Moss Set 01 | CC0 |

## Changes made to the car model

- All badges, emblems and lettering were removed from the mesh (nose, tail, fenders, sides, engine cover, steering wheel). Hub caps are repainted plain.
- The mesh was simplified from about 360k to about 96k triangles and Draco-compressed (`tools/build-car.mjs`).
- No brand name or logo is shown anywhere in the game.

Road, markings, START/FINISH, boost pads, guard rails, skyline towers, obstacles and particles are generated in code (`tools/r3d.js`).
