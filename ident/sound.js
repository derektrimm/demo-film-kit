// The ident's sound, mixed by scripts/mix.mjs (--timeline ident/sound.js, with IDENT_SHOT set to
// intro or outro). Effects come from out/audio/sfx/; there is no score. The ident is a short piece of
// hits and air, so it is not loudness-normalised (LOUDNESS = null): levels are the gains below,
// each effect peaking at -3 dBFS times its gain, under a -1.5 dBTP limiter.
import { INTRO, OUTRO, LINE, REVEAL, GLINT } from './beats.js';

const SHOT = globalThis.process?.env?.IDENT_SHOT ?? 'intro';
export const DURATION = SHOT === 'outro' ? OUTRO : INTRO;
export const SCORE = null;
export const LOUDNESS = null;
export function soundCues() {
  if (SHOT === 'outro') return [{ sfx: 'sting', t: 0.9, gain: 0.5 }];
  return [
    { sfx: 'whoosh', t: (LINE.t0 + LINE.t1) / 2, gain: 0.35 },
    { sfx: 'impact', t: REVEAL, gain: 0.7 },
    { sfx: 'shimmer', t: (GLINT.t0 + GLINT.t1) / 2, gain: 0.3 },
  ];
}
