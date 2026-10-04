# Tools: filming the real thing being used

A walkthrough or a commercial shows how a product is used: a person asks a tool for something, the tool works, the result appears. Film the real tool doing real work, never a mock-up. The ui take shows those captures in a window over a blurred backdrop, so a tool never reads as the product itself; its title bar names what is on screen.

## Recording a web tool

`ui/record.mjs` drives any tool with a web interface from a short JSON script, and photographs it at 2x (a 1920x1080 layout at 3840x2160), so the window's camera can move in close without blur:

```sh
node ui/record.mjs ui/sample-app/record.json ui/captures/sample
```

Steps: `snap` (one frame, `png: true` for the frames you will hold on), `click`, `type` (a frame every `every` characters, so the typing plays back a character at a time), `press`, `wait`, `scroll`, and `watch` (a time-lapse every `every` seconds until a selector appears). `hide` lists CSS selectors to remove from every frame, such as a framework's development badge. The frames land as `NNNN-<name>.jpg` with `frames.json` listing them.

A terminal can be filmed the same way through a web terminal. A desktop application can be filmed with any screen recorder at 2x, as long as the frames are numbered and listed in a `frames.json`.

Film real work and keep what it really produced: its notes, its before and after pictures, its files. Use a local copy of the tool with test data, so no real user's data appears on screen.

## Recording Blender

`ui/blender/film.sh` films Blender's own interface frame by frame: a scene script sets up what is on screen (`ui/blender/sample_scene.py` puts a detailed model beside the light model made from it), and the viewport orbits slowly while the statistics, the outliner and the wireframe overlay show what the shot is about.

```sh
BLENDER=/path/to/blender ui/blender/film.sh ui/blender/sample_scene.py ui/captures/blender 150
```

It runs Blender on its own virtual display (Xvfb, Linux) with throwaway settings, so the Blender on your desktop and its preferences are untouched. Add `probe` to film every 30th frame and check the framing first. Each frame is posed on one pass of Blender's event loop and captured on the next, because the statistics follow a selection change only after a pass.

A Blender recording plays like any other. With the sample scene, a shot that rings the statistics and reads them out in a loupe:

```js
{ name: 'blender', duration: 5, place: 'Blender', seq: { dir: '/ui/captures/blender', match: 'bl-' },
  from: { x: 0, y: 0, w: 1300 }, to: { x: 0, y: 0, w: 1200 },
  callouts: [{ x: 36, y: 88, w: 180, h: 120, t0: 1.0, t1: 4.8, loupe: { x: 760, y: 560, s: 2.4 } }] },
```

Measure a callout's rectangle on the capture itself (layout pixels are capture pixels halved), and keep it inside the camera's view for the whole callout: a ring outside the window is drawn over the backdrop.

## The shots

`ui/shots.js` lists the shots. Each shows an `image`, a `seq` (captures played across the shot, each dissolving into the next) or a `board` (several pictures laid out on one card; a `wave` item plays a waveform with a playhead, for a sound). A capture is a path, or `{ dir, match, from, to, last }` naming frames from a recording.

- `place` is the window's title. `backdrop` is a still behind the window, blurred and dimmed; `scripts/build.mjs` can save one from another take (a `still` step).
- `from` and `to` move the camera inside the window: the layout rectangle that fills it, eased across the shot.
- `callouts` are rings that draw themselves around what the shot teaches, and dim the rest; a `loupe` enlarges the ringed region beside it, for small text.
- `seqBase` and `seqClip` play only the regions that really change over one still frame of the rest. A blinking cursor, a pulsing status dot or a shimmering header would otherwise pulse through every dissolve; find the regions by differencing the frames, not by guessing.
- `seqHold` holds each capture and dissolves only the last part of its turn, for a run of states whose words change (a dissolve would show both sets of words at once).

Render them with `node scripts/render.mjs ui/ ui`, or as stills with `--stills <dir> <shot>:<seconds> ...`.

## Teaching in steps

A walkthrough teaches. In the story:

- A numbered plate per step (`{ step: 1, kicker: 'Ask in plain words' }`), above the window.
- A chapter wipe (`WIPES`) on every cut that changes place, naming where the picture goes: "The Tool", "The Product". Shots in the same place dissolve instead (`dissolve` on the cut entry). Every change of place should be unmistakable.
- A tag on product footage after a wipe (`{ tag: 'In the product' }`), and a tool card quoting what was asked of a tool (`{ tool: 'the build', by: 'Asked', quote: '...' }`).
- Narration (`VOICE`) says what each step is; start each line after its wipe clears, and verify every line by transcribing it: a transcriber that normalises an unusual name to a famous one shows the listener will mishear it too.

## Traps

- **Dark gradients band.** A smooth dark glow quantised to 8 bits shows rings that crawl when the camera moves. The shot page adds a fixed dither (never animated: that shimmers), and every encode uses `aq-mode=3` with deadzones.
- **Interface sequences dissolve, product footage never does.** `scripts/check.mjs` flags the hard swaps of a captured sequence; give such a shot a `seq` dissolve, never a hard cut.
- **The browser's spellchecker** underlines names in a typed box; `record.mjs` turns it off for the box it types into.
