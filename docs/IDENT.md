# The logo intro and closing card

`ident/` turns any SVG logo into a 7-second animated intro and a 5-second closing card, rendered on the same stage as the studio.

- **Intro.** A gold line draws across the dark, folds into the centre with a flare, and the logo settles into place as the room comes up. A glint crosses its metal, dust drifts through the light, and the name appears under it.
- **Closing card.** The logo at rest above the name, the film's title, a one-line tag and fine print.

## Make yours

1. Put your logo in `ident/` and point `IDENT.logo` in `ident/config.js` at it. Each filled shape becomes a layer, extruded in front of the one before it in its own colour; the first shape is the back plate. Strokes are ignored: convert strokes to filled outlines in your editor first.
2. List the shapes to finish as polished metal in `IDENT.metal` (by order in the file, from 0). Metal takes the glint, so pick the brightest, most important shape.
3. Set `name`, `title`, `tag` and `fine`.
4. Check it: `npx vite build && node scripts/render.mjs ident/ --stills out/stills intro:1.4 intro:4 intro:6 outro:3 --gpu`.

`scripts/build.mjs` renders both when the story's `BUILD.steps` has `{ ident: true }`, mixes their sound (`ident/sound.js`: a whoosh under the line, an impact on the reveal, a shimmer on the glint, a sting on the card), and joins them around the film. The intro is joined on untouched, never re-mixed with the film.

The beats are in `ident/beats.js`. To use an intro you already have, set `BUILD.intro` to its file and leave out the `ident` step.
