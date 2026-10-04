// Re-cuts an existing video (a game reel, a screen capture) as a finished film: an optional intro,
// the video with its own sound untouched, a score under it that clears for every spoken line and
// ducks on the video's louder moments, effects on chosen beats, and an optional closing card.
//
//   node scripts/recut.mjs <config.json>            -> the film
//   node scripts/recut.mjs <config.json> --stems    -> the score and source tracks only, then the
//                                                      balance between them per window
//
// config.json (paths are relative to the config, or start with ~/; times in `voice` and `cues` are
// seconds into the SOURCE video, except a cue with `at: "outro"`, which is seconds into the card):
// {
//   "source": "reel.mp4",
//   "score":  "out/audio/score.mp3",
//   "out":    "out/recut.mp4",
//   "intro":  "out/intro.mp4",                      (optional: joined on untouched, its own sound)
//   "outro":  "out/outro.mp4",                      (optional: picture only)
//   "fps": 30,                                      (use the source's own rate)
//   "scoreUnder": 4.5,                              (LU under the source's own sound)
//   "voice": [[20.2, 25.7]],                        (spoken lines: find them with scripts/find-clips.mjs)
//   "cues": [{ "sfx": "whoosh", "t": 12.0, "gain": 0.22 }, { "sfx": "sting", "at": "outro", "t": 0.9, "gain": 0.5 }],
//   "sfxDir": "out/audio/sfx"
// }
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [cfgPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!cfgPath) throw new Error('usage: node scripts/recut.mjs <config.json> [--stems]');
const STEMS = process.argv.includes('--stems');
const base = dirname(resolve(cfgPath));
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const p = (x) => (x.startsWith('~/') ? `${process.env.HOME}/${x.slice(2)}` : resolve(base, x));
const SRC = { source: p(cfg.source), score: p(cfg.score), intro: cfg.intro ? p(cfg.intro) : null, outro: cfg.outro ? p(cfg.outro) : null };
const OUT = p(cfg.out); mkdirSync(dirname(OUT), { recursive: true });
const SFX = p(cfg.sfxDir ?? 'out/audio/sfx');
const FPS = cfg.fps ?? 30, UNDER = cfg.scoreUnder ?? 4.5, VOICE = cfg.voice ?? [];
const SR = 48000;

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const INTRO = SRC.intro ? dur(SRC.intro) : 0, BODY = dur(SRC.source), OUTRO = SRC.outro ? dur(SRC.outro) : 0;
const TOTAL = INTRO + BODY + OUTRO;
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  return Number(/I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.slice(r.stderr.lastIndexOf('Summary')))[1]);
}
function peakAt(file) {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let pk = 0, pi = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > pk) { pk = v; pi = i; } }
  return { peak: pk, at: pi / SR };
}

// The score sits UNDER LU below the source's own sound and ducks only on its louder moments. A score
// 9 LU under with a low duck threshold measured 15 LU down: present on paper, inaudible in the room.
const srcLU = loudness(SRC.source), scoreLU = loudness(SRC.score);
const scoreGain = Math.pow(10, (srcLU - UNDER - scoreLU) / 20);
console.log(`source ${srcLU} LUFS, score ${scoreLU} LUFS -> score gain ${scoreGain.toFixed(3)}`);
// Everything after the intro is built on its own clock, B seconds long; the intro is a finished piece,
// joined on with its own sound, never re-mixed.
const B = BODY + OUTRO;
// Under each spoken line the score dips a further 8 dB, clearing a quarter second early.
const dip = VOICE.map(([a, b]) => `0.6*clip((t-${(a - 0.25).toFixed(2)})/0.2,0,1)*clip((${(b + 0.6).toFixed(2)}-t)/0.6,0,1)`).join('+');
const cues = (cfg.cues ?? []).map((c) => ({ ...c, file: `${SFX}/${c.sfx}.mp3`, at: (c.at === 'outro' ? BODY : 0) + c.t }));

// Inputs: the source, the score, then the intro and card when there are any, then the effects.
const args = ['-y', '-i', SRC.source, '-i', SRC.score];
let inputs = 2;
const introIn = SRC.intro ? (args.push('-i', SRC.intro), inputs++) : null;
const outroIn = SRC.outro ? (args.push('-i', SRC.outro), inputs++) : null;
const fxBase = inputs;
if (!STEMS) for (const c of cues) args.push('-i', c.file);
const fv = [];
const pictures = [introIn, 0, outroIn].filter((i) => i !== null);
pictures.forEach((i, k) => fv.push(`[${i}:v]fps=${FPS},scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[v${k}]`));
fv.push(`${pictures.map((_, k) => `[v${k}]`).join('')}concat=n=${pictures.length}:v=1:a=0[v]`);
const fa = [];
fa.push(`[0:a]aresample=${SR},aformat=channel_layouts=stereo,asplit=2[g][gk]`);
fa.push(`[g]apad=whole_dur=${B}[game]`);
fa.push(`[gk]apad=whole_dur=${B}[key]`);
fa.push(`[1:a]aresample=${SR},aformat=channel_layouts=stereo,volume=${scoreGain.toFixed(4)},afade=t=in:d=1.5,apad=whole_dur=${B}${dip ? `,volume='max(0.2,1-(${dip}))':eval=frame` : ''}[sc]`);
fa.push('[sc][key]sidechaincompress=threshold=0.18:ratio=2:attack=40:release=600:makeup=1[score]');

