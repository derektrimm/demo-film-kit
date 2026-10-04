# Method

How to make a trailer with this kit. A trailer here films the game itself: every frame is the build running its own code, and the director only chooses where a run starts and where the camera is.

## The bar

- **1080p60.** Masters are near-lossless H.264 (CRF 10); the finished film is H.264 High at CRF 14, tagged BT.709.
- **In engine, nothing faked.** The game's real controller, physics and AI play every shot. There is no painted footage and no edited gameplay. If a shot needs something to happen, set it up the way the game would (a spawn, a route, a reset) and let it play.
- **A locked clock.** The director advances the game exactly one frame per captured frame (Unity's `Time.captureFramerate`), so a slow render never changes timing. Physics steps once per filmed frame, scaled in slow motion, so moving bodies never judder.
- **One clock for picture and sound.** The cut, the captions, the score edits and every sound cue come from `src/timeline.js`. Change a shot's length and everything after it moves with it.
- **The game's own sound.** The director logs every one-shot sound with its frame. The mixer lays those files at those frames, with distance falloff, under the score and the trailer's effects.
- **Truthful captions in the player's words.** Every verb names something the game really does.
- **Loudness.** The mix is two-pass normalized to -16 LUFS integrated with -1.5 dBTP true peak, which suits web and social platforms.
- **Smooth, and checked.** `scripts/check.mjs` measures every shot frame to frame. Explain every flag: a real flash is fine, and a hitch is re-cut or re-filmed.

## Pacing

A trailer fails most often by rushing. Give each idea time to land.

- A montage shot holds about 3 s. A beauty shot holds 4.5 to 5.5 s. A shot with a caption holds long enough to read the caption and then look at the picture.
- Narration starts after a transition has cleared, and leaves a breath after each line.
- When the content does not fit the music, lengthen the film and re-score it. Never cut content or rush shots to fit a score.
- Put the hero moment on the score's biggest hit and the title on the last one.

## Workflow

1. **Find the essence.** Read the game's own material: its store page, its title screen, its in-game text. Write down the setting in one line, 4 to 7 pillars (the verbs a player does, each one you can find in the code), and the single hero moment. Use the game's own words where it has them.
2. **Read the engine's levers.** Find how the build boots straight into play, how it can be driven (an autopilot, a recorded route, a virtual gamepad), its cameras, how the interface is hidden, how a level resets, and where sounds are played. Existing test harnesses (autoplay, benchmarks, capture tours) are the fastest way in.
3. **Connect the director.** Copy `unity/TrailerKit/Runtime` in and fill in the hooks your shots need ([DIRECTOR.md](DIRECTOR.md)). Keep this code on a branch of its own if the game should not ship with it.
4. **Plan, then probe with stills.** Write the shots in `capture/plan.py`. Film stills (`npm run stills`, then `capture/film.sh plan-stills.json stills`), tile them, and read every one before filming. `capture/stills/probe.txt` lists the anchors to author positions against.
5. **Film.** `PLAYER=<player> npm run film` writes `capture/master.mp4`, `master-manifest.txt` (each shot's first frame and frame count, plus whatever your `Report` hook adds) and `master-sounds.txt`. Read the manifest: every run must end where you meant it to. Re-film single shots into a new take (`python3 capture/plan.py film --only a,b`, then `capture/film.sh plan-film.json reshoot1`) and list the take in `TAKES`.
6. **Find the moments.** `node scripts/events.mjs` prints each shot's sounds in seconds into its capture (a jump at 4.0, a hit at 6.2). `node scripts/strip.mjs <shot> <from> <to>` tiles a frame every half second into `out/sheets/<shot>.jpg`. Cut on what they show.
7. **Cut and caption.** Write `CUT` in `src/timeline.js`: one beat per pillar, building to the hero moment, the title last. `at('shot', seconds)` turns a moment in a shot's capture into a time in the trailer. Captions (`SUPERS`) come in several styles: a kicker, a headline with a subline, an arrival plate, one shouted word, and the centred title. `WIPES` covers a cut that changes place with a labelled panel; `dissolve` on a cut entry blends shots in the same place.
8. **Score and effects.** Use music you have the rights to: licensed, commissioned or generated. Plan it on your beats. A generated score never lands exactly where you asked, so measure it with `node scripts/envelope.mjs <music> <from> <to> 0.1`, which prints the loudness over time and the steepest rise, then set `SCORE.cuts` to remove a stretch of its quiet opening so the hit lands on `BEATS.hit`. A score built from several pieces goes in `SCORE.parts`. Effects live in `out/audio/sfx/<name>.mp3`; a cue's time is when the effect's peak lands. A narrator goes in `VOICE`, and the score ducks under every line.
9. **Build.** `npm run build`, serve the caption page (`npm run serve`), then `npm run captions && npm run cut && npm run mix`. Join with your intro and end card: `node scripts/join.mjs out/body.mp4 out/trailer.mp4 --intro logo.mp4 --outro card.mp4 --sting sting.mp3`. The intro plays untouched with its own sound.
10. **Review.** `node scripts/check.mjs out/trailer.mp4 <intro seconds>` for smoothness and the contact sheet. Read the sheet, then every doubtful frame at full size. Measure the hit on the finished body with `envelope.mjs`. If the mix around the hit is already loud, one of the game's sounds is drowning it: lower that id in `GAME_AUDIO.gains`.
11. **Deliver.** `scripts/renditions.sh out/trailer.mp4 out/web` encodes AV1, HEVC (Main tier) and H.264 at 1080p60, H.264 at 720p60, and a poster. For an audio-described version, record one narration file per line describing what is on screen, list them in `DESCRIPTION`, and run `node scripts/describe.mjs out/trailer.mp4 out/trailer-described.mp4`.

## Traps worth knowing first

- **Drive vehicles and players through their input layer.** Calling a motor or a physics method directly is often overwritten by the game's own controller before effects read it. A virtual gamepad or the game's autopilot drives everything the way a player would, flames and sounds included.
- **Aim at the rendered position.** A rigidbody's transform is interpolated between physics steps; its physics position is not. A camera aimed at the physics position stutters, worst of all in slow motion.
- **Hold showroom objects still.** A parked car on a lift settles and bounces. Make it kinematic for the shot.
- **State carries from shot to shot.** A player who boarded a vehicle is still in it; a running match is still running; a crumbled bridge stays crumbled. Order the shot list the way the game can play it, reset a level before every run, and reload it after a run that ends the level.
- **Re-running an autopilot needs a clean runner.** An autopilot handed a new route can quietly continue its old one. Clear its state for every run and check the manifest's report.
- **A first-person game has no body.** Cameras around the player film empty air. Frame the world, the hazards and the chasers instead, and let first-person shots carry the player.
- **Small fast things do not read wide.** Darts, bullets and sparks vanish across a room. Film them close or first-person.
- **Look before planning around unseen places.** The scenery behind a level is often nothing. Probe with stills first.
- **Fast turns read as hitches.** An autopilot that snaps 600 degrees a second looks like a dropped frame. Start the shot after the turn.
- **Level-wide sounds.** Some games play a hazard's sound everywhere. Filter the event map by distance.
- **Keep saves out of it.** Filming plays real matches and moves real progress. On Linux `film.sh` gives the player scratch save folders. On macOS and Windows, back the saves up first.
- **Dark gradients band.** A smooth dark glow, quantized by the encoder, shows rings that move with the camera. The cut uses `aq-mode=3` with deadzones that keep them in check. Check a finished frame by lifting its shadows (`-vf curves=all='0/0 0.1/0.75 1/1'`).
- **Busy machines lie.** Smoothness checks and anything timed want a quiet machine. Run heavy jobs at low priority, one at a time.
