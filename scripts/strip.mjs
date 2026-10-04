// A timing strip: frames from one shot of a capture every `step` seconds, labelled by
// index, tiled 8 across, to pick in-points by eye. Index k is at from + k * step.
//   node scripts/strip.mjs <shot> <from s> <to s> [step s=0.5] [take=master]  -> out/sheets/<shot>.jpg
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const [shot, from, to, stepArg = '0.5', take = 'master'] = process.argv.slice(2);
if (!to) throw new Error('usage: node scripts/strip.mjs <shot> <from> <to> [step] [take]');
const CAP = new URL('../capture/', import.meta.url).pathname;
const line = readFileSync(`${CAP}${take}-manifest.txt`, 'utf8').split('\n').find((l) => l.startsWith(`${shot} `));
if (!line) throw new Error(`no shot ${shot} in ${take}-manifest.txt`);
const first = Number(/first=(\d+)/.exec(line)[1]), step = Number(stepArg);
const frames = [];
for (let t = Number(from); t < Number(to) - 1e-9; t += step) frames.push(first + Math.round(t * 60));
const dir = new URL('../out/sheets/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-y', '-i', `${CAP}${take}.mp4`, '-vf',
  `select='${frames.map((f) => `eq(n\\,${f})`).join('+')}',scale=320:180,drawtext=text='${shot} %{n}':x=4:y=4:fontsize=16:fontcolor=white:box=1:boxcolor=black,tile=8x${Math.ceil(frames.length / 8)}`,
  '-frames:v', '1', '-fps_mode', 'passthrough', `${dir}${shot}.jpg`]);
console.log(`${dir}${shot}.jpg (${frames.length} frames, index k = ${from} + k * ${step} s)`);
