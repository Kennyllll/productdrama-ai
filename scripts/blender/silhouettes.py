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
# 转向：车把 / 前叉 / 前轮绕车头管轴转 steer_deg（孩子扶车时车把通常转着）；部件和轴来自 <glb>.rig.json（导入坐标）
_rig = g("rig") or (g("glb") + ".rig.json")
if g("steer_deg", 0) and os.path.exists(_rig):
    _r = json.load(open(_rig)); _a = mathutils.Vector(_r["axis"][0]); _b = mathutils.Vector(_r["axis"][1])
    _S = mathutils.Matrix.Translation(_a) @ mathutils.Matrix.Rotation(math.radians(g("steer_deg")), 4, (_b - _a).normalized()) @ mathutils.Matrix.Translation(-_a)
    for o in objs:
        if o.name in _r["parts"]: o.matrix_world = _S @ o.matrix_world
    bpy.context.view_layer.update()

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

# 握把中心（与 render_product.py 同一算法），每个视角投影到剪影像素，写入 grips.json
from bpy_extras.object_utils import world_to_camera_view
_vs = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
_x = [v.x for v in _vs]; _y = [v.y for v in _vs]; _z = [v.z for v in _vs]
_lat = 0 if (max(_x) - min(_x)) < (max(_y) - min(_y)) else 1
_zmax, _zmin = max(_z), min(_z)
_top = [v for v in _vs if v.z > _zmax - 0.12 * (_zmax - _zmin)]
_lv = [v[_lat] for v in _top]; _lo, _hi = min(_lv), max(_lv); _span = _hi - _lo
grip_base = []
for _sel in ([v for v in _top if v[_lat] < _lo + 0.2 * _span], [v for v in _top if v[_lat] > _hi - 0.2 * _span]):
    if _sel: grip_base.append(sum(_sel, mathutils.Vector()) / len(_sel))
del _vs, _x, _y, _z, _top
all_grips = []

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
    vmn, vmx = bounds(); vmn0z = vmn.z
    for o in objs: o.location.z -= vmn.z
    bpy.context.view_layer.update(); vmn, vmx = bounds()
    az = math.radians(v["azimuth_deg"]); el = math.radians(v.get("elevation_deg", 6))
    tgt = mathutils.Vector((0, 0, (vmx.z - vmn.z) * g("target_height_frac", 0.42)))
    dist = size * 2.3 * (lens / 50) ** 0.9
    el = max(el, math.asin(max(-1.0, min(1.0, (size * 0.02 - tgt.z) / dist))))  # 相机不能低于地面，否则地面会挡住产品
    loc = tgt + mathutils.Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el))) * dist
    co.location = loc; co.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    _px = s.render.resolution_x
    _gw = [(R @ gb) - mathutils.Vector((0, 0, vmn0z)) for gb in grip_base]
    all_grips.append([[p.x * _px, (1 - p.y) * _px] for p in (world_to_camera_view(s, co, w) for w in _gw)])
    s.render.filepath = os.path.join(g("out_dir"), f"sil_{i}.png")
    bpy.ops.render.render(write_still=True)
json.dump(all_grips, open(os.path.join(g("out_dir"), "grips.json"), "w"))
print("SIL_OK", len(g("views")))
