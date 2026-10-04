// A product demo: the product in the studio (studio/), the tool it is driven from, filmed for real
// (ui/), then back to the product for the press the whole film builds to, and the title. Between the
// logo intro and the closing card (ident/). Replace this story with yours, or start from trailer.js.
//
// THE ONE CLOCK. The cut, every caption and every sound cue come from here. Times are seconds into
// the film's BODY (after the intro, before the closing card). A cut entry's `at` is seconds into that
// shot's take.

import { PRESS, SHOTS as STUDIO_SHOTS } from '../../studio/events.js';

export const FPS = 60;

// How the picture is made, in order: scripts/build.mjs runs these, then cuts, captions, mixes, joins
// and checks the film. `record` films a tool (ui/record.mjs), `render` renders a page into a take
// (scripts/render.mjs), `still` saves a frame of a take (a backdrop for the tool shots), `engine` films
// the game (capture/film.sh, needs PLAYER), and `ident` renders and mixes the logo intro and card.
export const BUILD = {
  steps: [
    { record: 'ui/sample-app/record.json', out: 'ui/captures/sample' },
    { render: 'studio/', take: 'studio', gpu: true },
    { still: { take: 'studio', shot: 'studio-wide', at: 4 }, out: 'ui/backdrops/studio.jpg' },
    { render: 'ui/', take: 'ui' },
    { ident: true },
  ],
  intro: 'out/intro.mp4',
  outro: 'out/outro.mp4',
};

// Where each shot's frames live. Every take has its own shot names.
export const TAKES = [
  { file: 'studio', shots: '*' },
  { file: 'ui', shots: '*' },
];

// The cut: shot name, seconds into that shot's take, length on screen. `dissolve` blends in from the
// shot before (shots in the same place); a cut that changes place gets a chapter wipe (WIPES).
export const CUT = [
  { shot: 'studio-open', at: 0.5, len: 5.0 },
  { shot: 'ui-open', at: 0, len: 5.5 },
  { shot: 'ui-ask', at: 0, len: 6.5, dissolve: 0.6 },
  { shot: 'ui-working', at: 0, len: 6.0, dissolve: 0.6 },
  { shot: 'ui-done', at: 0, len: 5.5, dissolve: 0.6 },
  { shot: 'studio-top', at: 0.5, len: 4.5 },
  { shot: 'studio-close', at: 0.5, len: 4.0 },
  { shot: 'studio-wide', at: 1.0, len: 7.0 },
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
// Where a moment of the studio's clock lands in the body, inside a given use of a studio shot.
const studio = (key, clock) => {
  const c = CUT[Object.keys(T).indexOf(key)];
  return T[key] + clock - STUDIO_SHOTS.find((s) => s.name === c.shot).from - c.at;
};

// Story beats the score and the effects hang on.
export const BEATS = {
  hit: studio('studio-close', PRESS),   // the press, seen close
  title: T['studio-wide'] + 0.6,
};

// Captions. line = bottom-left headline (+ sub), title = centred, kicker = small caps, step = a
// numbered plate (step: 1, kicker: what happens), tag = where the picture is now.
// Every verb names something the product really does, in its users' words.
export const SUPERS = [
  { t0: 1.0, t1: 4.6, kicker: 'A sample product' },
  { t0: T['ui-ask'] + 0.5, t1: T['ui-ask'] + 6.1, step: 1, kicker: 'Ask in plain words' },
  { t0: T['ui-working'] + 0.5, t1: T['ui-working'] + 5.6, step: 2, kicker: 'Watch it work' },
  { t0: T['ui-done'] + 0.5, t1: T['ui-done'] + 5.1, step: 3, kicker: 'See what it made' },
  { t0: T['studio-close'] + 0.3, t1: T['studio-close'] + 3.8, line: 'One press.', sub: 'Every light, number and sound runs on one clock.' },
  { t0: BEATS.title, t1: DURATION - 0.4, title: 'Your Product', tone: 'gold', sub: 'One line on what it does.' },
];

// Chapter wipes: each covers a cut that changes place and names where the picture goes.
export const WIPE = { in: 0.3, hold: 0.45, out: 0.3 };
export const WIPES = [
  { t: T['ui-open'], kicker: 'Where the work happens', label: 'The Tool' },
  { t: T['studio-top'], kicker: 'And then', label: 'The Product' },
];

// The picture fades up from black at the start and down to black at the end.
export const FADES = { in: 0.8, out: 1.2 };

// The stand-in score's hit is at 40.0 s; cutting 5.5 s from its quiet opening lands it on the press.
// Measure a real score with scripts/envelope.mjs and set the cut the same way.
export const SCORE = { cuts: [{ from: 6, to: 6 + 40 - BEATS.hit }], ducks: [] };

export const VOICE = null;
export const GAME_AUDIO = null;
export const DESCRIPTION = null;

// Sound cues from out/audio/sfx/<name>.mp3. t is when the effect's PEAK lands. Gain is the only level you set.
export function soundCues() {
  const c = [];
  for (const w of WIPES) c.push({ sfx: 'whoosh', t: w.t, gain: 0.35 });
  c.push({ sfx: 'impact', t: BEATS.hit, gain: 0.7 });
  c.push({ sfx: 'shimmer', t: BEATS.title + 0.2, gain: 0.3 });
  return c.sort((a, b) => a.t - b.t);
}
