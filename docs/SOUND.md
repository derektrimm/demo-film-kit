# Sound

Sound is half of what makes a film feel finished. Everything is placed from the story's clock, so a key press and its click land on the same frame, and the mixer does the levels: two-pass loudness to -16 LUFS integrated with a -1.5 dBTP true-peak ceiling.

`scripts/stand-in-audio.sh` writes placeholder files (a score with one hit, a whoosh, an impact, a shimmer and a sting) so the samples build before you have real ones. Replace every file before anyone sees the film.

## The score

Use music you have the rights to: licensed, commissioned or generated.

- **Plan it on your beats.** Write down when the film opens, turns, builds, hits and resolves, and score to that: gentle under the opening, building through the middle, one big hit on the hero moment, a resolving hit under the title.
- **Generated music.** A text-to-music service that takes a sectioned plan and a seed works well: one section per part of the story, each with its length in milliseconds, "instrumental" in its styles and vocals, lyrics and singing in its excluded styles. Fix the seed so you can reproduce a take.
- **Measure it.** Generated music never lands exactly where the plan asked. `node scripts/envelope.mjs out/audio/music.mp3 <from> <to> 0.05` prints the loudness over time and the steepest rise, which is usually the hit.
- **Land the hit.** `SCORE.cuts` removes stretches of the score (`{ from, to }`, seconds into the score) so its hit lands on `BEATS.hit`: cut from a quiet stretch before the hit, and the mixer crossfades the join. `SCORE.ducks` dips the score under a moment that wants quiet. A cut shortens the score; the mixer pads it back to the film's length.
- **Scores from parts.** A score written to be listened to rarely leaves room for a narrator. `SCORE.parts` assembles slices of several files at set times with crossfades: an overture, a sparse bed under the narration (ask for "sparse, quiet underscore, lots of space" and exclude "loud, full orchestra, big drums"), and a finale.
- When the film is longer than the music, re-score it longer. Never cut content or rush shots to fit a score.

## Effects

One file per kind of cue in `out/audio/sfx/<name>.mp3`: key press, click, whoosh, impact, power-on, chime, sting. Describe generated effects as premium, close-mic and dry. The mixer normalises each to a -3 dBFS peak and places it so its peak lands on the cue's time (`onset: true` starts the file on the cue instead, for a sound shown playing from its first frame), so `gain` is the only level you set: about 0.3 for whooshes and typing, 0.5 to 0.6 for presses, 0.7 for the hero impact.

## The product's own sound

A game director logs every one-shot the game plays (`capture/<take>-sounds.txt`: frame, id, file, volume, distance). With `GAME_AUDIO = { dir, gains, near, far }`, the mixer lays each logged sound from `dir` at its own frame, through the cut, with distance falloff; `gains` picks which ids are heard and how loud. `node scripts/events.mjs` reads the same log as a list of moments per shot. Loops the game attaches to objects (an engine hum, a rolling boulder) are not one-shots and are not logged: trim the game's loop file into an effect cue instead.

## Narration

`VOICE = { dir, gain, duck, lines: [{ file, t }] }`: one file per line, each starting at its time; a sidechain compressor dips the score under every line and lets it back up. Start a line after a transition clears and leave a breath after it. Verify every line by transcribing it: a transcriber that turns an unusual name into a famous one shows a listener will hear it that way too. Write around a name it cannot get right.

## An audio-described version

For viewers who cannot see the picture: record one line per moment describing what is on screen, timed between the film's own sounds, list them in `DESCRIPTION` (times in the finished film, intro included), and run `node scripts/describe.mjs out/film.mp4 out/film-described.mp4`. The film's mix ducks under each line; the picture is copied, not re-encoded.

## Re-scoring an existing video

For a reel or capture that already has its own sound, `scripts/recut.mjs` puts a score under it without touching the source's sound: the score sits a set number of LU below the source, ducks on its louder moments, and dips further under every spoken line. Find the spoken lines first with `node scripts/find-clips.mjs <video> <dir of voice files>` (a real match scores above about 0.9), then run `recut.mjs <config> --stems` to print the balance per window: aim for about 5 dB under between lines and at least 15 dB under every line. Find a reel's own cuts with ffmpeg's `blackdetect` when it fades through black (a scene-change detector sees nothing there).

## Traps

- **`loudnorm` reports at info level.** A measuring pass cannot run at `-loglevel error`.
- **A loudness pass must not contain video outputs it does not map**, or ffmpeg refuses the whole graph.
- **A score 9 LU under outdoor ambience, with a low duck threshold, is inaudible.** 4.5 LU under, ducking at threshold 0.18 and ratio 2, with dips under each spoken line, is a balance that works.
- **ffmpeg ignores colour flags on encode.** The mixer and the join write BT.709 tags with `-bsf:v h264_metadata`.
- **Short pieces are not loudness-normalised.** -16 LUFS integrated over a few seconds of hits pushes them far too loud; the ident's sound sets `LOUDNESS = null` and is only limited.
