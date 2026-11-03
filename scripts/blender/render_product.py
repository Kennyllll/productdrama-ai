"""Render a textured product GLB with Blender (background mode).
usage: blender -b -noaudio --python render_product.py -- <spec.json>
spec: {glb, out, width, height, azimuth_deg, elevation_deg, distance_m|null, lens_mm, target_height_frac,
       key_dir_deg, key_elev_deg, key_kelvin, key_strength, fill_strength, env_strength, transparent, samples, engine}
Writes: out (RGBA PNG, product + contact shadow on transparent background) and out_mask (product-only alpha).
"""
import bpy, json, math, sys, os, mathutils
spec = json.load(open(sys.argv[sys.argv.index("--") + 1]))
g = lambda k, d=None: spec.get(k, d)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=g("glb"))
objs = [o for o in bpy.data.objects if o.type == "MESH"]
mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
for o in objs:
    for v in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(v)
        mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
size = max(mx - mn); center = (mn + mx) / 2
# unit guess: if model is > 50 units tall it is in mm
if size > 50:
    for o in objs: o.scale = (0.001,) * 3
    bpy.context.view_layer.update(); mn *= 0.001; mx *= 0.001; size *= 0.001; center *= 0.001
shift = mathutils.Vector((center.x, center.y, mn.z))
for o in objs: o.location -= shift
mn -= shift; mx -= shift; center -= shift
yaw = math.radians(g("yaw_deg", 0))
for o in objs: o.rotation_euler.z += yaw
# 产品姿态：roll_deg 绕前进轴侧倾（靠在物体上 / 倒地），pitch_deg 绕横轴（上坡 / 下坡）
roll = math.radians(g("roll_deg", 0)); pitch = math.radians(g("pitch_deg", 0))
if roll or pitch:
    R = mathutils.Euler((roll, pitch, 0), "XYZ").to_matrix().to_4x4()
    for o in objs: o.matrix_world = R @ o.matrix_world
    bpy.context.view_layer.update()
    zmin = min((o.matrix_world @ mathutils.Vector(v)).z for o in objs for v in o.bound_box)
    for o in objs: o.location.z -= zmin
    bpy.context.view_layer.update()
    mn = mathutils.Vector((1e9,) * 3); mx = mathutils.Vector((-1e9,) * 3)
    for o in objs:
        for v in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(v)
            mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
    center = (mn + mx) / 2

for o in objs:
    for m in o.data.materials:
        if m and m.blend_method == "BLEND": m.blend_method = "HASHED"

# shadow catcher floor
bpy.ops.mesh.primitive_plane_add(size=size * 30, location=(0, 0, 0)); floor = bpy.context.object
floor.is_shadow_catcher = True

# camera: orbit around the target point
az = math.radians(g("azimuth_deg", -35)); el = math.radians(g("elevation_deg", 12))
tgt = mathutils.Vector((0, 0, (mx.z - mn.z) * g("target_height_frac", 0.42)))
lens = g("lens_mm", 50)
dist = g("distance_m") or size * 2.3 * (lens / 50) ** 0.9
el = max(el, math.asin(max(-1.0, min(1.0, (size * 0.02 - tgt.z) / dist))))  # 相机不能低于地面，否则地面会挡住产品
loc = tgt + mathutils.Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el))) * dist
cam = bpy.data.cameras.new("cam"); cam.lens = lens; cam.sensor_width = 36
co = bpy.data.objects.new("cam", cam); bpy.context.collection.objects.link(co)
co.location = loc; co.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = co

# lights
def light(name, t, loc, energy, color=(1, 1, 1), lsize=None):
    ld = bpy.data.lights.new(name, t); ld.energy = energy; ld.color = color
    if t == "AREA": ld.size = lsize or size
    if t == "SUN": ld.angle = math.radians(3)
    lo = bpy.data.objects.new(name, ld); bpy.context.collection.objects.link(lo); lo.location = loc
    lo.rotation_euler = (tgt - mathutils.Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return lo

def kelvin_rgb(k):
    t = k / 100
    r = 255 if t <= 66 else 329.7 * (t - 60) ** -0.1332
    gg = 99.47 * math.log(t) - 161.1 if t <= 66 else 288.1 * (t - 60) ** -0.0755
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5 * math.log(t - 10) - 305.0)
    return tuple(max(0, min(255, c)) / 255 for c in (r, gg, b))

