// Builds the whole film from the story (src/timeline.js) in one run: the pages, every capture step in
// BUILD.steps, then the captions, the cut, the mix, the join with the intro and closing card, and the
// smoothness check. Writes out/film.mp4.
//
//   node scripts/build.mjs                 everything
//   node scripts/build.mjs --skip-steps    reuse the takes already in capture/ (re-cut, re-caption, re-mix)
//   node scripts/build.mjs --steps-only    only make the takes
//
// It checks for every sound file the story needs before rendering anything, so a missing effect fails
// in seconds, not after a long render. scripts/stand-in-audio.sh makes placeholders to start with.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as story from '../src/timeline.js';

const ROOT = new URL('..', import.meta.url).pathname;
const flags = new Set(process.argv.slice(2));
const BUILD = story.BUILD ?? { steps: [] };
const at = (p) => join(ROOT, p);
const run = (cmd, args, env = {}) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
};
const node = (script, ...args) => run('nice', ['-n', '19', process.execPath, script, ...args]);

// Sound files, checked first.
const missing = [];
const need = (file) => { if (!existsSync(at(file))) missing.push(file); };
if (story.SCORE) for (const f of story.SCORE.parts ? story.SCORE.parts.map((p) => p.file) : [story.SCORE.file ?? 'music.mp3']) need(`out/audio/${f}`);
for (const c of story.soundCues()) need(`out/audio/sfx/${c.sfx}.mp3`);
// The ident's cues depend on IDENT_SHOT, read when its module loads: one import per shot.
if (BUILD.steps.some((s) => s.ident)) for (const shot of ['intro', 'outro']) {
  process.env.IDENT_SHOT = shot;
  const mod = await import(`../ident/sound.js?${shot}`);
  for (const c of mod.soundCues()) need(`out/audio/sfx/${c.sfx}.mp3`);
}
if (missing.length && !flags.has('--steps-only')) {
  console.error(`missing sound files:\n  ${[...new Set(missing)].join('\n  ')}\nscripts/stand-in-audio.sh makes placeholders for the samples.`);
  process.exit(1);
}

run('npx', ['vite', 'build', '--logLevel', 'warn']);

if (!flags.has('--skip-steps')) {
  for (const step of BUILD.steps) {
    if (step.record) node('ui/record.mjs', step.record, step.out);
    else if (step.render) node('scripts/render.mjs', step.render, step.take, ...(step.only ? ['--only', step.only.join(',')] : []), ...(step.gpu ? ['--gpu'] : []));
    else if (step.still) {
      // One frame of a take: the shot's first frame from its manifest, plus `at` seconds.
      const { take, shot, at: s } = step.still;
      const line = readFileSync(at(`capture/${take}-manifest.txt`), 'utf8').split('\n').find((l) => l.startsWith(`${shot} `));
      if (!line) throw new Error(`still: no shot ${shot} in capture/${take}-manifest.txt`);
      const frame = Number(/first=(\d+)/.exec(line)[1]) + Math.round(s * story.FPS);
      mkdirSync(dirname(at(step.out)), { recursive: true });
      run('ffmpeg', ['-loglevel', 'error', '-y', '-i', `capture/${take}.mp4`, '-vf', `select='eq(n\\,${frame})'`, '-fps_mode', 'passthrough', '-frames:v', '1', '-q:v', '3', step.out]);
    } else if (step.engine) {
      if (!process.env.PLAYER) throw new Error('engine step: set PLAYER to the built player');
      run('python3', ['capture/plan.py', 'film']);
      run('capture/film.sh', [step.engine, step.take ?? 'master']);
    } else if (step.ident) {
      for (const shot of ['intro', 'outro']) {
        node('scripts/render.mjs', 'ident/', `ident-${shot}`, '--only', shot, '--gpu');
        mkdirSync(dirname(at(BUILD[shot])), { recursive: true });
        run('nice', ['-n', '19', process.execPath, 'scripts/mix.mjs', `capture/ident-${shot}.mp4`, BUILD[shot], '--timeline', 'ident/sound.js'], { IDENT_SHOT: shot });
      }
    } else throw new Error(`unknown build step ${JSON.stringify(step)}`);
  }
}
if (flags.has('--steps-only')) process.exit(0);

node('scripts/overlay.mjs', 'out/captions.mov');
node('scripts/cut.mjs', 'out/captions.mov', 'out/body-picture.mp4');
node('scripts/mix.mjs', 'out/body-picture.mp4', 'out/body.mp4');
const join_ = ['scripts/join.mjs', 'out/body.mp4', 'out/film.mp4'];
if (BUILD.intro) join_.push('--intro', BUILD.intro);
if (BUILD.outro) join_.push('--outro', BUILD.outro);
if (BUILD.sting) join_.push('--sting', BUILD.sting);
node(...join_);
const intro = BUILD.intro ? Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', at(BUILD.intro)]).toString()) : 0;
node('scripts/check.mjs', 'out/film.mp4', String(intro));
console.log('\nBUILD_OK out/film.mp4');
