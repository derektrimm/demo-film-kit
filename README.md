# game-trailer-kit

Film a trailer from your game's own running build. A director inside the game plays a shot list while the game runs its own code, and every frame is captured at a locked 60 fps, so nothing is staged or edited. A small Node pipeline then cuts the takes frame-exact, lays captions over them, scores and mixes the sound to -16 LUFS, and checks every shot for hitches.

- **`unity/TrailerKit/`** holds the director for Unity, plus a sample scene to try the pipeline before pointing it at a game.
- **`capture/`** holds the shot list (`plan.py`) and the script that films it (`film.sh`).
- **`src/timeline.js`** is the trailer's one clock: the cut, the captions, the beats, the score edits and the sound cues.
- **`scripts/`** holds the post pipeline: captions, cut, mix, join, smoothness check, the score envelope, event maps, timing strips, an audio-described cut and web renditions.

[METHOD.md](METHOD.md) covers how to make a trailer that lands: the bar, the pacing and the workflow. [DIRECTOR.md](DIRECTOR.md) covers the director: the plan format, the Unity hooks and what a director needs in another engine.

## Requirements

- ffmpeg with libx264; libsvtav1 and libx265 as well for the web renditions
- Node 20 or newer, and Python 3
- A Chromium for the caption renderer: `npx playwright-core install chromium` after `npm install`, or point `CHROME` at one you have
- Unity 6 for the included director (tested on 6000.3 with the built-in pipeline and with URP)
- Linux or macOS to film: frames reach ffmpeg through a named pipe

## Try it on the sample

The sample is a runner circling a ring of pillars and a ball that bounces and makes a sound. The whole run takes about ten minutes.

1. Copy `unity/TrailerKit` into the `Assets` folder of a Unity 6 project, then choose **Tools > Trailer Kit > Build Sample Player**. The player lands in `Builds/TrailerSample/` beside `Assets`. On macOS the executable is inside the app: `TrailerSample.app/Contents/MacOS/TrailerSample`.
2. In this folder:

   ```sh
   npm install
   npx playwright-core install chromium
   npm run plan                                        # capture/plan-film.json
   PLAYER=/path/to/Builds/TrailerSample/TrailerSample npm run film
   scripts/stand-in-audio.sh                           # placeholder score and effects
   npm run build
   npm run serve &                                     # the caption page, on port 4173
   npm run captions && npm run cut && npm run mix && npm run join && npm run check
   ```

3. Watch `out/trailer.mp4`. `npm run check` prints each shot's worst frame-to-frame jump and writes a contact sheet to `out/sheets/shots.jpg`. Stop the server when you are done.

To look at framing before filming, `npm run stills` then `PLAYER=... capture/film.sh plan-stills.json stills` writes PNGs at the start, middle and end of every shot into `capture/stills/`.

## Make your game's trailer

1. Copy `unity/TrailerKit/Runtime` into your project, without `Sample`, and connect the hooks your game needs: how to get into play, how to set up a shot, and one line in your audio code. See [DIRECTOR.md](DIRECTOR.md).
2. Replace the shots in `capture/plan.py` with yours, film stills, read them, and adjust.
3. Film the master, find the moments with `scripts/events.mjs` and `scripts/strip.mjs`, and write your story in `src/timeline.js`.
4. Replace the stand-in audio with a real score and effects, set `SCORE.cuts` so the score's hit lands on your hero moment, and set `GAME_AUDIO` to lay your game's own sounds where they played.
5. Build, join with your own intro and end card (`node scripts/join.mjs out/body.mp4 out/trailer.mp4 --intro logo.mp4 --outro card.mp4 --sting sting.mp3`), and check. Pass the intro's length to the check: `node scripts/check.mjs out/trailer.mp4 3`.
6. For the web, `scripts/renditions.sh out/trailer.mp4 out/web` encodes AV1, HEVC and H.264 renditions and a poster.

[METHOD.md](METHOD.md) walks through each step and the traps worth knowing first.

## License

MIT, see [LICENSE](LICENSE). The fonts in `public/fonts` (Sora, Inter, JetBrains Mono) are under the SIL Open Font License, see [public/fonts/OFL.txt](public/fonts/OFL.txt).
