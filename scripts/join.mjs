// Joins the finished trailer: an optional intro (your logo or ident, with its own sound, never re-mixed),
// the mixed body, and an optional end card with an optional sting under it.
//   node scripts/join.mjs <body.mp4> <out.mp4> [--intro intro.mp4] [--outro card.mp4] [--sting sting.mp3]
// A part with no audio track plays over silence. The sting peaks 9 dB under full scale, starts 0.7 s into
// the card and fades out with it.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const [v] = args.splice(i, 2).slice(1); if (!v) throw new Error(`${name} needs a file`); return v; };
const intro = flag('--intro'), outro = flag('--outro'), sting = flag('--sting');
const [body, out] = args;
if (!body || !out) throw new Error('usage: node scripts/join.mjs <body.mp4> <out.mp4> [--intro intro.mp4] [--outro card.mp4] [--sting sting.mp3]');
if (sting && !outro) throw new Error('--sting plays under the end card: give --outro too');
const probe = (file, entries) => String(execFileSync('ffprobe', ['-v', 'error', ...entries, '-of', 'csv=p=0', file])).trim();
const duration = (file) => Number(probe(file, ['-show_entries', 'format=duration']));
const hasAudio = (file) => probe(file, ['-select_streams', 'a', '-show_entries', 'stream=index']) !== '';
const stderr = (cmd) => String(execFileSync('sh', ['-c', `${cmd} 2>&1`]));

const parts = [intro, body, outro].filter(Boolean);
const inputs = parts.flatMap((p) => ['-i', p]);
if (sting) inputs.push('-i', sting);
const f = [];
parts.forEach((p, i) => {
  f.push(`[${i}:v]fps=60,format=yuv420p,setsar=1[v${i}]`);
  const len = duration(p);
  const src = hasAudio(p) ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo` : `anullsrc=r=48000:cl=stereo`;
  // The body keeps a hair of headroom; every part is padded or cut to its picture's length.
  f.push(`${src}${p === body ? ',volume=-0.3dB' : ''},apad=whole_dur=${len},atrim=0:${len}[a${i}]`);
});
if (sting) {
  const card = parts.length - 1, len = duration(outro);
  const peak = Number(/max_volume: (-?[\d.]+)/.exec(stderr(`ffmpeg -hide_banner -i "${sting}" -af volumedetect -f null -`))[1]);
  f.push(`[${parts.length}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${(-9 - peak).toFixed(2)}dB,adelay=700|700,apad=whole_dur=${len},atrim=0:${len},afade=t=out:st=${(len - 1.2).toFixed(2)}:d=1.2[st]`);
  f.push(`[a${card}][st]amix=inputs=2:normalize=0[a${card}m]`);
}
const audio = (i) => (sting && i === parts.length - 1 ? `[a${i}m]` : `[a${i}]`);
f.push(`${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`);
f.push(`${parts.map((_, i) => audio(i)).join('')}concat=n=${parts.length}:v=0:a=1[a]`);
execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', f.join(';'),
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '14', '-x264-params', 'aq-mode=3:deadzone-inter=6:deadzone-intra=6', '-pix_fmt', 'yuv420p', '-r', '60',
  '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', out], { stdio: 'inherit' });
const loud = stderr(`ffmpeg -hide_banner -i "${out}" -af ebur128=peak=true -f null -`).split('Summary').pop();
console.log(`JOIN_OK ${out} ${duration(out).toFixed(2)} s, ${/I:\s+(-?[\d.]+) LUFS/.exec(loud)?.[1]} LUFS, peak ${/Peak:\s+(-?[\d.]+)/.exec(loud)?.[1]} dBFS${intro ? `; the body starts at ${duration(intro).toFixed(2)} s` : ''}`);
