// Mixes the score and the sound effects onto the picture, from the same cue
// list the picture uses: node scripts/mix.mjs <picture.mp4> <out.mp4> [--timeline <module>]
//
// --timeline mixes from another cue module than src/timeline.js (the logo ident's ident/sound.js).
// A module with SCORE = null has no score; one with LOUDNESS = null is not loudness-normalised,
// only limited (for short pieces of hits, which -16 LUFS integrated would push far too loud).
//
// Needs the score (out/audio/music.mp3, or SCORE.file) and out/audio/sfx/<name>.mp3 for every cue name.
// Score edits (cuts, ducks) come from SCORE in src/timeline.js. With GAME_AUDIO
// set, the product's own sounds are laid where it played them while filming
// (capture/<take>-sounds.txt), mapped through the cut onto the trailer's clock.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const tlAt = argv.indexOf('--timeline');
const timeline = await import(tlAt >= 0 ? pathToFileURL(resolve(argv.splice(tlAt, 2)[1])).href : '../src/timeline.js');

const { soundCues, DURATION, SCORE, CUT, TAKES, FPS, startOf } = timeline;
const GAME_AUDIO = timeline.GAME_AUDIO ?? null;
// Narration (optional): VOICE = { dir, gain, duck: { threshold, ratio, release }, lines: [{ file, t }] },
// each line a file in dir (file.mp3), starting at t seconds into the body; the score ducks under it.
const VOICE = timeline.VOICE ?? null;

const [picture, out] = argv;
if (!picture || !out) throw new Error('usage: node scripts/mix.mjs <picture.mp4> <out.mp4>');
const AUDIO = new URL('../out/audio/', import.meta.url).pathname;
const SR = 48000;

function measure(file) {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const a = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  let pk = 0, pi = 0;
  for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > pk) { pk = v; pi = i; } }
  return { peak: pk, peakAt: pi / SR };
}

const cues = soundCues();
const kinds = [...new Set(cues.map((c) => c.sfx))];
for (const k of kinds) if (!existsSync(`${AUDIO}sfx/${k}.mp3`)) throw new Error(`missing effect out/audio/sfx/${k}.mp3`);
const info = Object.fromEntries(kinds.map((k) => [k, measure(`${AUDIO}sfx/${k}.mp3`)]));

// A score is one file (SCORE.file, cut by SCORE.cuts), or assembled from parts: SCORE.parts =
// [{ file, from, to, at, gain, fade }], each a slice of a file in out/audio placed at `at` seconds,
// faded in and out over `fade` so neighbours crossfade (an overture, a quiet bed under a narrator,
// and a finale from another score).
const parts = SCORE?.parts ?? null;
// Input 1 is the score, or a stretch of silence when there is none.
const args = ['-loglevel', 'error', '-y', '-i', picture, ...(SCORE ? ['-i', `${AUDIO}${parts ? parts[0].file : SCORE.file ?? 'music.mp3'}`] : ['-f', 'lavfi', '-t', String(DURATION), '-i', `anullsrc=r=${SR}:cl=stereo`])];
if (SCORE && !parts && !existsSync(args[args.length - 1])) throw new Error(`missing score ${args[args.length - 1]}`);
for (const c of cues) args.push('-i', `${AUDIO}sfx/${c.sfx}.mp3`);

