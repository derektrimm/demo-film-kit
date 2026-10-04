// Reviews a finished trailer shot by shot, from the cut in src/timeline.js:
//   node scripts/check.mjs <film.mp4> [seconds the body starts at: the intro's length, 0 without one]
// 1. Smoothness, per shot, from each frame's change against the frames around it. Two things are
//    flagged. A hold: a frame all but identical to the one before while the shot is moving: a doubled
//    or dropped frame, which the eye catches even in a slow pan and a contact sheet never shows. A pop: a frame that changes far more than its neighbours and by a visible
//    amount: a flash, a flicker, a bad cut. A designed flash is a pop too: explain every flag.
// 2. A contact sheet, one frame 60% into every shot, at out/sheets/shots.jpg,
//    for reading by eye: blank frames, clipped subjects, captions over action.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { CUT, DURATION, startOf, WIPES, WIPE } from '../src/timeline.js';

const [film, offsetArg] = process.argv.slice(2);
if (!film) throw new Error('usage: node scripts/check.mjs <film.mp4> [body offset seconds]');
const offset = Number(offsetArg ?? 0);
const W = 480, H = 270, FPS = 60;
const raw = execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-i', film, '-vf', `fps=${FPS},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 2 ** 31 });
const n = Math.floor(raw.length / (W * H));
const diff = new Float64Array(n);
for (let i = 1; i < n; i++) {
  let s = 0;
  for (let p = 0, a = i * W * H, b = (i - 1) * W * H; p < W * H; p++) s += Math.abs(raw[a + p] - raw[b + p]);
  diff[i] = s / (W * H);
}
let jerks = 0;
// A chapter wipe rests over its cut by design: those frames repeat, and are not holds.
const resting = (k) => (WIPES ?? []).some((w) => {
  const t = k / FPS - offset;
  return t > w.t - WIPE.hold / 2 - WIPE.in && t < w.t + WIPE.hold / 2 + WIPE.out;
});
CUT.forEach((c, i) => {
  const a = Math.round((offset + startOf(i)) * FPS) + 2, b = Math.min(Math.round((offset + startOf(i) + c.len) * FPS) - 2, n - 2);
  let worst = 0, at = a, holds = 0, pops = 0;
  for (let k = a; k < b; k++) {
    // A held frame is all but identical to the one before (measured: a doubled frame changes by under
    // 0.07 of a level on average, an interface's text flickering through a fade by 0.13 or more) while
    // the frames on both sides of it move.
    const lo = Math.min(diff[k - 1], diff[k + 1]);
    if (lo > 0.06 && diff[k] < Math.min(0.08, 0.35 * lo) && !resting(k)) holds++;
    const near = (diff[k - 1] + diff[k + 1]) / 2;
    const r = diff[k] / Math.max(0.05, near);
    if (r > worst) { worst = r; at = k; }
    if (r > 2.5 && diff[k] - near > 1.0) pops++;
  }
  jerks += holds + pops;
  const flag = holds || pops ? `   <-- CHECK${holds ? ` ${holds} held` : ''}${pops ? ` ${pops} popped` : ''}` : '';
  console.log(`${c.shot.padEnd(18)} worst ${worst.toFixed(1).padStart(5)}x at ${(at / FPS).toFixed(2)} s  jerks ${holds + pops}${flag}`);
});
const dir = new URL('../out/sheets/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const picks = CUT.map((c, i) => Math.round((offset + startOf(i) + c.len * 0.6) * FPS));
const cols = Math.min(6, picks.length), rows = Math.ceil(picks.length / cols);
execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-y', '-i', film, '-vf', `select='${picks.map((p) => `eq(n\\,${p})`).join('+')}',scale=384:216,tile=${cols}x${rows}`,
  '-frames:v', '1', '-fps_mode', 'passthrough', `${dir}shots.jpg`]);
console.log(`CHECK ${jerks ? 'JERKS ' + jerks : 'SMOOTH'} over ${CUT.length} shots (${DURATION.toFixed(1)} s); sheet ${dir}shots.jpg`);
