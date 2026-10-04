# Making a film of a project, end to end

Instructions for an automated agent asked to make a demo film, trailer or walkthrough of a project with this kit. Read [METHOD.md](METHOD.md) first: the bar and the pacing rules apply to every film.

## 1. Learn the project

Read its README, its screens and in-product text, its store page if it has one, and its code. Write down:

- the setting or promise, in one line, in the product's own words
- 4 to 7 pillars: things a user really does, each found in the code
- the single hero moment the film builds to
- what can be filmed for real: a game build, a web interface, a command line, a device that can be modelled

Never invent a feature, a number or a result. Use test personas and local copies, never real users' data.

## 2. Choose the film and its sources

| The project is | Film | Sources |
| --- | --- | --- |
| a game | trailer | engine (+ ident) |
| a device or hardware concept | product film | studio (+ ident) |
| an app or a tool | walkthrough | tools, studio for the product shots (+ ident) |
| a game with tools around it | commercial | engine, tools (+ ident) |

Start from `src/stories/trailer.js` (engine) or `src/stories/demo.js` (studio and tools), copied to a new file, and point `src/timeline.js` at it.

## 3. Set up each source

- **Engine** ([docs/ENGINE.md](docs/ENGINE.md)): add the director to the game on its own branch, connect the hooks (`Begin`, `Setup`, `Sound`), write the shot plan in `capture/plan.py`, build the player.
- **Studio** ([docs/STUDIO.md](docs/STUDIO.md)): model the product in `studio/scene.js`, its moments and shots in `studio/events.js`. Screens show the product's real interface, drawn on canvases.
- **Tools** ([docs/TOOLS.md](docs/TOOLS.md)): write a `ui/record.mjs` script per job the film shows, run the tool locally, record, then list the shots in `ui/shots.js` with places, camera moves and callouts.
- **Ident** ([docs/IDENT.md](docs/IDENT.md)): the project's logo as an SVG in `ident/`, its name and the film's title in `ident/config.js`.

List the steps in the story's `BUILD.steps`.

## 4. Check before rendering

Render stills of every source (`scripts/render.mjs <page> --stills ...`, `capture/film.sh plan-stills.json stills`), tile them, and read every frame. Fix framing, blank screens, glare, clipped subjects and unreadable text before rendering a take. This is the cheapest place to catch a problem.

## 5. Build

```sh
scripts/stand-in-audio.sh        # only until the real score and effects exist
npm run build:film
```

Then read the output: each shot's holds and pops (`CHECK SMOOTH`, or flags to explain: a designed flash is a pop, a doubled frame is a hold and must be fixed), the loudness, and the contact sheet `out/sheets/shots.jpg`. Re-render a take or re-cut until every shot is clean; `npm run build:film -- --skip-steps` rebuilds without re-rendering takes.

## 6. Score and sound

Replace the stand-in audio ([docs/SOUND.md](docs/SOUND.md)): a score planned on the film's beats, measured with `scripts/envelope.mjs`, its hit landed on `BEATS.hit` with `SCORE.cuts`; one effect file per kind of cue; narration verified by transcribing each line. Rebuild with `--skip-steps`.

## 7. Review, then deliver

Watch the whole film. Check every caption against the product: is each claim true? Check pacing against [METHOD.md](METHOD.md#pacing): if a shot or caption rushes, lengthen the film rather than cutting. Then deliver `out/film.mp4`, with `scripts/renditions.sh` for the web and `share/share.sh` for a private link if the person asking wants one.

## Working rules

- Run heavy jobs (renders, Blender, the build) at low priority, one at a time, and stop every server and process you started.
- Never render from a dev server.
- Commit the story, the scene, the shot plans and the shot lists; never commit `capture/`, `out/` or recordings that contain anything private.
- Report what you checked and what you could not: a film is done when every shot has been looked at, not when the build finishes.
