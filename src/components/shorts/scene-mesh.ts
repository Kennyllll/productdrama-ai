// 场地物件 → three.js 网格：按类别拼出家具形状（不是方块），让 3D 构图一眼看得出是什么，AI 也更照着摆。
import * as THREE from "three";
import type { SceneItem } from "@/lib/shorts-scenes";
import { figureDims as dims, KB002_RIG, presetPose, rideOf, type FigureKind, type FigurePose, type P3, type PoseTargets, type RideRig } from "@/lib/figures";

export { presetPose };

const mat = (rgb: [number, number, number], k = 1, opacity = 1) =>
  new THREE.MeshLambertMaterial({ color: new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k), transparent: opacity < 1, opacity });

/** 在物件本地坐标（x 宽、y 高、z 深，原点在底面中心）放一个方块 */
function part(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005)), m);
  b.position.set(x, y + h / 2, z);
  g.add(b);
  return b;
}
function cyl(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, r0: number, r1: number, h: number, seg = 16) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg), m);
  c.position.set(x, y + h / 2, z);
  g.add(c);
  return c;
}
function ball(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, r: number, sy = 1) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
  s.scale.y = sy;
  s.position.set(x, y, z);
  g.add(s);
  return s;
}

export function shape(i: SceneItem): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = i;
  const m = mat(i.rgb);
  const dark = mat(i.rgb, 0.7);
  const wood = mat([0.45, 0.32, 0.2]);
  const back = -d / 2;
  switch (i.type) {
    case "sofa":
    case "armchair": {
      const arm = Math.min(0.2, w * 0.15);
      part(g, m, 0, 0, 0.05, w - 2 * arm, h * 0.5, d * 0.8);
      part(g, m, 0, 0, back + d * 0.12, w, h, d * 0.24);
      part(g, m, -w / 2 + arm / 2, 0, 0, arm, h * 0.7, d);
      part(g, m, w / 2 - arm / 2, 0, 0, arm, h * 0.7, d);
      break;
    }
    case "coffee_table":
    case "table":
    case "bench": {
      const t = Math.min(0.05, h * 0.12);
      part(g, i.type === "bench" ? m : m, 0, h - t, 0, w, t, d);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, dark, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.05, h - t, 0.05);
      break;
    }
    case "chair":
      part(g, m, 0, h * 0.5, 0, w, 0.04, d);
      part(g, m, 0, h * 0.5, back + 0.02, w, h * 0.5, 0.04);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, dark, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), 0.04, h * 0.5, 0.04);
      break;
    case "tv_stand":
      part(g, m, 0, 0, 0, w, h * 0.4, d);
      part(g, mat([0.05, 0.05, 0.06]), 0, h * 0.45, back + 0.06, w * 0.8, h * 0.55, 0.05);
      break;
    case "shelf":
      part(g, m, 0, 0, back + 0.01, w, h, 0.02);
      for (const sx of [-1, 1]) part(g, m, sx * (w / 2 - 0.015), 0, 0, 0.03, h, d);
      for (let k = 0; k <= 4; k++) part(g, m, 0, (h - 0.03) * (k / 4), 0, w, 0.03, d);
      for (let k = 0; k < 4; k++) part(g, mat([0.3 + 0.15 * (k % 3), 0.4, 0.55 - 0.1 * k]), -w / 4 + (k % 2) * 0.2, (h / 4) * k + 0.03, 0, 0.25, h / 4 - 0.1, d * 0.8);
      break;
    case "bed":
      part(g, wood, 0, 0, 0, w, h * 0.45, d);
      part(g, m, 0, h * 0.45, 0, w * 0.96, h * 0.4, d * 0.96);
      part(g, mat([1, 1, 1]), 0, h * 0.85, back + 0.25, w * 0.7, 0.12, 0.35);
      part(g, wood, 0, 0, back + 0.03, w, h * 1.8, 0.06);
      break;
    case "window": {
      const f = mat([0.95, 0.95, 0.95]);
      part(g, mat(i.rgb, 1, 0.55), 0, 0, 0, w, h, d * 0.3);
      part(g, f, 0, 0, 0, w, 0.06, d);
      part(g, f, 0, h - 0.06, 0, w, 0.06, d);
      part(g, f, -w / 2 + 0.03, 0, 0, 0.06, h, d);
      part(g, f, w / 2 - 0.03, 0, 0, 0.06, h, d);
      part(g, f, 0, 0, 0, 0.04, h, d);
      break;
    }
    case "door":
      part(g, m, 0, 0, 0, w, h, d);
      ball(g, mat([0.7, 0.6, 0.3]), w * 0.38, h * 0.47, d / 2 + 0.03, 0.035);
      break;
    case "garage_door":
      for (let k = 0; k < 4; k++) part(g, k % 2 ? m : mat(i.rgb, 0.92), 0, (h / 4) * k, 0, w, h / 4, d);
      break;
    case "stairs": {
      const n = Math.max(4, Math.round(h / 0.18));
      for (let k = 0; k < n; k++) part(g, m, 0, 0, -d / 2 + (d / n) * (k + 0.5), w, (h / n) * (k + 1), d / n);
      break;
    }
    case "lamp":
      cyl(g, dark, 0, 0, 0, w * 0.4, w * 0.4, 0.03);
      cyl(g, dark, 0, 0, 0, 0.015, 0.015, h * 0.8, 8);
      cyl(g, m, 0, h * 0.75, 0, w * 0.5, w * 0.3, h * 0.25);
      break;
    case "plant":
    case "bush":
      if (i.type === "plant") cyl(g, mat([0.75, 0.55, 0.4]), 0, 0, 0, w * 0.25, w * 0.32, h * 0.3);
      ball(g, m, 0, i.type === "plant" ? h * 0.65 : h / 2, 0, Math.min(w, d) / 2, (i.type === "plant" ? h * 0.7 : h) / Math.min(w, d));
      break;
    case "tree":
      cyl(g, mat([0.4, 0.28, 0.18]), 0, 0, 0, w * 0.08, w * 0.06, h * 0.45, 10);
      ball(g, m, 0, h * 0.65, 0, w / 2, (h * 0.7) / w);
      break;
    case "xmas_tree": {
      cyl(g, mat([0.4, 0.28, 0.18]), 0, 0, 0, 0.06, 0.06, h * 0.15, 10);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry((w / 2) * (1 - k * 0.25), h * 0.45, 16), m);
        c.position.set(0, h * (0.15 + k * 0.25) + h * 0.225, 0);
        g.add(c);
      }
      for (let k = 0; k < 10; k++) ball(g, mat(k % 2 ? [0.9, 0.15, 0.15] : [0.95, 0.8, 0.2]), Math.cos(k * 2.4) * w * 0.3 * (1 - k / 14), h * (0.25 + k * 0.06), Math.sin(k * 2.4) * w * 0.3 * (1 - k / 14), 0.04);
      ball(g, mat([1, 0.85, 0.2]), 0, h, 0, 0.07);
      break;
    }
    case "gift":
    case "egg":
      part(g, m, 0, 0, 0, w, h, d);
      part(g, mat([0.95, 0.85, 0.3]), 0, 0, 0, w + 0.01, h + 0.01, 0.04);
      part(g, mat([0.95, 0.85, 0.3]), 0, 0, 0, 0.04, h + 0.01, d + 0.01);
      break;
    case "pumpkin":
      ball(g, m, 0, h / 2, 0, w / 2, h / w);
      cyl(g, mat([0.3, 0.45, 0.2]), 0, h * 0.9, 0, 0.02, 0.02, 0.08, 6);
      break;
    case "lantern":
      ball(g, m, 0, h / 2, 0, w / 2, h / w);
      cyl(g, mat([0.9, 0.75, 0.2]), 0, 0, 0, w * 0.2, w * 0.2, 0.05);
      cyl(g, mat([0.9, 0.75, 0.2]), 0, h - 0.05, 0, w * 0.2, w * 0.2, 0.05);
      break;
    case "balloon":
      ball(g, m, 0, h * 0.6, 0, w / 2, 1.2);
      cyl(g, mat([0.9, 0.9, 0.9]), 0, -0.6, 0, 0.004, 0.004, 0.8, 4);
      break;
    case "cake":
      cyl(g, m, 0, 0, 0, w / 2, w / 2, h * 0.7, 24);
      for (let k = 0; k < 5; k++) cyl(g, mat([0.9, 0.5, 0.6]), Math.cos(k * 1.26) * w * 0.3, h * 0.7, Math.sin(k * 1.26) * w * 0.3, 0.008, 0.008, h * 0.3, 6);
      break;
    case "kitchen":
      part(g, m, 0, 0, 0, w, h - 0.04, d);
      part(g, mat([0.35, 0.35, 0.38]), 0, h - 0.04, 0, w, 0.04, d);
      part(g, m, 0, h + 0.5, back + 0.17, w, 0.7, 0.34);
      break;
    case "fireplace":
      part(g, m, 0, 0, 0, w, h, d);
      part(g, mat([0.1, 0.08, 0.07]), 0, 0.05, d / 2 - 0.05, w * 0.5, h * 0.5, 0.1);
      part(g, m, 0, h, 0, w * 1.1, 0.06, d * 1.15);
      break;
    case "car":
      part(g, m, 0, 0.25, 0, w, h * 0.45, d);
      part(g, mat([0.55, 0.65, 0.75], 1, 0.8), 0, 0.25 + h * 0.45, -d * 0.05, w * 0.9, h * 0.38, d * 0.5);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 16), mat([0.08, 0.08, 0.08]));
        t.rotation.z = Math.PI / 2;
        t.position.set(sx * (w / 2 - 0.1), 0.33, sz * d * 0.32);
        g.add(t);
      }
      break;
    case "house":
      part(g, m, 0, 0, 0, w, h, d);
      for (const sx of [-0.3, 0.3]) part(g, mat([0.75, 0.85, 0.95]), sx * w, h * 0.35, d / 2 + 0.02, 1.2, 1.2, 0.04);
      {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2, 1.6, 4), mat([0.35, 0.3, 0.3]));
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(w / Math.hypot(w, d) * 1.45, 1, d / Math.hypot(w, d) * 1.45);
        roof.position.set(0, h + 0.8, 0);
        g.add(roof);
      }
      break;
    case "fence":
      part(g, m, 0, h * 0.7, 0, w, 0.06, d);
      part(g, m, 0, h * 0.3, 0, w, 0.06, d);
      for (let x = -w / 2; x <= w / 2 + 1e-6; x += 0.25) part(g, m, x, 0, 0, 0.07, h, d);
      break;
    case "toy":
      part(g, m, 0, 0.06, 0, w, h * 0.5, d * 0.6);
      for (const sx of [-1, 1]) ball(g, mat([0.1, 0.1, 0.1]), sx * w * 0.35, 0.06, d * 0.3, 0.06);
      ball(g, mat([0.7, 0.5, 0.3]), -w * 1.2, h * 0.5, 0, h * 0.45);
      break;
    default:
      part(g, m, 0, 0, 0, w, h, d);
  }
  return g;
}

