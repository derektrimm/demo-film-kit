// Builds the audio-described cut: the narrator's lines (DESCRIPTION in src/timeline.js) placed on the
// finished film's clock over its own mix, which ducks under each line, then two-pass loudness to
// -16 LUFS / -1.5 dBTP. The picture is copied, never re-encoded.
//   node scripts/describe.mjs <trailer.mp4> <out.mp4>
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { DESCRIPTION } from '../src/timeline.js';

const [film, out] = process.argv.slice(2);
if (!film || !out) throw new Error('usage: node scripts/describe.mjs <trailer.mp4> <out.mp4>');
if (!DESCRIPTION?.lines?.length) throw new Error('no DESCRIPTION lines in src/timeline.js');
const ROOT = new URL('..', import.meta.url).pathname;
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', film]).toString());
const inputs = ['-i', film];
for (const line of DESCRIPTION.lines) {
  const file = `${ROOT}${DESCRIPTION.dir}/${line.file}.mp3`;
  if (!existsSync(file)) throw new Error(`missing description line ${file}`);
  inputs.push('-i', file);
}
const f = [];
DESCRIPTION.lines.forEach((line, i) => {
  const ms = Math.round(line.t * 1000);
  f.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${i}]`);
});
f.push(`${DESCRIPTION.lines.map((_, i) => `[n${i}]`).join('')}amix=inputs=${DESCRIPTION.lines.length}:normalize=0,apad=whole_dur=${dur},atrim=0:${dur},asplit=2[voice][key]`);
f.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo[bed]`);
// The bed dips about 10 dB under the narrator and comes back in a third of a second.
f.push(`[bed][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=320:makeup=1[ducked]`);
f.push(`[voice]volume=${DESCRIPTION.gain ?? 1.6}[v2]`);
f.push(`[ducked][v2]amix=inputs=2:normalize=0[pre]`);
const g1 = [...f, `[pre]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[a]`].join(';');
const probe = spawnSync('ffmpeg', ['-hide_banner', ...inputs, '-filter_complex', g1, '-map', '[a]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const start = probe.stderr.lastIndexOf('{'), end = probe.stderr.lastIndexOf('}');
if (probe.status !== 0 || start < 0) { console.error(probe.stderr.slice(-3000)); throw new Error('loudness pass failed'); }
const j = JSON.parse(probe.stderr.slice(start, end + 1));
const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', [...f, `[pre]${ln},alimiter=limit=0.76:attack=5:release=60:level=disabled,aresample=48000[a]`].join(';'),
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-t', String(dur), out], { stdio: 'inherit' });
console.log(`DESCRIBED_OK ${DESCRIPTION.lines.length} lines, measured ${j.input_i} LUFS -> ${out}`);
