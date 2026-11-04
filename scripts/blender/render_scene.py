"""3D 场景匹配渲染：按空场景解出的相机搭地面 + 墙面（阴影捕捉），车平行于墙放在墙脚，
向墙侧倾 roll_deg 后平移到最靠墙的部件刚好碰到墙面（两轮着地、接触由几何算出，不靠 AI）。
usage: blender -b -noaudio --python render_scene.py -- <spec.json>
spec: {glb, out, width, height, lens_mm, cam_height, pitch_deg, wall:{a,dir,normal}, place, roll_deg, steer_deg, flip,
       env_image, env_strength, sun_az_deg, sun_elev_deg, sun_kelvin, sun_strength, samples}
Writes out (RGBA：车 + 地面 / 墙面阴影), out_mask（只有车）; prints SCENE_OK {grips, contact, ...}
"""
import bpy, json, math, sys, os, mathutils
import numpy as np
spec = json.load(open(sys.argv[sys.argv.index("--") + 1]))
g = lambda k, d=None: spec.get(k, d)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=g("glb"))
objs = [o for o in bpy.data.objects if o.type == "MESH"]
_rig = g("rig") or (g("glb") + ".rig.json")
if g("steer_deg", 0) and os.path.exists(_rig):
    _r = json.load(open(_rig)); _a = mathutils.Vector(_r["axis"][0]); _b = mathutils.Vector(_r["axis"][1])
    _S = mathutils.Matrix.Translation(_a) @ mathutils.Matrix.Rotation(math.radians(g("steer_deg")), 4, (_b - _a).normalized()) @ mathutils.Matrix.Translation(-_a)
    for o in objs:
        if o.name in _r["parts"]: o.matrix_world = _S @ o.matrix_world
bpy.context.view_layer.update()

def verts():
    out = []
    for o in objs:
        n = len(o.data.vertices)
        co = np.empty(n * 3, dtype=np.float64); o.data.vertices.foreach_get("co", co)
        co = co.reshape(n, 3); M = np.array(o.matrix_world)
        out.append((o, co @ M[:3, :3].T + M[:3, 3]))
    return out

def apply(M):
    for o in objs: o.matrix_world = M @ o.matrix_world
    bpy.context.view_layer.update()

V = np.concatenate([v for _, v in verts()])
mn, mx = V.min(0), V.max(0)
if (mx - mn).max() > 50: apply(mathutils.Matrix.Diagonal((0.001, 0.001, 0.001, 1))); V *= 0.001; mn *= 0.001; mx *= 0.001
c = (mn + mx) / 2
apply(mathutils.Matrix.Translation((-c[0], -c[1], -mn[2])))
# 车的前进轴转到 X（侧向是两轴里较短的那个）
ext = mx - mn
if ext[0] < ext[1]: apply(mathutils.Matrix.Rotation(math.pi / 2, 4, "Z"))
if g("flip", False): apply(mathutils.Matrix.Rotation(math.pi, 4, "Z"))
# 握把（正立时车把最高处横向两端）
V = np.concatenate([v for _, v in verts()])
top = V[V[:, 2] > V[:, 2].max() - 0.12 * (V[:, 2].max() - V[:, 2].min())]
lo, hi = top[:, 1].min(), top[:, 1].max(); span = hi - lo
grips = [mathutils.Vector(top[top[:, 1] < lo + 0.2 * span].mean(0)), mathutils.Vector(top[top[:, 1] > hi - 0.2 * span].mean(0))]

wall = g("wall"); d = mathutils.Vector((*wall["dir"], 0)); n = mathutils.Vector((*wall["normal"], 0)); A = mathutils.Vector((*wall["a"], 0))
# yaw_off_deg：车身与墙成一定夹角（只有一端碰墙），侧倾才能在画面里看出来
yaw = math.atan2(d.y, d.x) + math.radians(g("yaw_off_deg", 0))
Mz = mathutils.Matrix.Rotation(yaw, 4, "Z")
# 侧倾：绕前进轴，车顶朝墙（-normal）
r = math.radians(abs(g("roll_deg", 12)))
bd = Mz.to_3x3() @ mathutils.Vector((1, 0, 0))
side = 1 if bd.cross(mathutils.Vector((0, 0, 1))).dot(-n) > 0 else -1
Mr = mathutils.Matrix.Rotation(side * r, 4, bd)
apply(Mr @ Mz); grips = [Mr @ Mz @ p for p in grips]
V = np.concatenate([v for _, v in verts()])
zmin = V[:, 2].min()
P = mathutils.Vector((*g("place"), 0))
T = mathutils.Matrix.Translation(P + n * 0.6 - mathutils.Vector((0, 0, zmin)))
apply(T); grips = [T @ p for p in grips]
# 平移到最靠墙的顶点刚好贴墙（留 3 mm）
best = None
for o, v in verts():
    w = (v[:, :2] - np.array(A[:2])) @ np.array(n[:2])
    i = int(w.argmin())
    if best is None or w[i] < best[0]: best = (float(w[i]), o.name, v[i].copy())
