// Cuts the body from the captured takes, frame-exact, from CUT in src/timeline.js, dissolves
// where a cut entry asks for it, fades from and to black, and lays the caption track over it.
//   node scripts/cut.mjs <captions.mov> <out.mp4>
// Each take's frame ranges come from capture/<take>-manifest.txt (first=, frames=).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CUT, FPS, DURATION, FADES, TAKES } from '../src/timeline.js';

const [captions, out] = process.argv.slice(2);
if (!captions || !out) throw new Error('usage: node scripts/cut.mjs <captions.mov> <out.mp4>');
const CAP = new URL('../capture/', import.meta.url).pathname;
// A shot is found by name in the latest take that lists it, or in the take a cut entry names
// (`take: 'golden'`) when two takes filmed the same shot differently.
const shots = {};
TAKES.forEach((take, input) => {
  for (const line of readFileSync(`${CAP}${take.file}-manifest.txt`, 'utf8').split('\n')) {
    const m = /^(\S+) .*first=(\d+) frames=(\d+)/.exec(line);
    if (!m) continue;
    const shot = { input, first: Number(m[2]), frames: Number(m[3]) };
    shots[`${take.file}:${m[1]}`] = shot;
    if (take.shots === '*' || take.shots.includes(m[1])) shots[m[1]] = shot;
  }
});
const shotFor = (c) => shots[c.take ? `${c.take}:${c.shot}` : c.shot];
// A cut entry with `dissolve: <seconds>` dissolves in from the shot before it, centred on the cut,
// so every shot still starts where the timeline says. Each side of a dissolve borrows half its
// length from beyond the cut; past the ends of a captured shot its edge frame is held.
const half = (i) => Math.round(((CUT[i]?.dissolve ?? 0) * FPS) / 2);
const f = [];
// A filter input feeds one filter, so each take is split once per shot drawn from it.
const uses = TAKES.map((_, input) => CUT.map((c, i) => [c, i]).filter(([c]) => shotFor(c)?.input === input).map(([, i]) => i));
uses.forEach((list, input) => { if (list.length) f.push(`[${input}:v]split=${list.length}${list.map((i) => `[s${i}]`).join('')}`); });
const frames = [];
CUT.forEach((c, i) => {
  const s = shotFor(c);
  if (!s) throw new Error(`no captured shot ${c.take ? c.take + ':' : ''}${c.shot}`);
  const at = Math.round(c.at * FPS), n = Math.round(c.len * FPS);
  if (at + n > s.frames) throw new Error(`${c.shot}: ${c.at}+${c.len}s runs past its ${s.frames} captured frames`);
  const head = half(i), tail = half(i + 1);
  const from = Math.max(0, at - head), to = Math.min(s.frames, at + n + tail);
  const padHead = head - (at - from), padTail = tail - (to - at - n);
  const pad = padHead || padTail ? `,tpad=start_mode=clone:start=${padHead}:stop_mode=clone:stop=${padTail}` : '';
  // Frames are stamped by count before padding: an fps filter after tpad dropped a frame from
  // every shot that holds its first frame (seven shots, four frames early by the finale).
  f.push(`[s${i}]trim=start_frame=${s.first + from}:end_frame=${s.first + to},settb=1/${FPS},setpts=N${pad},format=yuv420p[c${i}]`);
  frames.push(head + n + tail);
});
// Assembled frame-exact: every shot is cut into its own frames and the frames it shares with a
// dissolve on either side; a shared stretch is blended over its exact frame count. (ffmpeg's xfade
// rounds its offsets and lost half a frame a dissolve, four frames by the finale.)
const pieces = [];
CUT.forEach((c, i) => {
  const head = half(i) * 2, tail = half(i + 1) * 2, total = frames[i];
  const parts = [];
  if (head) parts.push(['o', 0, head]);
  parts.push(['p', head, total - tail]);
  if (tail) parts.push(['q', total - tail, total]);
  f.push(`[c${i}]split=${parts.length}${parts.map(([k]) => `[${k}${i}]`).join('')}`);
  for (const [k, from, to] of parts) f.push(`[${k}${i}]trim=start_frame=${from}:end_frame=${to},setpts=PTS-STARTPTS[${k}${i}t]`);
  if (head) {
    // The outgoing shot's last frames under the incoming shot's first, weighted frame by frame.
    f.push(`[q${i - 1}t][o${i}t]blend=all_expr='A*(1-(N+0.5)/${head})+B*((N+0.5)/${head})'[d${i}]`);
    pieces.push(`[d${i}]`);
  }
  pieces.push(`[p${i}t]`);
});
f.push(`${pieces.join('')}concat=n=${pieces.length}:v=1:a=0[body]`);
f.push(`[body]fade=t=in:st=0:d=${FADES.in},fade=t=out:st=${(DURATION - FADES.out).toFixed(3)}:d=${FADES.out}[faded]`);
f.push(`[${TAKES.length}:v]format=argb[cap]`);
f.push(`[faded][cap]overlay=0:0:format=auto,format=yuv420p[v]`);
execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-y', ...TAKES.flatMap((t) => ['-i', `${CAP}${t.file}.mp4`]), '-i', captions, '-filter_complex', f.join(';'), '-map', '[v]',
  '-r', String(FPS), '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '10', '-x264-params', 'aq-mode=3:deadzone-inter=6:deadzone-intra=6', '-pix_fmt', 'yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-t', DURATION.toFixed(3), out], { stdio: 'inherit' });
console.log(`CUT_OK ${CUT.length} shots, ${DURATION.toFixed(2)} s -> ${out}`);