// The product's own sounds: every logged one-shot inside a cut shot, at its own frame.
const game = [];
if (GAME_AUDIO) {
  const CAP = new URL('../capture/', import.meta.url).pathname;
  const files = new Map();
  const index = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) index(p); else if (/\.(wav|ogg|mp3|flac)$/i.test(n)) files.set(parse(n).name, p); } };
  // Relative to the project root, or absolute (the game's own audio folder).
  index(resolve(new URL('..', import.meta.url).pathname, GAME_AUDIO.dir));
  const shots = {};
  TAKES.forEach((take) => {
    for (const line of readFileSync(`${CAP}${take.file}-manifest.txt`, 'utf8').split('\n')) {
      const m = /^(\S+) .*first=(\d+) frames=(\d+)/.exec(line);
      if (!m) continue;
      shots[`${take.file}:${m[1]}`] = { file: take.file, first: Number(m[2]) };
      if (take.shots === '*' || take.shots.includes(m[1])) shots[m[1]] = { file: take.file, first: Number(m[2]) };
    }
  });
  const logs = Object.fromEntries(TAKES.map((t) => [t.file, existsSync(`${CAP}${t.file}-sounds.txt`)
    ? readFileSync(`${CAP}${t.file}-sounds.txt`, 'utf8').split('\n').filter(Boolean).map((l) => { const [frame, id, file, volume, distance] = l.split(' '); return { frame: Number(frame), id, file, volume: Number(volume), distance: Number(distance) }; })
    : []]));
  const near = GAME_AUDIO.near ?? 2, far = GAME_AUDIO.far ?? 30;
  CUT.forEach((c, i) => {
    const s = shots[c.take ? `${c.take}:${c.shot}` : c.shot];
    const a = s.first + Math.round(c.at * FPS), n = Math.round(c.len * FPS);
    for (const e of logs[s.file]) {
      const gain = GAME_AUDIO.gains[e.id];
      if (!gain || e.frame < a || e.frame >= a + n) continue;
      if (!files.has(e.file)) throw new Error(`game sound ${e.id}: no file named ${e.file} under ${GAME_AUDIO.dir}`);
      // Unity's logarithmic rolloff: full level inside `near`, near/distance beyond it, silent past `far`.
      const att = !(e.distance > near) ? 1 : e.distance >= far ? 0 : near / e.distance;
      if (att * e.volume * gain < 0.01) continue;
      game.push({ t: startOf(i) + (e.frame - a) / FPS, file: files.get(e.file), gain: att * e.volume * gain });
    }
  });
}
const gameFiles = [...new Set(game.map((g) => g.file))];
const partBase = 2 + cues.length;
const gameBase = 2 + cues.length + (parts ? parts.length : 0);
for (const part of parts ?? []) args.push('-i', `${AUDIO}${part.file}`);
for (const file of gameFiles) args.push('-i', file);
const voiceBase = gameBase + gameFiles.length;
for (const line of VOICE?.lines ?? []) {
  const file = `${new URL('..', import.meta.url).pathname}${VOICE.dir}/${line.file}.mp3`;
  if (!existsSync(file)) throw new Error(`missing narration ${file}`);
  args.push('-i', file);
}

