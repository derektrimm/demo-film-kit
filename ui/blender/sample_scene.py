"""A sample scene for ui/blender/film.sh: a detailed model beside a light one made from it, the way
a clean-up for a game looks in Blender. The statistics read the detailed model's faces, then the
light model's when it is selected, while the wireframe rises over both.

    ui/blender/film.sh ui/blender/sample_scene.py ui/captures/blender 150
"""
import bpy
from mathutils import Vector


def material(name, color, roughness):
    m = bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = roughness
    return m


def monkey(name, location, level, ratio, mat):
    bpy.ops.mesh.primitive_monkey_add(size=1.0, location=location)
    ob = bpy.context.active_object
    ob.name = name
    if level:
        mod = ob.modifiers.new("Subdivision", 'SUBSURF'); mod.levels = level; mod.render_levels = level
    if ratio:
        sub = ob.modifiers.new("Subdivision", 'SUBSURF'); sub.levels = 2
        dec = ob.modifiers.new("Decimate", 'DECIMATE'); dec.ratio = ratio
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(mat)
    return ob


def build():
    sc = bpy.context.scene
    world = bpy.data.worlds.new("Studio")
    sc.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs["Color"].default_value = (0.05, 0.05, 0.06, 1)
    bg.inputs["Strength"].default_value = 1.0
    high = monkey("Detailed model", (-1.2, 0, 0), 3, None, material("Clay", (0.75, 0.55, 0.38), 0.5))
    low = monkey("Game model", (1.2, 0, 0), 0, 0.15, material("Painted", (0.85, 0.62, 0.25), 0.35))
    light = bpy.data.objects.new("Key light", bpy.data.lights.new("Key light", 'AREA'))
    light.data.energy = 600; light.data.size = 4
    sc.collection.objects.link(light); light.location = (-3, -4, 5); light.rotation_euler = (0.7, 0, -0.6)
    prefs = bpy.context.preferences
    # Unselected wires draw black, which turns a dense mesh into a dark blob: draw them light.
    prefs.themes[0].view_3d.wire = (0.78, 0.76, 0.7)
    return dict(target=Vector((0, 0, 0)), eye=Vector((0, -5.2, 1.4)), distance=5.4, orbit=16.0,
                wire=(0.25, 0.45), select=[(0.0, high), (0.55, low)])
