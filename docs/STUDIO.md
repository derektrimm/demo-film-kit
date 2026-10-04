# Studio: the product on a stage

A studio take is a three.js scene of the product, rendered frame by frame in a headless browser on the GPU: hardware modelled from photographs, a device with its real interface on its screen, a concept that does not exist yet. The stage (`studio/stage.js`) is the same for every film: a dark studio of softbox strips, a key light, a rim and a soft fill, bloom, depth of field, a grade with grain and a vignette, and neutral tone mapping. You write what is in front of the lens.

## Files

- `studio/events.js` is the studio's clock: the moments that happen in the scene (a press at 12.0 s) and the shots that film it. A shot is a camera on that clock (`from`, `duration`), so two shots can film the same moment from two angles and the story cuts between them.
- `studio/scene.js` holds `build(ctx)`, which makes the objects once; `update(t, ctx)`, which poses them for clock time `t`; and `SHOT_POSE`, each shot's camera moving from one position and target to another, with a field of view and an aperture.
- The story imports `events.js` to put sounds and captions on the same moments: `src/stories/demo.js` lands its biggest hit on the press.

`update` must depend on `t` alone, never on the previous frame. Any frame can then be rendered on its own, a still matches the film, and a re-render is identical.

## Look development

Render stills of chosen moments and read them before rendering the take:

```sh
npx vite build
node scripts/render.mjs studio/ --stills out/stills studio-open:3.5 studio-close:2.0 --gpu
```

Tile them to read a whole sequence at once (`ffmpeg -pattern_type glob -i 'out/stills/*.png' -vf scale=640:360,tile=4x4 sheet.jpg`), then open any doubtful frame at full size. Look for mirrored or smeared text, glare blobs, blank screens, cut-off subjects, dark shots and text that reads grey. In a browser, `studio/?shot=studio-close&t=2` shows one moment, `?play` loops the first shot, and `?off=key,rim,top,fill,env,bloom` switches a source off to find what a reflection comes from.

`scripts/render.mjs` refuses software GL: a studio scene renders many times slower on the CPU. On a GPU it renders at about 7 to 11 frames a second at 1080p.

## Techniques that hold up in close-up

- **Screens.** Draw the interface on a 2D canvas every frame and use it as the `emissiveMap` of a glossy `MeshPhysicalMaterial`: true interface colour, plus the studio's reflections on the glass. Many small screens can share one canvas atlas with per-mesh UVs.
- **Keycaps.** A `RoundedBoxGeometry` with `uv` and `normal` dropped, `mergeVertices`, the top tapered and dished, then `computeVertexNormals`: welded corners shade without seams.
- **Knurled dials.** A many-sided cylinder whose rim vertices are pushed in and out by a triangle wave.
- **Light.** Make every light's colour and level a function of `t`: waves that spread from a pressed key by distance, flashes that decay with `exp(-k * dt)`.
- **Logos.** Load an SVG with three.js's `SVGLoader` and extrude its shapes, with bevels, for an enamel look (`ident/scene.js` does this). A real floor reflection is a `Reflector` under a translucent glossy sheet.
- **Hardware.** Model from review photographs, which show more angles than a store page.

## Traps

- **No dev server for renders.** Editing a served file mid-render hot-reloads the page and kills the run; `scripts/serve.mjs` serves the built pages instead.
- **No `RoomEnvironment` near glossy glass.** Its bright panels reflect as a soft white blob over a screen. The stage's dark strips reflect as clean lines.
- **Glass over a screen is thin-walled** (`transmission: 1, thickness: 0`). A volumetric dome refracts the screen into mirror image.
- **Point lights hot-spot glossy surfaces.** Fill with a hemisphere light; coloured flashes come from a light low behind the subject.
- **A glint is a tall, thin `RectAreaLight`** sliding close to the camera axis: it reflects as a clean streak. A point or spot light floods a flat glossy face, and bloom turns it white.
- **Additive flares need `depthTest: false`**, or the floor slices them flat.
- **A pressed key must stay above its bezel**, or it disappears into the surface on its own press.
- **Neutral tone mapping, not ACES,** or screens lose their colour.
- **Captions need contrast checked by eye.** A green title over a green screen reads grey; the caption track's title style carries a dark backdrop.