const f = [];
// Score: keep the spans between cuts, crossfade each join.
const cuts = [...(SCORE?.cuts ?? [])].sort((a, b) => a.from - b.from);
const spans = []; let at = 0;
for (const c of cuts) { spans.push([at, c.from]); at = c.to; }
spans.push([at, null]);
let last = 'm0';
if (parts) {
  parts.forEach((p, i) => {
    const len = p.to - p.from, d = p.fade ?? 0.5, ms = Math.round(p.at * 1000);
    f.push(`[${partBase + i}:a]aresample=${SR},aformat=channel_layouts=stereo,atrim=${p.from}:${p.to},asetpts=PTS-STARTPTS,`
      + `afade=t=in:st=0:d=${i ? d : 0.01},afade=t=out:st=${(len - d).toFixed(3)}:d=${d},volume=${p.gain ?? 1},adelay=${ms}|${ms}[p${i}]`);
  });
  f.push(`${parts.map((_, i) => `[p${i}]`).join('')}amix=inputs=${parts.length}:normalize=0:dropout_transition=0[m0]`);
} else {
  spans.forEach(([a, b], i) => f.push(`[1:a]aresample=${SR},atrim=${a}${b === null ? '' : ':' + b},asetpts=PTS-STARTPTS[m${i}]`));
  for (let i = 1; i < spans.length; i++) { f.push(`[${last}][m${i}]acrossfade=d=0.08:c1=tri:c2=tri[mj${i}]`); last = `mj${i}`; }
}
// Ducks: a 0.12 s dip in, held, a 0.5 s recovery.
const duck = (SCORE?.ducks ?? []).map((d) => `${d.depth ?? 0.62}*clip((t-${d.from - 0.08})/0.12,0,1)*clip((${d.to + 0.35}-t)/0.5,0,1)`);
const vol = duck.length ? `volume='max(0,1-(${duck.join('+')}))':eval=frame,` : '';
f.push(`[${last}]${vol}apad=whole_dur=${DURATION},afade=t=out:st=${DURATION - 1.6}:d=1.6,atrim=0:${DURATION}[music]`);
// Effects: each normalised to a -3 dBFS peak, then placed so its PEAK lands on its cue (or, for a
// cue marked `onset`, so the file STARTS on it: a sound shown playing from its first frame).
const labels = [];
cues.forEach((c, i) => {
  const m = info[c.sfx];
  const norm = Math.pow(10, -3 / 20) / m.peak;
  const startMs = Math.max(0, Math.round((c.t - (c.onset ? 0 : m.peakAt)) * 1000));
  f.push(`[${i + 2}:a]aresample=${SR},aformat=channel_layouts=stereo,volume=${(norm * c.gain).toFixed(4)},adelay=${startMs}|${startMs}[s${i}]`);
  labels.push(`[s${i}]`);
});
// Game sounds start where the game started them (onset, not peak), at the game's own level.
gameFiles.forEach((file, k) => {
  const uses = game.filter((g) => g.file === file);
  f.push(`[${gameBase + k}:a]aresample=${SR},aformat=channel_layouts=stereo,asplit=${uses.length}${uses.map((_, j) => `[g${k}_${j}]`).join('')}`);
  uses.forEach((g, j) => {
    const ms = Math.round(g.t * 1000);
    f.push(`[g${k}_${j}]volume=${g.gain.toFixed(4)},adelay=${ms}|${ms}[gs${k}_${j}]`);
    labels.push(`[gs${k}_${j}]`);
  });
});
if (game.length) console.log(`game sounds: ${game.length} events from ${gameFiles.length} files`);
f.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[fx]`);
f.push(`[music]aformat=channel_layouts=stereo[mus]`);
if (VOICE?.lines?.length) {
  // The narrator starts where the timeline says (onset), and the score gets out of the way:
  // a sidechain compressor keyed on the voice dips it under every line and lets it back up.
  VOICE.lines.forEach((line, j) => {
    const ms = Math.round(line.t * 1000);
    f.push(`[${voiceBase + j}:a]aresample=${SR},aformat=channel_layouts=stereo,volume=${(VOICE.gain ?? 1) * (line.gain ?? 1)},adelay=${ms}|${ms}[vo${j}]`);
  });
  const d = VOICE.duck ?? {};
  f.push(`${VOICE.lines.map((_, j) => `[vo${j}]`).join('')}amix=inputs=${VOICE.lines.length}:normalize=0:dropout_transition=0,apad=whole_dur=${DURATION},atrim=0:${DURATION},asplit=2[voice][key]`);
  f.push(`[mus][key]sidechaincompress=threshold=${d.threshold ?? 0.02}:ratio=${d.ratio ?? 6}:attack=${d.attack ?? 20}:release=${d.release ?? 450}:makeup=1[musd]`);
  f.push(`[musd][fx][voice]amix=inputs=3:normalize=0,atrim=0:${DURATION}[pre]`);
} else {
  f.push(`[mus][fx]amix=inputs=2:normalize=0,atrim=0:${DURATION}[pre]`);
}

// Two-pass loudness to -16 LUFS / -1.5 dBTP. loudnorm reports at info level,
// so the measuring pass cannot run at -loglevel error.
let master = `[pre]alimiter=limit=0.794:attack=5:release=60:level=disabled,aresample=${SR}[a]`;
if (timeline.LOUDNESS !== null) {
  const graph1 = [...f, `[pre]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[a]`].join(';');
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'info', ...args.slice(2), '-filter_complex', graph1, '-map', '[a]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const start = probe.stderr.lastIndexOf('{'), end = probe.stderr.lastIndexOf('}');
  if (probe.status !== 0 || start < 0) { console.error(probe.stderr.slice(-3000)); throw new Error('loudness pass failed'); }
  const json = JSON.parse(probe.stderr.slice(start, end + 1));
  console.log('measured', json.input_i, 'LUFS', json.input_tp, 'dBTP');
  const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${json.input_i}:measured_TP=${json.input_tp}:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}:offset=${json.target_offset}:linear=true`;
  // A loud transient can leave linear loudnorm above the ceiling (it did by 0.4 dB): a limiter at
  // -2 dB sample peak keeps the true peak under -1.5 dBTP after the AAC encode.
  master = `[pre]${ln},alimiter=limit=0.794:attack=5:release=60:level=disabled,aresample=${SR}[a]`;
}
// ffmpeg ignores colour flags on encode, so the BT.709 tags are written here by a lossless bitstream filter.
execFileSync('ffmpeg', [...args, '-filter_complex', [...f, master].join(';'), '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
  '-c:a', 'aac', '-b:a', '256k', '-ar', String(SR), '-movflags', '+faststart', '-t', String(DURATION), out], { stdio: 'inherit' });
console.log('wrote', out);
