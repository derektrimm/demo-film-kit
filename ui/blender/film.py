"""Films Blender's interface frame by frame (run by film.sh, inside its own Blender).

    blender --factory-startup -p 0 0 3840 2160 --no-window-frame --python film.py -- <scene.py> <out dir> <frames> [probe]

The scene script sets up what is on screen and returns how to film it from build():

    dict(target=Vector, eye=Vector, distance=float,   # the viewport looks from eye toward target, this far out
         orbit=degrees,                               # it swings this far around target across the shot
         wire=(a, b) or (a, b, fall_a, fall_b),       # optional: the wireframe overlay rises over a..b (fractions)
         select=[(fraction, object), ...],            # optional: what is selected from when (the statistics follow)
         shading='MATERIAL')                          # optional: SOLID, MATERIAL or RENDERED

Each frame is posed from its index alone, the viewport settles, and the whole window is saved as
bl-NNNN.png; frames.json lists them for ui/shots.js. Film at 30 frames a second and let the shot page
dissolve between them: the orbit is slow enough that nothing ghosts. Prints BLENDER_FILM_OK when done.
"""
import importlib.util
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
SCENE, OUT, FRAMES = Path(argv[0]), Path(argv[1]), int(argv[2])
PROBE = len(argv) > 3 and argv[3] == "probe"
OUT.mkdir(parents=True, exist_ok=True)

prefs = bpy.context.preferences
prefs.view.ui_scale = 2.0
prefs.view.show_splash = False
for o in list(bpy.data.objects):          # the factory cube, camera and light
    if o.name in ("Cube", "Camera", "Light"):
        bpy.data.objects.remove(o, do_unlink=True)

spec = importlib.util.spec_from_file_location("film_scene", SCENE)
scene_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scene_module)
shot = scene_module.build()

win = bpy.context.window
area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
sp = area.spaces.active
r3 = sp.region_3d
sp.shading.type = shot.get("shading", "MATERIAL")
sp.shading.use_scene_world = True
sp.shading.use_scene_lights = True
sp.overlay.show_overlays = True
sp.overlay.show_stats = True
sp.overlay.wireframe_threshold = 1.0
r3.view_perspective = 'PERSP'
sc = win.scene
sc.eevee.taa_samples = 12
# The outliner opens every object, so its names read on screen.
for a in win.screen.areas:
    if a.type == 'OUTLINER':
        with bpy.context.temp_override(window=win, area=a, region=next(r for r in a.regions if r.type == 'WINDOW')):
            bpy.ops.outliner.expanded_toggle()


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def pose(i):
    k = i / max(1, FRAMES - 1)
    e = 0.5 - 0.5 * math.cos(math.pi * k)                   # ease in and out
    yaw = math.radians(shot.get("orbit", 0.0)) * (e - 0.5)
    off = Matrix.Rotation(yaw, 3, "Z") @ (shot["eye"] - shot["target"])
    r3.view_location = shot["target"]
    r3.view_distance = shot["distance"]
    r3.view_rotation = off.to_track_quat('Z', 'Y')
    for at, ob in reversed(shot.get("select", [])):
        if k >= at:
            # Imports leave their objects selected: set the whole selection every frame.
            for o in sc.objects:
                o.select_set(o is ob)
            bpy.context.view_layer.objects.active = ob
            break
    wire = shot.get("wire")
    if wire:
        a, b, *fall = wire
        o = smoothstep((k - a) / (b - a))
        if fall:
            o *= 1 - smoothstep((k - fall[0]) / (fall[1] - fall[0]))
        sp.overlay.show_wireframes = o > 0.001
        sp.overlay.wireframe_opacity = o


todo = list(range(0, FRAMES, 30 if PROBE else 1))
state = {"files": [], "t0": time.time(), "posed": None}


def step():
    # Two ticks per frame: pose on one, capture on the next. Blender's statistics follow a selection
    # change only on a later pass of its event loop, so a capture in the same tick shows the old counts.
    if state["posed"] is None:
        if not todo:
            print(f"BLENDER_FILM_OK {len(state['files'])} frames in {time.time() - state['t0']:.0f} s -> {OUT}", flush=True)
            bpy.ops.wm.quit_blender()
            return None
        state["posed"] = todo.pop(0)
        pose(state["posed"])
        return 0.01
    i, state["posed"] = state["posed"], None
    name = f"bl-{i + 1:04d}.png"
    with bpy.context.temp_override(window=win, area=area):
        # Let the viewport's samples settle on the new view, then save the whole window.
        bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=sc.eevee.taa_samples + 2)
        bpy.ops.screen.screenshot(filepath=str(OUT / name), check_existing=False)
    state["files"].append(name)
    (OUT / "frames.json").write_text(json.dumps(state["files"], indent=1) + "\n")
    if len(state["files"]) % 20 == 1:
        print(f"frame {i + 1}/{FRAMES} {time.time() - state['t0']:.0f} s", flush=True)
    return 0.01


def warm():
    # Shaders and textures compile before the first frame.
    with bpy.context.temp_override(window=win, area=area):
        bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=40)
    bpy.app.timers.register(step, first_interval=1.0)
    return None


bpy.app.timers.register(warm, first_interval=8.0)
