// Finds where known audio clips (a character's voice lines, a sound effect)
// occur inside a video's soundtrack, by matching loudness envelopes at 100 Hz.
//   node scripts/find-clips.mjs <video-or-audio> <clip.mp3|dir> [more clips...]
// Prints each clip's best match, strongest first. A real match scores above
// about 0.9: in a game reel with five voiced lines, they scored 0.90-0.94 and
// the next best 0.63. Feed the windows to recut.mjs as `voice`.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [source, ...rest] = process.argv.slice(2);
if (!source || !rest.length) throw new Error('usage: node scripts/find-clips.mjs <source> <clip|dir> [...]');
const clips = rest.flatMap((x) => (statSync(x).isDirectory() ? readdirSync(x).filter((f) => /\.(mp3|wav|ogg|flac)$/i.test(f)).map((f) => join(x, f)) : [x]));
const read = (f) => { const r = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(r.buffer, r.byteOffset, r.length / 4); };
const env = (a) => { const w = 80, o = []; for (let i = 0; i + w <= a.length; i += w) { let q = 0; for (let j = i; j < i + w; j++) q += a[j] * a[j]; o.push(Math.sqrt(q / w)); } return o; };

const R = env(read(source));
const hits = [];
for (const f of clips) {
  const C = env(read(f)), n = C.length;
  if (n < 20 || n > R.length) continue;
  const cm = C.reduce((a, b) => a + b) / n, cc = C.map((v) => v - cm), cn = Math.sqrt(cc.reduce((a, b) => a + b * b, 0));
  let best = -1, at = 0;
  for (let l = 0; l + n <= R.length; l++) {
    let rm = 0; for (let i = 0; i < n; i++) rm += R[l + i]; rm /= n;
    let s = 0, rn = 0; for (let i = 0; i < n; i++) { const r = R[l + i] - rm; s += r * cc[i]; rn += r * r; }
    const c = s / (Math.sqrt(rn) * cn + 1e-12); if (c > best) { best = c; at = l; }
  }
  hits.push({ clip: f.split('/').pop(), corr: best, from: at / 100, to: (at + n) / 100 });
}
hits.sort((a, b) => b.corr - a.corr);
for (const h of hits) console.log(`${h.corr.toFixed(3)}  ${h.from.toFixed(2)}-${h.to.toFixed(2)} s  ${h.clip}${h.corr > 0.85 ? '' : '   (weak: probably not present)'}`);
