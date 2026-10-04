// Reviews a finished trailer shot by shot, from the cut in src/timeline.js:
//   node scripts/check.mjs <film.mp4> [seconds the body starts at: the intro's length, 0 without one]
// 1. Smoothness: per shot, each frame's change against the average of its
//    neighbours. A frame over 2.5x its neighbours is a jerk (a hitch the eye
//    catches in motion and a contact sheet never shows).
// 2. A contact sheet, one frame 60% into every shot, at out/sheets/shots.jpg,
//    for reading by eye: blank frames, clipped subjects, captions over action.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { CUT, DURATION, startOf } from '../src/timeline.js';

const [film, offsetArg] = process.argv.slice(2);
if (!film) throw new Error('usage: node scripts/check.mjs <film.mp4> [body offset seconds]');
const offset = Number(offsetArg ?? 0);
const W = 192, H = 108, FPS = 60;
const raw = execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-i', film, '-vf', `fps=${FPS},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 2 ** 31 });
const n = Math.floor(raw.length / (W * H));
const diff = new Float64Array(n);
for (let i = 1; i < n; i++) {
  let s = 0;
  for (let p = 0, a = i * W * H, b = (i - 1) * W * H; p < W * H; p++) s += Math.abs(raw[a + p] - raw[b + p]);
  diff[i] = s / (W * H);
}
let jerks = 0;
CUT.forEach((c, i) => {
  const a = Math.round((offset + startOf(i)) * FPS) + 2, b = Math.round((offset + startOf(i) + c.len) * FPS) - 1;
  let worst = 0, at = a, bad = 0;
  for (let k = a; k < Math.min(b, n - 1); k++) {
    const r = diff[k] / Math.max(0.05, (diff[k - 1] + diff[k + 1]) / 2);
    if (r > worst) { worst = r; at = k; }
    if (r > 2.5) bad++;
  }
  jerks += bad;
  console.log(`${c.shot.padEnd(18)} worst ${worst.toFixed(1).padStart(5)}x at ${(at / FPS).toFixed(2)} s  jerks ${bad}${bad ? '   <-- CHECK' : ''}`);
});
const dir = new URL('../out/sheets/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const picks = CUT.map((c, i) => Math.round((offset + startOf(i) + c.len * 0.6) * FPS));
const cols = Math.min(6, picks.length), rows = Math.ceil(picks.length / cols);
execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-y', '-i', film, '-vf', `select='${picks.map((p) => `eq(n\\,${p})`).join('+')}',scale=384:216,tile=${cols}x${rows}`,
  '-frames:v', '1', '-fps_mode', 'passthrough', `${dir}shots.jpg`]);
console.log(`CHECK ${jerks ? 'JERKS ' + jerks : 'SMOOTH'} over ${CUT.length} shots (${DURATION.toFixed(1)} s); sheet ${dir}shots.jpg`);
