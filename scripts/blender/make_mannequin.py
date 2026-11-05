import bpy, sys
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
md = TargetService.get_default_macro_info_dict()
# MakeHuman 年龄：0 = 1 岁，0.1875 = 11 岁（线性）→ 3.5 岁 ≈ 0.047
md.update(gender=0.5, age=0.10, muscle=0.3, weight=0.55, height=0.5, cupsize=0.0, firmness=0.5)
md["race"] = {"caucasian": 0.8, "african": 0.1, "asian": 0.1}
bm = HumanService.create_human(scale=0.1, macro_detail_dict=md)
rig = HumanService.add_builtin_rig(bm, "default")
# 中性哑光灰人偶：AI 只照它的姿势画 Mia（穿着由提示词决定）
mt = bpy.data.materials.new("mannequin"); mt.use_nodes = True
b = mt.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (0.62, 0.6, 0.58, 1); b.inputs["Roughness"].default_value = 0.8
bm.data.materials.clear(); bm.data.materials.append(mt)
# 简单衣服：按骨骼权重分区上色（上衣 / 长裤），让 AI 读得出穿着，也不出现裸体人偶
def mat(name, rgb):
    m_ = bpy.data.materials.new(name); m_.use_nodes = True
    b_ = m_.node_tree.nodes["Principled BSDF"]; b_.inputs["Base Color"].default_value = (*rgb, 1); b_.inputs["Roughness"].default_value = 0.9
    bm.data.materials.append(m_)
mat("shirt", (0.72, 0.5, 0.12)); mat("pants", (0.07, 0.09, 0.22))
shirt = {"spine01", "spine02", "spine03", "spine04", "spine05", "clavicle.L", "clavicle.R", "shoulder01.L", "shoulder01.R",
         "upperarm01.L", "upperarm01.R", "upperarm02.L", "upperarm02.R", "breast.L", "breast.R", "nipple", "nippleTip"}
pants = {"root", "pelvis.L", "pelvis.R", "upperleg01.L", "upperleg01.R", "upperleg02.L", "upperleg02.R",
         "lowerleg01.L", "lowerleg01.R", "lowerleg02.L", "lowerleg02.R", "genitals"}
skip = {"HelperGeometry", "JointCubes", "Left", "Mid", "Right", "body"}
gi = {g_.index: g_.name for g_ in bm.vertex_groups}
cls = []
for v in bm.data.vertices:
    gs = [(gi[x.group], x.weight) for x in v.groups if gi[x.group] not in skip]
    top = max(gs, key=lambda t: t[1])[0] if gs else ""
    cls.append(1 if top in shirt else 2 if top in pants else 0)
for poly in bm.data.polygons:
    c_ = [cls[i] for i in poly.vertices]; poly.material_index = max(set(c_), key=c_.count)
print("MQ_CLOTH", sum(1 for p_ in bm.data.polygons if p_.material_index == 1), sum(1 for p_ in bm.data.polygons if p_.material_index == 2))
dg = bpy.context.evaluated_depsgraph_get(); ev = bm.evaluated_get(dg)
zs = [(ev.matrix_world @ v.co).z for v in ev.data.vertices]
print("MQ_HEIGHT", round(max(zs) - min(zs), 3), "bones", len(rig.data.bones))
print("MQ_BONES", [b.name for b in rig.data.bones if any(k in b.name for k in ("hand", "wrist", "foot", "pelvis", "root", "lowerarm"))][:20])
bpy.ops.wm.save_as_mainfile(filepath="/tmp/pd-cad/mq/child.blend")