/** 物件组：Blender 坐标（x 东、y 北、z 上）→ three.js（y 上、z 南） */
export function buildScene(items: SceneItem[]): THREE.Group {
  const root = new THREE.Group();
  for (const i of items) {
    const g = shape(i);
    g.position.set(i.x, i.z, -i.y);
    g.rotation.y = (i.yaw * Math.PI) / 180;
    g.userData.itemId = i.id;
    root.add(g);
  }
  return root;
}

export type { FigureKind, FigurePose, P3, PoseTargets, RideRig } from "@/lib/figures";
export const KB002_RIDE: RideRig = rideOf(KB002_RIG);
export const KB002_SEAT_BACK = KB002_RIG.seatBack;


const V = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);

/** 两节肢体（大腿+小腿 / 上臂+前臂）：给定根部和末端，按 hint 方向弯出中间关节；够不着时伸直指向目标 */
function bend(a: THREE.Vector3, c: THREE.Vector3, l1: number, l2: number, hint: THREE.Vector3) {
  const ac = c.clone().sub(a);
  const dist = Math.max(1e-4, Math.min(ac.length(), l1 + l2 - 1e-4));
  const dir = ac.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const perp = hint.clone().addScaledVector(dir, -hint.dot(dir)).normalize();
  return { mid: a.clone().addScaledVector(dir, x).addScaledVector(perp, h), end: a.clone().addScaledVector(dir, dist) };
}

