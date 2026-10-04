// THE ONE CLOCK for the trailer. The cut, every caption and every sound cue come from here. Times are
// seconds into the trailer BODY (after any intro, before any end card). Picture comes from the game's own
// capture (capture/<take>.mp4); a cut entry's `at` is seconds into that shot's capture.
//
// This story cuts the sample's shots. Replace it with your game's. Shot names must match the shot plan
// (capture/plan.py), which the director writes into capture/<take>-manifest.txt with the frame each shot
// starts on.

export const FPS = 60;

// Where each shot's frames live. Later takes replace earlier ones for the shots they list.
export const TAKES = [
  { file: 'master', shots: '*' },
  // { file: 'reshoot1', shots: ['hero-moment'] },
];

// The cut: shot name, seconds into that shot's capture, length on screen.
// Open on the world, one beat per pillar, build to the hero moment, end on the title.
export const CUT = [
  { shot: 'establish', at: 0.4, len: 5.2 },
  { shot: 'follow', at: 0.3, len: 4.0 },
  { shot: 'play', at: 0.3, len: 3.5 },
  { shot: 'side', at: 0.3, len: 3.5 },
  { shot: 'drop', at: 0.2, len: 2.8 },
  { shot: 'drop-slow', at: 0.6, len: 4.0 },
  { shot: 'title', at: 0.5, len: 6.3 },
];
export const DURATION = CUT.reduce((a, c) => a + c.len, 0);
export const startOf = (i) => CUT.slice(0, i).reduce((a, c) => a + c.len, 0);
// T['shot'] is where a shot starts in the body; later uses are T['shot#2'], T['shot#3'].
const T = {};
CUT.forEach((c, i) => {
  let key = c.shot, n = 1;
  while (key in T) key = `${c.shot}#${++n}`;
  T[key] = startOf(i);
});
// Where a moment in a shot's capture (seconds, as the sound log and stills give it) lands in the body.
const at = (key, captureSeconds) => T[key] + captureSeconds - CUT[Object.keys(T).indexOf(key)].at;

// Story beats the score and the effects hang on.
export const BEATS = {
  hit: at('drop-slow', 2.35),    // the slow-motion bounce: 2.35 s into its capture, read off the sound log
  title: T['title'] + 0.35,      // the last hit, under the title
};

// Captions. line = bottom-left headline (+ sub), title = centred, kicker = small caps,
// place = an arrival plate's name, top left, shout = one centred word (one the game itself shows, like "GO!").
// tone: 'gold' for the title.
// Every verb names something the product really does, in the player's words.
export const SUPERS = [
  { t0: 1.0, t1: 4.6, kicker: 'A sample arena' },
  { t0: T['follow'] + 0.3, t1: T['play'] + 3.2, line: 'Run the ring.', sub: 'Every frame is the game, running.' },
  { t0: T['drop'] + 0.2, t1: T['drop-slow'] + 3.6, line: 'Physics, frame for frame.', sub: 'Slow motion steps physics once per filmed frame.' },
  { t0: BEATS.title, t1: DURATION - 0.4, title: 'Your Game', tone: 'gold', sub: 'Filmed from its own running build.' },
];

// Chapter wipes, for a film that moves between places (a commercial cutting between the product
// and the tools that make it): each covers the cut at `t` and names where the picture goes next.
// Shots in the same place dissolve instead: `dissolve: <seconds>` on the later CUT entry.
export const WIPE = { in: 0.3, hold: 0.45, out: 0.3 };
export const WIPES = [];
// e.g. { t: T['ui-terminal'], kicker: 'Where the work happens', label: 'The Terminal' }

// The picture fades up from black at the start and down to black at the end.
export const FADES = { in: 0.8, out: 1.2 };

// Score edits applied by the mixer: cuts remove [from, to) of the score so its
// hit lands on BEATS.hit; ducks dip it under a moment that needs room.
// Measure the real hit with scripts/envelope.mjs before setting these.
// The stand-in score's hit is at 22.0 s; cutting 1.25 s from its quiet opening lands it on BEATS.hit.
export const SCORE = { cuts: [{ from: 8, to: 9.25 }], ducks: [] };
// Or assembled from parts (each a slice of a file in out/audio, placed at `at`, crossfaded):
// export const SCORE = { parts: [{ file: 'overture.mp3', from: 0, to: 23.6, at: 0, fade: 0.6 }, { file: 'bed.mp3', from: 0, to: 80, at: 23, gain: 1.6 }] };

// Narration (optional): one file per line in `dir`, starting at t; the score ducks under it.
export const VOICE = null;
// export const VOICE = { dir: 'out/audio/vo', duck: { threshold: 0.02, ratio: 7, release: 500 }, lines: [{ file: '01', t: 12.4 }] };

// The product's OWN sounds, laid where it played them while filming (optional).
// The director logs every one-shot it plays to capture/<take>-sounds.txt as
// "frame id file volume distance". `dir` holds the source files, found by
// file name; `gains` picks which ids are heard and how loud (others are left out).
export const GAME_AUDIO = { dir: 'unity/TrailerKit/Sample/Audio', gains: { bounce: 0.9 }, near: 2, far: 30 };
// For a game: { dir: '/path/to/game/Assets/Audio', gains: { jump: 0.5, door: 0.8 }, near: 2, far: 30 }

// An audio-described cut (optional, scripts/describe.mjs): one narration file per line in `dir`, starting at
// t seconds into the FINISHED film (intro included). Describe what is on screen, between the trailer's sounds.
export const DESCRIPTION = null;
// export const DESCRIPTION = { dir: 'out/audio/ad', gain: 1.6, lines: [{ file: '00', t: 1.0 }, { file: '01', t: 6.4 }] };

// Sound cues from out/audio/sfx/<name>.mp3. t is when the effect's PEAK lands
// (the mixer measures each file). Gain is the only level you set.
export function soundCues() {
  const c = [];
  c.push({ sfx: 'whoosh', t: T['follow'] + 0.1, gain: 0.3 });
  c.push({ sfx: 'whoosh', t: T['drop'] + 0.1, gain: 0.25 });
  c.push({ sfx: 'impact', t: BEATS.title, gain: 0.6 });
  return c.sort((a, b) => a.t - b.t);
}
