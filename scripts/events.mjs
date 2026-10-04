// The capture's event map: every sound the product played within `near` metres of the
// camera, per shot, in seconds into that shot's capture. Read it to find the frame a
// jump, a hit or a pickup happens on, then cut and cue on it.
//   node scripts/events.mjs [take=master] [near metres=12] [ids to skip, comma separated]
import { readFileSync } from 'node:fs';

const [take = 'master', nearArg = '12', skipArg = ''] = process.argv.slice(2);
const CAP = new URL('../capture/', import.meta.url).pathname;
const near = Number(nearArg), skip = new Set(skipArg.split(',').filter(Boolean));
const shots = readFileSync(`${CAP}${take}-manifest.txt`, 'utf8').split('\n').map((l) => /^(\S+) .*first=(\d+) frames=(\d+)/.exec(l)).filter(Boolean)
  .map((m) => ({ name: m[1], first: Number(m[2]), frames: Number(m[3]) }));
const events = readFileSync(`${CAP}${take}-sounds.txt`, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' '))
  .map(([frame, id, , , distance]) => ({ frame: Number(frame), id, distance: Number(distance) }));
for (const s of shots) {
  const last = {};
  const seen = [];
  for (const e of events) {
    if (e.frame < s.first || e.frame >= s.first + s.frames || skip.has(e.id) || e.distance > near) continue;
    const t = (e.frame - s.first) / 60;
    if (last[e.id] !== undefined && t - last[e.id] < 0.5) continue;   // a repeating sound once per half second
    last[e.id] = t;
    seen.push(`${t.toFixed(1)}:${e.id}`);
  }
  console.log(`${s.name.padEnd(18)} (${(s.frames / 60).toFixed(0)} s) ${seen.join(' ')}`);
}
