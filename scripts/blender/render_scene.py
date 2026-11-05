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
sys.stdout.reconfigure(line_buffering=True)
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
shift = 0 if g("free") else -(best[0] - 0.003)
T2 = mathutils.Matrix.Translation(n * shift); apply(T2); grips = [T2 @ p for p in grips]
contact = mathutils.Vector(best[2]) + n * shift

# 3D 人偶（MPFB / MakeHuman CC0）：IK 把手腕对到握把、脚对到地面、臀部对到座椅；AI 只照着它画人的外观
MQ = g("mannequin"); mq = []
if MQ:
    with bpy.data.libraries.load(MQ["blend"]) as (src, dst): dst.objects = list(src.objects)
    for o in dst.objects: bpy.context.collection.objects.link(o)
    mq = [o for o in dst.objects if o.type == "MESH"]
    mrig = next(o for o in dst.objects if o.type == "ARMATURE"); pb = mrig.pose.bones; V3 = mathutils.Vector
    W = lambda b_, tail=False: mrig.matrix_world @ (pb[b_].tail if tail else pb[b_].head)
    def ik(bone, tgt, chain, pole=None, pole_deg=-90):
        e = bpy.data.objects.new("ik_" + bone, None); bpy.context.collection.objects.link(e); e.location = tgt
        c = pb[bone].constraints.new("IK"); c.target = e; c.chain_count = chain
        if pole is not None:
            q = bpy.data.objects.new("pole_" + bone, None); bpy.context.collection.objects.link(q); q.location = pole
            c.pole_target = q; c.pole_angle = math.radians(pole_deg)
    gm = (grips[0] + grips[1]) / 2
    Vb = np.concatenate([v for _, v in verts()]); cen = V3(Vb.mean(0))
    # 车头方向：握把在车头一侧
    bf = bd if (gm - cen).dot(bd) > 0 else -bd
    pose = MQ.get("pose", "stand")
    fwd = -n if MQ.get("face_wall") else bf
    # MPFB 人体正面朝 -Y
    mrig.location = (0, 0, 0); mrig.rotation_euler = (0, 0, math.atan2(fwd.y, fwd.x) + math.pi / 2)
    bpy.context.view_layer.update()
    left = mrig.matrix_world.to_3x3() @ V3((1, 0, 0))
    if pose == "ride":
        # 骑姿：臀部坐在座椅顶，两脚分开踩在车两侧地面，上身前倾，双手握把
        rear = Vb[((Vb[:, :2] - np.array(cen[:2])) @ np.array(bf[:2])) < 0]
        st = V3(rear[rear[:, 2].argmax()])
        hip0 = (W("upperleg01.L") + W("upperleg01.R")) / 2; ank0 = W("foot.L").z
        hip = st - bf * MQ.get("seat_back", 0.02) + V3((0, 0, MQ.get("hip_above_seat", 0.07)))
        mrig.location = hip - hip0; bpy.context.view_layer.update()
        neck0 = W("neck01").dot(fwd); lean = math.radians(MQ.get("lean_deg", 20)) / 3
        for b_ in ("spine01", "spine02", "spine03"): pb[b_].rotation_mode = "XYZ"; pb[b_].rotation_euler.x = lean
        bpy.context.view_layer.update()
        if W("neck01").dot(fwd) < neck0:
            for b_ in ("spine01", "spine02", "spine03"): pb[b_].rotation_euler.x = -lean
            bpy.context.view_layer.update()
        targets = {}
        for s_, sg in (("L", 1), ("R", -1)):
            ft = V3((hip.x, hip.y, ank0)) + left * sg * MQ.get("stance", 0.13) + bf * MQ.get("foot_fwd", 0.1)
            ik(f"lowerleg02.{s_}", ft, 4, pole=hip + fwd * 0.6 + left * sg * 0.15, pole_deg=MQ.get("knee_pole_deg", -90)); targets[f"lowerleg02.{s_}"] = ft
    else:
        # 站姿：站在车把后面、紧贴车架外侧（离墙那侧）
        off = MQ.get("offset", [-0.18, 0.11])
        al = (Vb[:, :2] - np.array(gm[:2])) @ np.array(bf[:2])
        near = Vb[np.abs(al - off[0]) < 0.08]
        edge = float(((near[:, :2] - np.array(gm[:2])) @ np.array(n[:2])).max())
        mrig.location = V3((gm.x, gm.y, 0)) + bf * off[0] + n * (edge + off[1]); bpy.context.view_layer.update()
        targets = {}
    base = mrig.location.copy()
    gl, gr = sorted(grips, key=lambda p_: -(p_ - base).dot(left))
    for s_, gp, sg in (("L", gl, 1), ("R", gr, -1)):
        # 手腕在握把后上方一点，手掌才包住握把
        t = gp - fwd * MQ.get("wrist_back", 0.04) + V3((0, 0, 0.02))
        sh = W(f"upperarm01.{s_}")
        ik(f"lowerarm02.{s_}", t, MQ.get("chain", 4), pole=sh - fwd * 0.25 + left * sg * 0.25 - V3((0, 0, 0.15)), pole_deg=MQ.get("pole_deg", -90))
        targets[f"lowerarm02.{s_}"] = t
    # 手指弯过来包住握把（拇指弯得少一点）
    curl = math.radians(MQ.get("curl_deg", 55)) * MQ.get("curl_sign", 1)
    for s_ in ("L", "R"):
        for f in range(1, 6):
            for j in (1, 2, 3):
                fb = pb.get(f"finger{f}-{j}.{s_}")
                if fb: fb.rotation_mode = "XYZ"; fb.rotation_euler.x = curl * (0.4 if f == 1 else 1)
    bpy.context.view_layer.update()
    print("MQ_REACH_MM", {k: round((W(k, True) - t).length * 1000) for k, t in targets.items()})