function tube(g: THREE.Group, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, joint = true) {
  const d = b.clone().sub(a);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, Math.max(d.length(), 0.001), 10), m);
  c.position.copy(a).addScaledVector(d, 0.5);
  c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(c);
  if (joint) ball(g, m, b.x, b.y, b.z, r1);
}

/**
 * 人偶：大人 1.75 m / 3 岁小孩 0.95 m。有关节（髋、膝、脚、肩、肘、手），手脚按目标点自动弯膝弯肘。
 * 本地坐标：原点在两脚之间的地面（骑乘时在座椅中心正下方），+z 朝前，+x 是人偶的左边。
 */
export function buildFigure(kind: FigureKind, pose: FigurePose, opts: { ride?: RideRig; custom?: PoseTargets } = {}): THREE.Group {
  const g = new THREE.Group();
  const d = dims(kind);
  const H = d.H;
  const p = { ...presetPose(kind, pose, opts.ride), ...opts.custom };
  const skin = mat([0.85, 0.65, 0.55], 1, 0.8);
  const cloth = mat(kind === "adult" ? [0.55, 0.55, 0.6] : [0.75, 0.25, 0.25], 1, 0.8);
  const pants = mat(kind === "adult" ? [0.3, 0.3, 0.38] : [0.65, 0.2, 0.2], 1, 0.8);
  const shoe = mat([0.92, 0.92, 0.92], 1, 0.9);

  const hip = V(p.hip);
  const up = new THREE.Vector3(0, Math.cos(p.lean), Math.sin(p.lean));
  const neck = hip.clone().addScaledVector(up, d.torso);
  tube(g, cloth, hip, neck, 0.09 * H, 0.1 * H, false);
  const headC = neck.clone().addScaledVector(up, d.neck + d.headR);
  ball(g, skin, headC.x, headC.y, headC.z, d.headR);
  // 鼻子：看得出脸朝哪边
  const face = new THREE.Vector3(Math.sin(p.head), 0, Math.cos(p.head));
  ball(g, skin, headC.x + face.x * d.headR, headC.y, headC.z + face.z * d.headR, d.headR * 0.22);

  for (const sx of [1, -1]) {
    const hj = hip.clone().add(new THREE.Vector3(sx * d.hipW, 0, 0));
    const leg = bend(hj, V(sx > 0 ? p.footL : p.footR), d.thigh, d.shin, pose === "sit" ? new THREE.Vector3(sx * 0.2, 1, 0) : new THREE.Vector3(sx * 0.25, 0, 1));
    tube(g, pants, hj, leg.mid, 0.042 * H, 0.038 * H);
    tube(g, pants, leg.mid, leg.end, 0.036 * H, 0.03 * H);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.055 * H, d.ankle, d.foot), shoe);
    f.position.set(leg.end.x, d.ankle / 2, leg.end.z + d.foot * 0.3);
    f.position.y = Math.max(d.ankle / 2, leg.end.y - d.ankle / 2);
    g.add(f);

    const sj = neck.clone().addScaledVector(up, -0.03 * H).add(new THREE.Vector3(sx * d.sh, 0, 0));
    const arm = bend(sj, V(sx > 0 ? p.handL : p.handR), d.ua, d.fa, new THREE.Vector3(sx * 0.7, -1, -0.3));
    tube(g, cloth, sj, arm.mid, 0.032 * H, 0.028 * H);
    tube(g, skin, arm.mid, arm.end, 0.026 * H, 0.024 * H);
    ball(g, skin, arm.end.x, arm.end.y, arm.end.z, 0.03 * H);
  }
  return g;
}

