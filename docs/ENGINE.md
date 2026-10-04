# Engine: filming the game itself

An engine take is the running game, filmed by a director: the only code that goes into the game. It boots with one command-line switch and a plan file, films the plan's shots in order, writes what it filmed, and quits. Everything after that happens outside the game. `src/stories/trailer.js` cuts the Unity sample's shots into a trailer.

## The contract (any engine)

A director:

- turns on with one switch and a plan path (`-trailer plan.json` here)
- gets into play, hides the interface, and takes over the cameras
- locks the clock: the game advances exactly 1/60 s per captured frame, however long a frame takes to render, and physics steps once per captured frame (scaled with slow motion)
- plays the shots in order. Each shot sets up its actors, films `preroll` seconds unrecorded so things are already moving, then films `duration` seconds
- writes each frame as raw RGB24, bottom row first, to the `output` FIFO, or PNG stills at `stillAt` fractions of each shot into `stillsDir`
- writes `manifest.txt`, one line per shot: `<name> first=<frame> frames=<count>`, then anything else worth knowing
- writes `sounds.txt`, one line per sound the game played while recording: `<frame> <id> <file name> <volume> <distance from the camera>`
- writes `probe.txt`, the anchors shots are authored against
- logs `TRAILER_OK frames=<n>` and exits 0, or logs `TRAILER_FAILED <reason>` and exits 1

`capture/film.sh` starts ffmpeg on the FIFO, runs the player with the switch, and files the outputs as `<take>.mp4`, `<take>-manifest.txt` and `<take>-sounds.txt`.

## The plan

`capture/plan.py` writes it (`python3 capture/plan.py film` or `stills`), and `PLAYER=<player> capture/film.sh [plan] [take]` films it. Plan fields:

| Field | Meaning |
| --- | --- |
| `width`, `height`, `fps` | Capture size and rate (1920, 1080, 60) |
| `output` | The FIFO frames go to (film plans) |
| `stillsDir`, `stillAt` | Where PNGs go and at which fractions of each shot (stills plans) |
| `only` | Comma-separated shot names to film; the rest are skipped |
| `settle` | Seconds to let the game settle before the first shot (1.5) |
| `keepInterface` | 1 to leave the game's interface on screen |

Shot fields:

| Field | Meaning |
| --- | --- |
| `name` | Unique; the cut refers to shots by name |
| `duration`, `preroll` | Seconds recorded, and seconds played unrecorded first |
| `timeScale` | Slow motion: 0.35 plays the game at 35% speed |
| `reload` | 1 to run the `Begin` hook again first (a fresh level) |
| `space` | `play` (the game's own camera), `world` (scene coordinates) or `subject` (around `subject`, turning with its heading) |
| `subject` | Name of the object `subject` space follows and `look: "subject"` aims at |
| `camFrom`, `camTo` | Camera position at the start and end, in the shot's space |
| `look` | Empty to aim at `lookFrom`/`lookTo` in the shot's space, `subject`, or the name of any object |
| `lookFrom`, `lookTo` | The aim point, or an offset from the named object |
| `fovFrom`, `fovTo` | Vertical field of view, degrees (50) |
| `ease` | `slow`, `inout`, `in`, `out`, or linear when empty |
| `followLag` | Seconds the `subject` frame lags behind its subject (0.25), so the camera glides |
| `shake`, `roll` | Handheld drift in metres, and a fixed roll in degrees |
| `action`, `at`, `yaw` | Free for the game's `Setup` hook: what to do and where |

Positions are `[x, y, z]`. Absent numbers read as zero, so every default is chosen to be zero.

## Unity

Copy `unity/TrailerKit/Runtime` into the project. The director installs itself when the player starts with `-trailer`, and does nothing otherwise. It has its own assembly definition, `TrailerKit`, so code in other assembly definitions can reference it.

With no hooks, it films the scene the player boots into through `Camera.main`. A game connects through static hooks, set before the first scene loads:

```csharp
using System.Linq;
using TrailerKit;
using UnityEngine;

static class GameTrailerHooks
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    static void Connect()
    {
        // Into play: skip the title screen, load the level, wait for the player.
        TrailerDirector.Begin = GameFlow.StartLevelForCapture;      // an IEnumerator
        // The game's own camera, when it is not tagged MainCamera.
        TrailerDirector.PlayCamera = () => Player.Instance.Camera;
        // Set up each shot: spawn, start a route, reset the level.
        TrailerDirector.Setup = shot =>
        {
            if (shot.action == "route") AutoPilot.Run(shot.at, shot.yaw);
        };
        // Anything worth reading back in the manifest after each shot.
        TrailerDirector.Report = shot => $"player={Player.Instance.transform.position} failed={AutoPilot.Failed}";
        // Anchors for probe.txt.
        TrailerDirector.Probe = () => SpawnPoints.All.Select(p => $"spawn {p.name} {p.position}");
    }
}
```

And one line wherever the game plays a one-shot sound, so the trailer can play it back on the same frame:

```csharp
TrailerDirector.Sound("jump", clip, transform.position, volume);   // null position for a 2D sound
```

A hook that finds the game in a state a shot cannot start from calls `TrailerDirector.Fail("reason")`.

Details:

- **The director's camera is a copy of the game's camera.** It has the same culling, clear flags and render-pipeline settings, including URP's or HDRP's post-processing settings, and none of the game's camera scripts. "play" shots film the game's camera itself.
- **Frames are read after rendering finishes** (`WaitForEndOfFrame`) from a RenderTexture at the plan's size, whatever the window size. The player can run in a small window.
- **Interface.** Every UI Toolkit document and every root Canvas is hidden at the start of each shot, unless the plan sets `keepInterface`.
- **Slow motion** sets `Time.timeScale` and `Time.fixedDeltaTime` together, so physics still steps once per filmed frame.
- **Saves.** On Linux, `film.sh` gives the player scratch `XDG_CONFIG_HOME` and `XDG_DATA_HOME` folders. Unity's macOS and Windows players save under Library and AppData: back saves up before filming there.
- **Windows** has no POSIX FIFO, so `film.sh` does not run there. The one place to change is the frame sink in `TrailerDirector.Start`: start ffmpeg as a child process and write frames to its standard input.

`unity/TrailerKit/Sample` shows every hook in a working scene; leave it out of a game.

## Other engines

The post pipeline only needs the contract's outputs: a master video at 60 fps and the manifest. Sounds are optional. Notes for writing a director elsewhere:

- **Godot 4.** Movie Maker mode (`--write-movie <file> --fixed-fps 60`) locks the clock and writes the frames for you. Have an autoload script read the plan, drive the shots and cameras, and write the manifest's frame counts as it goes. Convert the movie to the master with ffmpeg.
- **Unreal.** Run with a fixed time step (`-benchmark -fps=60`) and read back the viewport each frame. Sequencer and Movie Render Queue are the native alternative when shots can be authored as sequences.
- **Browser games.** Own the loop: stop the game's `requestAnimationFrame` clock, advance it 1/60 s per captured frame, and take each frame with a headless browser.