# 轮毂外圈的黑塑料太光滑会反射亮墙，在轮胎内侧形成一圈假白边（真车是哑光黑）
_mr = {"plastic_black": 0.75, "rubber": 0.9, **g("mat_rough", {})}
for o in objs:
    for m in o.data.materials:
        if m and m.blend_method == "BLEND": m.blend_method = "HASHED"
        _b = m.node_tree.nodes.get("Principled BSDF") if m and m.use_nodes else None
        if _b and m.name in _mr: _b.inputs["Roughness"].default_value = _mr[m.name]

def quad(name, pts):
    me = bpy.data.meshes.new(name); me.from_pydata(pts, [], [(0, 1, 2, 3)]); ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob); ob.is_shadow_catcher = True; return ob
floor = quad("floor", [(-40, -5, 0), (40, -5, 0), (40, 60, 0), (-40, 60, 0)])
wa, wb = A - d * 30, A + d * 30
wallo = quad("wall", [tuple(wa), tuple(wb), tuple(wb + mathutils.Vector((0, 0, 5))), tuple(wa + mathutils.Vector((0, 0, 5)))])

# set：整个布景在 3D 里搭（相机看 +Y，后墙在 y=wall.a.y），不再从照片估透视。北美车库：石膏板墙 + 混凝土墙基 + 水泥地 + 左侧开着的车库门
ST = g("set")
setobjs = []
if ST:
    floor.hide_render = True; wallo.hide_render = True
    def mat(name, col, rough, noise=0.0, scale=8.0):
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
        b.inputs["Roughness"].default_value = rough
        if noise:
            tx = nt.nodes.new("ShaderNodeTexNoise"); tx.inputs["Scale"].default_value = scale; tx.inputs["Detail"].default_value = 8
            mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"
            mx.inputs[6].default_value = (*[c * (1 - noise) for c in col], 1); mx.inputs[7].default_value = (*[min(1, c * (1 + noise)) for c in col], 1)
            nt.links.new(tx.outputs["Fac"], mx.inputs[0]); nt.links.new(mx.outputs[2], b.inputs["Base Color"])
        else:
            b.inputs["Base Color"].default_value = (*col, 1)
        return m
    def box(name, lo, hi, m):
        bpy.ops.mesh.primitive_cube_add(location=[(a + b) / 2 for a, b in zip(lo, hi)])
        ob = bpy.context.active_object; ob.name = name; ob.scale = [(b - a) / 2 for a, b in zip(lo, hi)]
        ob.data.materials.append(m); setobjs.append(ob); return ob
    D = A.y; Wd = ST.get("width", 6.0); Hc = ST.get("ceiling", 2.7); Dp = ST.get("depth", 6.5); hx = Wd / 2
    drywall = mat("drywall", ST.get("wall_rgb", (0.62, 0.58, 0.52)), 0.85, 0.04, 30)
    concrete = mat("concrete", (0.42, 0.40, 0.37), 0.7, 0.18, 6)
    stem = mat("stem", (0.48, 0.46, 0.42), 0.9, 0.22, 12)
    trim = mat("trim", (0.8, 0.78, 0.74), 0.5)
    box("floor_s", (-hx - 1, D - Dp - 3, -0.1), (hx + 1, D + 0.2, 0), concrete)
    box("back", (-hx, D, 0), (hx, D + 0.12, Hc), drywall)
    box("stemwall", (-hx, D - 0.002, 0), (hx, D, ST.get("stem_h", 0.4)), stem)
    box("ceiling", (-hx - 0.2, D - Dp, Hc), (hx + 0.2, D + 0.12, Hc + 0.1), drywall)
    box("right", (hx, D - Dp, 0), (hx + 0.12, D + 0.12, Hc), drywall)
    # 左墙：中间开一个车库门洞（晨光从这里进来）
    o0, o1, oh = D - ST.get("open_from", 4.8), D - ST.get("open_to", 0.9), ST.get("open_h", 2.1)
    box("left_a", (-hx - 0.12, D - Dp, 0), (-hx, o0, Hc), drywall)
    box("left_b", (-hx - 0.12, o1, 0), (-hx, D + 0.12, Hc), drywall)
    box("left_top", (-hx - 0.12, o0, oh), (-hx, o1, Hc), drywall)
    box("jamb", (-hx - 0.02, o1 - 0.1, 0), (-hx + 0.04, o1, oh), trim)
    # 透视参照：石膏板接缝（每 1.22 m 一条竖缝）+ 后墙上的金属架。斜看时墙面只剩一片光墙，AI 会按熟悉构图重画、改掉机位
    seam = mat("seam", (0.5, 0.47, 0.42), 0.9)
    for sx in ST.get("seams", [-2.44, -1.22, 1.22, 2.44]):
        box(f"seam{sx}", (sx - 0.015, D - 0.004, ST.get("stem_h", 0.4)), (sx + 0.015, D, Hc), seam)
    if ST.get("shelf", True):
        metal = mat("metal", (0.25, 0.26, 0.27), 0.45)
        s0, s1 = ST.get("shelf_x", (1.1, 2.3))
        for px_ in (s0, s1):
            for py_ in (D - 0.45, D - 0.03):
                box(f"post{px_}{py_}", (px_ - 0.02, py_ - 0.02, 0), (px_ + 0.02, py_ + 0.02, 1.8), metal)
        for hz in (0.15, 0.75, 1.3, 1.78):
            box(f"shelf{hz}", (s0, D - 0.47, hz), (s1, D - 0.01, hz + 0.025), metal)
    # 右墙边进屋的门（只是道具，保证北美车库的识别度）
    box("door", (hx - 0.03, D - 1.6, 0), (hx, D - 0.75, 2.03), trim)
    box("drive", (-hx - 12, D - Dp - 3, -0.1), (-hx - 1, D + 6, -0.02), concrete)
    lawn = mat("lawn", (0.18, 0.26, 0.08), 0.9, 0.3, 3)
    box("lawn", (-hx - 30, D - Dp - 10, -0.12), (-hx - 12, D + 20, -0.03), lawn)

