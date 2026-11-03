"""Fast product silhouettes for view matching (Workbench, no lighting).
usage: blender -b -noaudio --python silhouettes.py -- <spec.json>
spec: {glb, out_dir, size_px, lens_mm, target_height_frac, views: [{azimuth_deg, elevation_deg, roll_deg}]}
Writes out_dir/sil_<i>.png (RGBA, alpha = product) and prints SIL_OK <n>.
Camera / roll math matches render_product.py.
"""
import bpy, json, math, sys, os, mathutils
spec = json.load(open(sys.argv[sys.argv.index("--") + 1]))
g = lambda k, d=None: spec.get(k, d)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=g("glb"))
objs = [o for o in bpy.data.objects if o.type == "MESH"]

def bounds():
    mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
    for o in objs:
        for v in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(v)
            mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
    return mn, mx

mn, mx = bounds(); size = max(mx - mn)
if size > 50:
    for o in objs: o.scale = (0.001,) * 3
    bpy.context.view_layer.update(); mn, mx = bounds(); size = max(mx - mn)
center = (mn + mx) / 2
shift = mathutils.Vector((center.x, center.y, mn.z))
for o in objs: o.location -= shift
bpy.context.view_layer.update()
base = {o.name: o.matrix_world.copy() for o in objs}

cam = bpy.data.cameras.new("cam"); cam.lens = g("lens_mm", 50); cam.sensor_width = 36
co = bpy.data.objects.new("cam", cam); bpy.context.collection.objects.link(co); bpy.context.scene.camera = co
s = bpy.context.scene
s.render.engine = "BLENDER_WORKBENCH"; s.display.shading.light = "FLAT"; s.display.shading.color_type = "SINGLE"
s.render.film_transparent = True; s.render.resolution_x = s.render.resolution_y = g("size_px", 400)
s.render.image_settings.file_format = "PNG"; s.render.image_settings.color_mode = "RGBA"
os.makedirs(g("out_dir"), exist_ok=True)
lens = g("lens_mm", 50)
for i, v in enumerate(g("views")):
    roll = math.radians(v.get("roll_deg", 0))
    R = mathutils.Euler((roll, 0, 0), "XYZ").to_matrix().to_4x4()
    for o in objs: o.matrix_world = R @ base[o.name]
    bpy.context.view_layer.update()
    vmn, vmx = bounds()
    for o in objs: o.location.z -= vmn.z
    bpy.context.view_layer.update(); vmn, vmx = bounds()
    az = math.radians(v["azimuth_deg"]); el = math.radians(v.get("elevation_deg", 6))
    tgt = mathutils.Vector((0, 0, (vmx.z - vmn.z) * g("target_height_frac", 0.42)))
    dist = size * 2.3 * (lens / 50) ** 0.9
    loc = tgt + mathutils.Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el))) * dist
    co.location = loc; co.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    s.render.filepath = os.path.join(g("out_dir"), f"sil_{i}.png")
    bpy.ops.render.render(write_still=True)
print("SIL_OK", len(g("views")))