kd = math.radians(g("key_dir_deg", -60)); ke = math.radians(g("key_elev_deg", 40))
kc = kelvin_rgb(g("key_kelvin", 5200))
light("key", "SUN", (math.sin(kd) * 5, -math.cos(kd) * 5, math.tan(ke) * 5), g("key_strength", 3.0), kc)
light("fill", "AREA", (-math.sin(kd) * size * 2.5, -size * 2.5, size * 1.5), g("fill_strength", 60) * size, (1, 1, 1), size * 2.5)
light("rim", "AREA", (0, size * 2.5, size * 2.2), g("rim_strength", 80) * size, (1, 1, 1), size)
# 电影轮廓灯：相机对面左右各一盏低位面光，只勾产品边缘（不投影到地面阴影捕捉）
cr = g("cine_rim", 0)
if cr:
    rc = kelvin_rgb(g("cine_rim_kelvin", 2800))
    for side in (-1, 1):
        a = az + math.pi + side * math.radians(g("cine_rim_spread_deg", 14))
        pos = (tgt.x + math.sin(a) * size * 2.2, tgt.y - math.cos(a) * size * 2.2, tgt.z + size * 0.55)
        lo = light(f"cine_rim_{side}", "SPOT", pos, cr * 260 * size, rc)
        lo.data.spot_size = math.radians(25); lo.data.spot_blend = 0.6; lo.data.shadow_soft_size = size * 0.05
        lo.visible_shadow = False
w = bpy.data.worlds.new("w"); bpy.context.scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (*g("env_color", (0.6, 0.65, 0.75)), 1); bg.inputs[1].default_value = g("env_strength", 0.5)
env_image = g("env_image")
if env_image and os.path.exists(env_image):
    # 用空场景图当环境光：等距柱状投影近似，色温 / 亮度 / 大致方向跟场景一致
    img = bpy.data.images.load(env_image)
    tex = w.node_tree.nodes.new("ShaderNodeTexEnvironment"); tex.image = img; tex.projection = "EQUIRECTANGULAR"
    mp = w.node_tree.nodes.new("ShaderNodeMapping"); tc = w.node_tree.nodes.new("ShaderNodeTexCoord")
    # 让图片中心对着相机背后（相机看到的方向 = 场景深处），即产品被"场景"包围
    mp.inputs["Rotation"].default_value = (0, 0, az + math.pi)
    w.node_tree.links.new(tc.outputs["Generated"], mp.inputs["Vector"]); w.node_tree.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
    w.node_tree.links.new(tex.outputs["Color"], bg.inputs["Color"])
    bg.inputs[1].default_value = g("env_strength", 1.0)
    # 场景提供环境光后，主光只做补充
    for lo in bpy.data.objects:
        if lo.type == "LIGHT": lo.data.energy *= g("key_mix", 0.25)
s = bpy.context.scene
s.view_settings.exposure = g("exposure", 0.0)

s.render.engine = "CYCLES"; s.cycles.samples = g("samples", 128); s.cycles.device = "CPU"; s.cycles.use_denoising = True
s.view_settings.view_transform = g("view_transform", "AgX")
s.render.resolution_x = g("width", 1600); s.render.resolution_y = g("height", 900)
s.render.film_transparent = True
s.render.image_settings.file_format = "PNG"; s.render.image_settings.color_mode = "RGBA"; s.render.image_settings.color_depth = "16"
s.render.filepath = g("out")
bpy.ops.render.render(write_still=True)
# product-only mask (no shadow)
floor.hide_render = True
s.cycles.samples = 16; s.render.filepath = g("out_mask", os.path.splitext(g("out"))[0] + "-mask.png")
bpy.ops.render.render(write_still=True)
# 地面倒影层：地面改为有粗糙度的镜面，只反射产品（不反射环境和灯），产品本身对相机不可见
refl_out = g("out_refl", os.path.splitext(g("out"))[0] + "-refl.png")
floor.hide_render = False; floor.is_shadow_catcher = False
fm = bpy.data.materials.new("mirror"); fm.use_nodes = True
nt = fm.node_tree; nt.nodes.clear(); outn = nt.nodes.new("ShaderNodeOutputMaterial"); gl = nt.nodes.new("ShaderNodeBsdfGlossy")
gl.inputs["Roughness"].default_value = g("floor_roughness", 0.12); gl.inputs["Color"].default_value = (1, 1, 1, 1)
nt.links.new(gl.outputs["BSDF"], outn.inputs["Surface"]); floor.data.materials.append(fm)
for o in objs: o.visible_camera = False
for lo in bpy.data.objects:
    if lo.type == "LIGHT": lo.visible_glossy = False
w.cycles_visibility.glossy = False
s.cycles.samples = max(32, g("samples", 128) // 2); s.render.filepath = refl_out
bpy.ops.render.render(write_still=True)
print("RENDER_OK", json.dumps({"camera": list(loc), "target": list(tgt), "lens": lens, "size_m": size}))