cam = bpy.data.cameras.new("cam"); cam.lens = g("lens_mm", 35); cam.sensor_width = 36; cam.sensor_fit = "HORIZONTAL"
co = bpy.data.objects.new("cam", cam); bpy.context.collection.objects.link(co)
co.location = (0, 0, g("cam_height", 0.8)); co.rotation_euler = (math.radians(90 - g("pitch_deg", 5)), 0, 0)
# 斜 45° 左右看墙（cam_pos + look_at）：只有沿墙方向斜看，车向墙的侧倾和车把碰墙才看得出来
if g("cam_pos") and g("look_at"):
    co.location = g("cam_pos"); co.rotation_euler = (mathutils.Vector(g("look_at")) - co.location).to_track_quat("-Z", "Y").to_euler()
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
if ST:
    bg.inputs[0].default_value = (*ST.get("sky_rgb", (0.55, 0.7, 1.0)), 1); bg.inputs[1].default_value = ST.get("sky_strength", 1.2)
elif env and os.path.exists(env):
    tex = w.node_tree.nodes.new("ShaderNodeTexEnvironment"); tex.image = bpy.data.images.load(env); tex.projection = "EQUIRECTANGULAR"
    w.node_tree.links.new(tex.outputs["Color"], bg.inputs["Color"])
