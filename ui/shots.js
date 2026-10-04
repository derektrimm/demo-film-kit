// The interface shots, drawn from real captures (ui/record.mjs) by ui/index.html. Replace these with
// your tool's. Positions are in the 1920x1080 layout the tool was captured at (captures are 2x).
//
// A shot shows one of:
//   image   one capture
//   seq     captures played across the shot, each dissolving into the next (seqFrom/seqTo: when, in
//           seconds; seqHold: hold each and dissolve only the last part of its turn, for changing words)
//   board   several pictures laid out on one card ({ image or seq, x, y, w, h, t0 }; `wave` plays a
//           waveform image with a playhead; `plain` fills its box with no frame)
// A capture is a path, or { dir, match, from, to, last } naming frames from a recording's frames.json.
//
// seqBase + seqClip play only the regions that really change over one still of the rest: a blinking
// cursor or a pulsing status dot would otherwise pulse through every dissolve.
// place     the window's title: say what is on screen
// backdrop  a still behind the window (blurred and dimmed; backdropBlur, backdropDim)
// from/to   the camera inside the window: the layout rectangle that fills it, eased across the shot. A
//           shot that dissolves from the one before starts where that one ended, so only the content
//           dissolves: two framings dissolving into each other ghost every line of text.
// callouts  rings that draw themselves around what the shot teaches ({ x, y, w, h, t0, t1 }), with an
//           optional loupe that enlarges the ringed region ({ x, y, s }: where, and how many times)

const REC = '/ui/captures/sample';
const PLACE = 'Task console';
const BACKDROP = '/ui/backdrops/studio.jpg';
const ASK = { x: 75, y: 165, w: 506, h: 150 };
const LOG = { x: 648, y: 111, w: 1224, h: 460 };

export const SHOTS = [
  // The tool as it opens: the camera settles on the empty task box.
  { name: 'ui-open', duration: 5.5, place: PLACE, backdrop: BACKDROP, image: { dir: REC, match: 'start' },
    from: { x: 0, y: 0, w: 1920 }, to: { x: 20, y: 60, w: 1100 },
    callouts: [{ ...ASK, t0: 2.2, t1: 5.2 }] },
  // The ask, typed a character at a time: only the box plays, over a still of the typed page.
  { name: 'ui-ask', duration: 6.5, place: PLACE, backdrop: BACKDROP,
    seq: [{ dir: REC, match: 'type-' }, { dir: REC, match: 'typed' }], seqFrom: 0.4, seqTo: 5.2,
    seqBase: { dir: REC, match: 'typed' }, seqClip: [ASK],
    from: { x: 20, y: 60, w: 1100 }, to: { x: 40, y: 110, w: 820 } },
  // It works: the live notes as a time-lapse, the rest of the page still, while the camera travels from
  // the ask to the notes.
  { name: 'ui-working', duration: 6.0, place: PLACE, backdrop: BACKDROP,
    seq: { dir: REC, match: 'live' }, seqFrom: 0.8, seqTo: 5.6,
    seqBase: { dir: REC, match: 'live', last: true }, seqClip: [LOG],
    from: { x: 40, y: 110, w: 820 }, to: { x: 620, y: 90, w: 1180 } },
  // Done: a ring on the result, and a loupe that reads it out.
  { name: 'ui-done', duration: 5.5, place: PLACE, backdrop: BACKDROP, image: { dir: REC, match: 'done' },
    from: { x: 620, y: 90, w: 1180 }, to: { x: 600, y: 80, w: 1240 },
    callouts: [{ x: 675, y: 482, w: 520, h: 57, t0: 1.0, t1: 5.2, loupe: { x: 300, y: 820, s: 2.2 } }] },
];

// The accent for rings, the title bar and loupes ('r,g,b'), and the title bar's font.
export const THEME = { accent: '232,178,74', font: '600 19px "JetBrains Mono"' };