if (STEMS) {
  const dir = dirname(OUT), sPath = `${dir}/stem-score.wav`, gPath = `${dir}/stem-source.wav`;
  execFileSync('ffmpeg', ['-loglevel', 'error', ...args, '-filter_complex', fa.join(';'), '-map', '[score]', '-c:a', 'pcm_f32le', sPath, '-map', '[game]', '-c:a', 'pcm_f32le', gPath]);
  const rd = (f) => { const r = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(r.buffer, r.byteOffset, r.length / 4); };
  const S = rd(sPath), G = rd(gPath);
  const db = (a, s, e) => { let q = 0; for (let i = Math.round(s * 16000); i < e * 16000; i++) q += a[i] * a[i]; return 10 * Math.log10(q / ((e - s) * 16000) + 1e-12); };
  console.log('window (source s)    source dB  score dB  score under source');
  const wins = [...VOICE.map(([a, b]) => ['voice', a, b])];
  for (let t = 0; t + 4 <= BODY; t += 8) if (!VOICE.some(([a, b]) => t < b && t + 4 > a)) wins.push(['no voice', t, t + 4]);
  for (const [k, a, b] of wins.sort((x, y) => x[1] - y[1])) {
    const g = db(G, a, b), s = db(S, a, b);
    console.log(`${k.padEnd(9)} ${a.toFixed(1).padStart(5)}-${b.toFixed(1).padEnd(6)} ${g.toFixed(1).padStart(8)} ${s.toFixed(1).padStart(9)} ${(g - s).toFixed(1).padStart(9)} dB`);
  }
  console.log(`stems: ${sPath}, ${gPath}`);
  process.exit(0);
}

const sfx = [];
cues.forEach((c, i) => {
  const m = peakAt(c.file);
  const ms = Math.max(0, Math.round((c.at - m.at) * 1000));
  fa.push(`[${fxBase + i}:a]aresample=${SR},aformat=channel_layouts=stereo,volume=${((Math.pow(10, -3 / 20) / m.peak) * c.gain).toFixed(4)},adelay=${ms}:all=1[s${i}]`);
  sfx.push(`[s${i}]`);
});
fa.push(`[game][score]${sfx.join('')}amix=inputs=${2 + sfx.length}:normalize=0:dropout_transition=0,atrim=0:${B}[pre]`);

// Two-pass loudness to -16 LUFS on everything after the intro. The measuring pass carries only the
// sound graph: a video output nobody maps makes ffmpeg refuse the whole graph.
const probe = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'info', ...args, '-filter_complex', [...fa, '[pre]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[a]'].join(';'), '-map', '[a]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const s = probe.stderr.lastIndexOf('{'), e = probe.stderr.lastIndexOf('}');
if (probe.status !== 0 || s < 0) { console.error(probe.stderr.slice(-3000)); throw new Error('loudness pass failed'); }
const j = JSON.parse(probe.stderr.slice(s, e + 1));
console.log('measured', j.input_i, 'LUFS', j.input_tp, 'dBTP');
const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
const master = [`[pre]${ln},alimiter=limit=0.794:attack=5:release=60:level=disabled,aresample=${SR}[bn]`];
if (introIn !== null) master.push(`[${introIn}:a]aresample=${SR},aformat=channel_layouts=stereo,apad=whole_dur=${INTRO},atrim=0:${INTRO},asetpts=PTS-STARTPTS[ai]`, '[ai][bn]concat=n=2:v=0:a=1[a]');
else master.push('[bn]anull[a]');
execFileSync('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', ...args, '-filter_complex', [...fv, ...fa, ...master].join(';'),
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
  '-c:a', 'aac', '-b:a', '256k', '-ar', String(SR), '-movflags', '+faststart', '-t', String(TOTAL), OUT], { stdio: 'inherit' });
console.log(`RECUT_OK ${OUT} (${TOTAL.toFixed(2)} s: intro ${INTRO}, source ${BODY}, card ${OUTRO})`);
