# Method

How to make a film with this kit that holds up: a trailer, a product film, a commercial or a walkthrough. The picture always comes from the real thing: the running game, the real interface on a modelled device, the real tool doing real work.

## The bar

- **1080p60.** Takes are near-lossless H.264 (CRF 10); the finished film is H.264 High at CRF 14, tagged BT.709, with `faststart`.
- **Real, never faked.** A game shot is the game's own controller, physics and AI. A device's screen shows the product's real interface and real states. A tool shot is the tool doing the job it is shown doing. If a shot needs something to happen, set it up the way the product would and let it play.
- **A locked clock.** Every source renders one frame per frame of film, however long a frame takes to draw: the game's clock is stepped by its director, the studio and tool pages are posed from time alone. Nothing judders, and a re-render is identical.
- **One clock for picture and sound.** The cut, the captions, the score edits and every sound cue come from the story (`src/timeline.js`). Change a shot's length and everything after it moves with it.
- **Truthful words.** Every caption verb names something the product really does, in its users' words. Every number on screen is one the product would show. Data comes from test personas, never from real users.
- **Loudness.** -16 LUFS integrated with -1.5 dBTP true peak, which suits web and social platforms.
- **Smooth, and checked.** `scripts/check.mjs` measures every shot frame to frame and writes a contact sheet. It flags holds (a frame all but identical to the one before while the shot moves: a doubled or dropped frame) and pops (a sudden large change: a flash, a flicker, a bad cut). A designed flash flags as a pop, and a shot that barely moves cannot show a hold, so explain every flag, read every shot, and expect to re-render once or twice.

## Pacing

A film fails most often by rushing. Give each idea time to land.

- A montage shot holds about 3 s. A beauty shot holds 4.5 to 5.5 s. A shot with a caption holds long enough to read the caption and then look at the picture.
- Narration starts after a transition has cleared, and leaves a breath after each line. A chapter wipe holds its label about a second.
- When the content does not fit the music, lengthen the film and re-score it. Never cut content or rush shots to fit a score.
- Put the hero moment on the score's biggest hit, and the title on the last one.

## Shape

- **Trailer** (60 to 90 s): open on the world, one beat per pillar (the verbs a player does), build to the hero moment, end on the title.
- **Product film** (60 to 75 s): a cold open that hooks in the dark, a reveal, one beat per feature with a caption naming it in plain words, one hero moment where the music hits, a short montage, the title.
- **Walkthrough or commercial** (2 to 3 minutes): the product first, then how it is used, in numbered steps (ask, it works, see the result, change it, decide), each filmed in the real tool, with narration and a chapter wipe at every change of place; back to the product for the finale.

## Workflow

1. **Find the essence.** Read the product's own material: its store page, its screens, its in-product text, its code. Write down the setting or promise in one line, 4 to 7 pillars (each one you can find in the code), and the single hero moment. Use the product's own words where it has them.
2. **Choose the sources.** A game is filmed by its own director ([docs/ENGINE.md](docs/ENGINE.md)). A device or a concept goes on the studio stage ([docs/STUDIO.md](docs/STUDIO.md)). Tools are recorded doing real work ([docs/TOOLS.md](docs/TOOLS.md)). An existing reel can be re-scored ([docs/SOUND.md](docs/SOUND.md)). Most films use two or three.
3. **Probe with stills.** Every source renders stills: read them, tiled and then at full size, before rendering a take. Look for blank or dark frames, clipped subjects, mirrored or smeared text, glare, and captions over the thing a shot is about.
4. **Make the takes.** List them in the story's `BUILD.steps`; `npm run build:film` makes them all and builds the film. Each take is `capture/<take>.mp4` with a manifest of the frame each shot starts on.
5. **Find the moments.** `node scripts/events.mjs` lists a game take's sounds per shot in seconds (a jump at 4.0, a hit at 6.2), `node scripts/strip.mjs <shot> <from> <to> [step] [take]` tiles frames to pick in-points by eye, and the studio's events are on its own clock (`studio/events.js`).
6. **Cut and caption.** Write `CUT`, `SUPERS` and `WIPES` in the story. `T['shot']` is where a shot starts in the film; helpers in the samples turn a moment in a take into a time in the film, so beats stay on their frames when the cut changes.
7. **Score and effects** ([docs/SOUND.md](docs/SOUND.md)). Measure the score's real hit and land it with `SCORE.cuts`.
8. **Build and review.** `npm run build:film -- --skip-steps` re-cuts, re-captions and re-mixes without re-rendering takes. Read the contact sheet and the doubtful frames at full size. Measure the hit on the finished film with `envelope.mjs`. If the mix around the hit is already loud, something else is drowning it.
9. **Deliver.** `scripts/renditions.sh out/film.mp4 out/web` encodes AV1, HEVC (Main tier) and H.264 at 1080p60, H.264 at 720p60, and a poster. `share/share.sh` publishes a private link ([README](README.md#sharing)). An audio-described version is one more command ([docs/SOUND.md](docs/SOUND.md#an-audio-described-version)).

## Traps worth knowing first

- **Drive vehicles and players through their input layer.** A direct call to a motor or a physics method is often overwritten by the game's own controller before its effects read it. A virtual gamepad or the game's autopilot drives everything the way a player would, flames and sounds included.
- **Aim at the rendered position.** A rigidbody's transform is interpolated between physics steps; its physics position is not. A camera aimed at the physics position stutters, worst of all in slow motion.
- **Hold showroom objects still.** A parked car on a lift settles and bounces. Make it kinematic for the shot.
- **State carries from shot to shot.** Order a shot list the way the product can play it, reset before every run, and reload after a run that ends a level. An autopilot handed a new route can quietly continue its old one: clear it, and read the manifest's report.
- **A first-person game has no body.** Cameras around the player film empty air: frame the world, the hazards and the chasers instead.
- **Small fast things do not read wide.** Film them close or first-person.
- **Look before planning around unseen places.** The scenery behind a level is often nothing.
- **Fast turns read as hitches.** Start a shot after an autopilot's snap turn.
- **Keep real saves and real data out of it.** Filming plays real matches and moves real progress; record tools with test personas on a local copy.
- **Never render from a dev server.** A hot reload mid-render kills the run; the kit serves built pages.
- **Busy machines lie.** Smoothness checks and anything timed want a quiet machine. Run heavy jobs at low priority, one at a time.
