// Prints a loudness envelope so you can SEE where a score's sections and hits
// actually landed (generated music never follows the plan's timing exactly).
//   node scripts/envelope.mjs <audio> [from=0] [to=end] [step=0.25]
// Also reports the steepest rise in the range: usually the downbeat you want
// to put on a picture beat (cut silence before it with SCORE.cuts).
import { execFileSync } from 'node:child_process';

const [file, fromArg = '0', toArg, stepArg = '0.25'] = process.argv.slice(2);
if (!file) throw new Error('usage: node scripts/envelope.mjs <audio> [from] [to] [step]');
const SR = 48000, from = Number(fromArg), step = Number(stepArg);
const args = ['-loglevel', 'error', '-ss', String(from), ...(toArg ? ['-t', String(Number(toArg) - from)] : []), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'];
const raw = execFileSync('ffmpeg', args, { maxBuffer: 1 << 28 });
const a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const w = Math.round(step * SR);
const rows = [];
for (let s = 0; s + w <= a.length; s += w) {
  let q = 0; for (let i = s; i < s + w; i++) q += a[i] * a[i];
  rows.push({ t: from + s / SR, db: 10 * Math.log10(q / w + 1e-12) });
}
let best = { rise: -Infinity, t: 0 };
// Skip the first window: seeking makes it read as silence and fakes a rise.
for (let i = 2; i < rows.length; i++) { const r = rows[i].db - rows[i - 1].db; if (r > best.rise) best = { rise: r, t: rows[i].t }; }
let line = '';
rows.forEach((r, i) => { line += `${r.t.toFixed(2)}:${r.db.toFixed(0)}${i % 10 === 9 ? '\n' : '  '}`; });
console.log(line.trimEnd());
console.log(`steepest rise at ${best.t.toFixed(2)} s (+${best.rise.toFixed(1)} dB)`);