/**
 * 拍摄者空着的手（挂在摄影机下，摄影机本地坐标：+x 右、+y 上、-z 前）。
 * side = -1 从画面左下角伸进来；tanH / tanV = 半视角正切。
 */
export function buildFreeHand(side: 1 | -1, act: "point" | "wave" | "reach", tanH: number, tanV: number): THREE.Group {
  const g = new THREE.Group();
  const skin = mat([0.85, 0.65, 0.55], 1, 0.85);
  const sleeve = mat([0.55, 0.55, 0.6], 1, 0.85);
  const z = 0.4;
  const P = (nx: number, ny: number, dz = 0) => new THREE.Vector3(nx * tanH * (z + dz), ny * tanV * (z + dz), -(z + dz));
  const tip = act === "wave" ? P(side * 0.55, -0.28) : act === "reach" ? P(side * 0.2, -0.45, 0.1) : P(side * 0.35, -0.5, 0.05);
  const wrist = act === "wave" ? P(side * 0.62, -0.62) : P(side * 0.72, -0.78);
  const elbow = P(side * 1.25, -1.35, -0.12);
  tube(g, sleeve, elbow, wrist, 0.035, 0.03, false);
  const dir = tip.clone().sub(wrist).normalize();
  const palmC = wrist.clone().addScaledVector(dir, 0.05);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.025), skin);
  palm.position.copy(palmC);
  palm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(palm);
  const top = palmC.clone().addScaledVector(dir, 0.045);
  const across = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
  if (act === "point") {
    tube(g, skin, top, top.clone().addScaledVector(dir, 0.08), 0.009, 0.008);
    ball(g, skin, top.x - across.x * 0.02, top.y - across.y * 0.02, top.z, 0.02);
  } else
    for (const k of [-1.5, -0.5, 0.5, 1.5]) {
      const s = top.clone().addScaledVector(across, k * 0.018);
      tube(g, skin, s, s.clone().addScaledVector(dir, 0.07), 0.008, 0.007);
    }
  return g;
}