# 顶部柔光：在地面和墙上投出车下方的柔和接触阴影（墙角的环境遮蔽）
cl = g("contact_light", 0)
if cl:
    al = bpy.data.lights.new("contact", "AREA"); al.energy = cl; al.size = g("contact_size", 1.2); al.color = (1, 0.96, 0.9)
    ao = bpy.data.objects.new("contact", al); bpy.context.collection.objects.link(ao)
    ao.location = (P.x + n.x * 0.5, P.y + n.y * 0.5, 2.2)

s = bpy.context.scene
s.render.engine = "CYCLES"; s.cycles.samples = g("samples", 128); s.cycles.device = "CPU"; s.cycles.use_denoising = True
s.view_settings.view_transform = "AgX"; s.view_settings.exposure = g("exposure", 0.0)
s.render.resolution_x = g("width", 1600); s.render.resolution_y = g("height", 900)
s.render.film_transparent = not ST
s.render.image_settings.file_format = "PNG"; s.render.image_settings.color_mode = "RGBA"; s.render.image_settings.color_depth = "16"
s.render.filepath = g("out"); bpy.ops.render.render(write_still=True)
if ST and g("out_plate"):
    # 同一布景、车对相机不可见但保留投影和反射：用来填掉 AI 图里露在真车外的 AI 车（重影）
    for o in objs: o.visible_camera = False
    s.render.filepath = g("out_plate"); bpy.ops.render.render(write_still=True)
    if g("out_depth"):
        # 无车布景的深度图（近白远黑）：给 ControlNet 锁墙、地面和透视，不用从图里估
        bpy.context.view_layer.use_pass_z = True
        s.use_nodes = True; nt = s.node_tree
        for nd in list(nt.nodes): nt.nodes.remove(nd)
        rl = nt.nodes.new("CompositorNodeRLayers"); nz = nt.nodes.new("CompositorNodeNormalize")
        iv = nt.nodes.new("CompositorNodeInvert"); oc = nt.nodes.new("CompositorNodeComposite")
        nt.links.new(rl.outputs["Depth"], nz.inputs[0]); nt.links.new(nz.outputs[0], iv.inputs["Color"]); nt.links.new(iv.outputs[0], oc.inputs["Image"])
        vt, ex, sp = s.view_settings.view_transform, s.view_settings.exposure, s.cycles.samples
        s.view_settings.view_transform = "Standard"; s.view_settings.exposure = 0; s.cycles.samples = 1
        s.render.filepath = g("out_depth"); bpy.ops.render.render(write_still=True)
        s.view_settings.view_transform, s.view_settings.exposure, s.cycles.samples = vt, ex, sp
        s.use_nodes = False
    for o in objs: o.visible_camera = True
floor.hide_render = True; wallo.hide_render = True
for ob in setobjs: ob.hide_render = True
s.render.film_transparent = True
# 车的遮罩扣掉人偶挡住的部分（手在握把前面）
for o in mq: o.is_holdout = True
s.cycles.samples = 16; s.render.filepath = g("out_mask", os.path.splitext(g("out"))[0] + "-mask.png"); bpy.ops.render.render(write_still=True)
if mq and g("out_mq_mask"):
    for o in objs: o.hide_render = True
    for o in mq: o.is_holdout = False
    s.render.filepath = g("out_mq_mask"); bpy.ops.render.render(write_still=True)
    for o in objs: o.hide_render = False

from bpy_extras.object_utils import world_to_camera_view
rw, rh = s.render.resolution_x, s.render.resolution_y
px = lambda p: (lambda q: [q.x * rw, (1 - q.y) * rh])(world_to_camera_view(s, co, p))
V = np.concatenate([v for _, v in verts()])
wheel_z = float(V[:, 2].min())
print("SCENE_OK", json.dumps({"grips": [px(p) for p in grips], "contact": {"part": best[1], "px": px(contact), "world": list(contact)},
                              "roll_deg": math.degrees(r) * side, "yaw_deg": math.degrees(yaw), "wheel_z": wheel_z}))