shift = -(best[0] - 0.003)
T2 = mathutils.Matrix.Translation(n * shift); apply(T2); grips = [T2 @ p for p in grips]
contact = mathutils.Vector(best[2]) + n * shift

for o in objs:
    for m in o.data.materials:
        if m and m.blend_method == "BLEND": m.blend_method = "HASHED"

def quad(name, pts):
    me = bpy.data.meshes.new(name); me.from_pydata(pts, [], [(0, 1, 2, 3)]); ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob); ob.is_shadow_catcher = True; return ob
floor = quad("floor", [(-40, -5, 0), (40, -5, 0), (40, 60, 0), (-40, 60, 0)])
wa, wb = A - d * 30, A + d * 30
wallo = quad("wall", [tuple(wa), tuple(wb), tuple(wb + mathutils.Vector((0, 0, 5))), tuple(wa + mathutils.Vector((0, 0, 5)))])

cam = bpy.data.cameras.new("cam"); cam.lens = g("lens_mm", 35); cam.sensor_width = 36; cam.sensor_fit = "HORIZONTAL"
co = bpy.data.objects.new("cam", cam); bpy.context.collection.objects.link(co)
co.location = (0, 0, g("cam_height", 0.8)); co.rotation_euler = (math.radians(90 - g("pitch_deg", 5)), 0, 0)
bpy.context.scene.camera = co

def kelvin_rgb(k):
    t = k / 100
    rr = 255 if t <= 66 else 329.7 * (t - 60) ** -0.1332
    gg = 99.47 * math.log(t) - 161.1 if t <= 66 else 288.1 * (t - 60) ** -0.0755
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5 * math.log(t - 10) - 305.0)
    return tuple(max(0, min(255, x)) / 255 for x in (rr, gg, b))
sd = bpy.data.lights.new("sun", "SUN"); sd.energy = g("sun_strength", 3.0); sd.color = kelvin_rgb(g("sun_kelvin", 3800)); sd.angle = math.radians(2)
so = bpy.data.objects.new("sun", sd); bpy.context.collection.objects.link(so)
saz, sel = math.radians(g("sun_az_deg", -60)), math.radians(g("sun_elev_deg", 20))
to_sun = mathutils.Vector((math.sin(saz) * math.cos(sel), math.cos(saz) * math.cos(sel), math.sin(sel)))
so.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
w = bpy.data.worlds.new("w"); bpy.context.scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.5, 0.5, 0.55, 1); bg.inputs[1].default_value = g("env_strength", 0.6)
env = g("env_image")
if env and os.path.exists(env):
    tex = w.node_tree.nodes.new("ShaderNodeTexEnvironment"); tex.image = bpy.data.images.load(env); tex.projection = "EQUIRECTANGULAR"
    w.node_tree.links.new(tex.outputs["Color"], bg.inputs["Color"])

s = bpy.context.scene
s.render.engine = "CYCLES"; s.cycles.samples = g("samples", 128); s.cycles.device = "CPU"; s.cycles.use_denoising = True
s.view_settings.view_transform = "AgX"; s.view_settings.exposure = g("exposure", 0.0)
s.render.resolution_x = g("width", 1600); s.render.resolution_y = g("height", 900)
s.render.film_transparent = True
s.render.image_settings.file_format = "PNG"; s.render.image_settings.color_mode = "RGBA"; s.render.image_settings.color_depth = "16"
s.render.filepath = g("out"); bpy.ops.render.render(write_still=True)
floor.hide_render = True; wallo.hide_render = True
s.cycles.samples = 16; s.render.filepath = g("out_mask", os.path.splitext(g("out"))[0] + "-mask.png"); bpy.ops.render.render(write_still=True)

from bpy_extras.object_utils import world_to_camera_view
rw, rh = s.render.resolution_x, s.render.resolution_y
px = lambda p: (lambda q: [q.x * rw, (1 - q.y) * rh])(world_to_camera_view(s, co, p))
V = np.concatenate([v for _, v in verts()])
wheel_z = float(V[:, 2].min())
print("SCENE_OK", json.dumps({"grips": [px(p) for p in grips], "contact": {"part": best[1], "px": px(contact), "world": list(contact)},
                              "roll_deg": math.degrees(r) * side, "yaw_deg": math.degrees(yaw), "wheel_z": wheel_z}))
