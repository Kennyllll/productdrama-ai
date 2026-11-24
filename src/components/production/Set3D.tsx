"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { saveSetLayoutAction } from "@/app/production-actions";
import type { SetLayout, SetMove, SetProp } from "@/lib/production-repo";
import { frameShot, lerpLayout, moveEnd, MOVES, shakeLayout } from "@/lib/shorts-set";
import type { SceneItem } from "@/lib/shorts-scenes";
import { itemAt, itemLabel, roomBox, wallBetween } from "@/lib/stage-rules";
import { buildFigure, buildFreeHand, buildScene } from "@/components/shorts/scene-mesh";
import { estimateRig, figuresOf, KB002_RIG, rideOf, type FigureSpec, type ProductRig } from "@/lib/figures";
import { freeHand, OP_HANDS, OP_POSES, operatorOrigin, parseOp } from "@/lib/shorts-operator";

export interface SetShot {
  code: string;
  /** 按钮上显示的名字；没有就用 code */
  label?: string;
  title: string;
  original: SetLayout;
  edited: SetLayout | null;
  refs: { label: string; fileId: string; video: boolean; url?: string }[];
  /** 有值时本镜只能看不能保存，值是原因 */
  locked?: string;
  /** 机位已存但还没有 3D 构图：保存按钮要可点 */
  needsCapture?: boolean;
}

type V3 = [number, number, number];
/** Blender 坐标（x 东、y 北、z 上）→ three.js（y 上） */
const toV = (p: V3) => new THREE.Vector3(p[0], p[2], -p[1]);
const hfov = (lens: number) => 2 * Math.atan(18 / lens);
/** 镜头朝向：北 = 0°，东 = 90° */
const heading = (l: SetLayout) => ((Math.atan2(l.lookAt[0] - l.camPos[0], l.lookAt[1] - l.camPos[1]) * 180) / Math.PI + 360) % 360;
const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const MARKER_LAYER = 1;

// 必须定义在组件外：定义在里面时每次重绘都是新组件，滑块会被重建，拖动中途断掉
function Slider({ label, value, min, max, step, onChange, unit }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit: string }) {
  return (
    <label className="block text-xs text-neutral-400">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-white">
          {value.toFixed(step < 1 ? 2 : 0)} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-400" />
    </label>
  );
}
type Handle = "cam" | "target" | "bike";

export function Set3D({
  projectId,
  episode,
  shots,
  mapProps,
  sceneItems,
  glbUrl,
  initialCode,
  codePrefix = "E2-",
  onSave,
  onCapture,
  onCaptureProduct,
  placeholderProduct,
  onShotChange,
  rig,
  moveExtra,
  operators,
  autoCapture,
  live,
  captureSignal = 0,
  onDirty,
  otherDirty = false,
  compact = false,
  activeCode,
  controlsSlot,
}: {
  /** 三栏 3D 页：机位设置渲染到右边属性栏 */
  controlsSlot?: HTMLElement | null;
  projectId: string;
  episode: number;
  shots: SetShot[];
  mapProps: SetProp[];
  /** 短视频场地库：按镜头给出有形状的家具（优先于 mapProps 方块） */
  sceneItems?: Record<string, SceneItem[]>;
  glbUrl: string | null;
  initialCode: string;
  codePrefix?: string;
  /** 传了就用它保存（短视频），并显示运镜编辑 */
  onSave?: (code: string, layout: SetLayout | null) => Promise<{ error?: string }>;
  /** 传了就在保存机位后同时截下 3D 构图，参数是摄影机画面 PNG */
  onCapture?: (code: string, png: string) => Promise<{ error?: string }>;
  /** 只拍产品、白底、从本镜机位方向看的同角度参考图（代替 Blender 渲染） */
  onCaptureProduct?: (code: string, png: string) => Promise<{ error?: string }>;
  /** 照片模型形状不准：截 3D 构图时把车换成同尺寸的灰块，免得 AI 照着灰模画错零件 */
  placeholderProduct?: boolean;
  onShotChange?: (code: string) => void;
  /** 产品接触点（按产品模型保存）；没有时按模型尺寸估算 */
  rig?: ProductRig | null;
  /** 运镜框里额外的控件（短视频：拍摄者入镜） */
  moveExtra?: (code: string, locked: boolean, api: { layout: SetLayout; setCamH: (h: number) => void }) => React.ReactNode;
  /** 每镜拍摄者设置（短视频）：在镜头位置按姿态画出拍摄者人偶 */
  operators?: Record<string, string>;
  /** 进来就自动保存机位 + 3D 构图（摆放界面保存后跳过来） */
  autoCapture?: boolean;
  /** 同页摆放编辑器里的人偶 / 产品位置：实时合进本镜机位画面（短视频） */
  live?: { figures: FigureSpec[]; bike?: [number, number]; bikeYaw: number; bikeLift?: number; bikePitch?: number; bikeRoll?: number; bikeGround?: number } | null;
  /** 数字变化 = 摆放刚保存过，自动保存机位 + 3D 构图 */
  captureSignal?: number;
  /** 机位有没有没保存的改动（同页离开提醒用） */
  onDirty?: (dirty: boolean) => void;
  /** 同页别的编辑器有没保存的改动：切镜头时一起提醒 */
  otherDirty?: boolean;
  /** 合并 3D 页用：镜头切换、保存都放在页面顶部，次要设置收起 */
  compact?: boolean;
  /** 外面切了镜头（已经问过要不要丢改动） */
  activeCode?: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState(shots.some((s) => s.code === initialCode) ? initialCode : shots[0]?.code ?? "");
  const shot = shots.find((s) => s.code === code) ?? shots[0];
  const [layout, setLayout] = useState<SetLayout>(shot.edited ?? shot.original);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const camCanvas = useRef<HTMLCanvasElement>(null);
  const productShotRef = useRef<(() => string | null) | null>(null);
  const proxyRef = useRef<((on: boolean) => void) | null>(null);
  const [modelReady, setModelReady] = useState(!glbUrl);
  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef(layout);
  const [rigSaved] = useState<ProductRig | null>(rig ?? null);
  const [autoRig, setAutoRig] = useState<ProductRig | null>(null);
  const rigUse = rigSaved ?? autoRig ?? KB002_RIG;
  const rigRef = useRef(rigUse);
  useEffect(() => {
    rigRef.current = rigUse;
  }, [rigUse]);
  const viewRef = useRef({ cx: 0, cz: 0, span: 30 });
  const propsRef = useRef<THREE.Group | null>(null);
  const previewRef = useRef<number | null>(null);
  const shotProps = useMemo(() => (shot.original.props?.length ? shot.original.props : mapProps), [shot, mapProps]);
  const shotItems = sceneItems?.[shot.code] ?? null;

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const opRef = useRef<string | null>(null);
  useEffect(() => {
    opRef.current = operators ? (operators[code] ?? "") : null;
  }, [operators, code]);

  /** 地图自动缩放：机位、看向点和房间（地板 / 墙）都框进来 */
  const recenter = (l: SetLayout, items: SceneItem[] | null = shotItems) => {
    const c = toV(l.camPos);
    const t = toV(l.lookAt);
    const room = items?.length ? roomBox(items) : null;
    if (room) {
      const x0 = Math.min(room.x0, c.x, t.x);
      const x1 = Math.max(room.x1, c.x, t.x);
      const z0 = Math.min(-room.y1, c.z, t.z);
      const z1 = Math.max(-room.y0, c.z, t.z);
      viewRef.current = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span: Math.min(60, Math.max(6, (z1 - z0) * 1.2, ((x1 - x0) * 1.2) / 2.33)) };
      return;
    }
    const dist = Math.min(c.distanceTo(t), 40);
    viewRef.current = { cx: (c.x + t.x) / 2, cz: (c.z + t.z) / 2, span: Math.max(12, dist * 2.2) };
  };

  const outside = shotItems?.length ? wallBetween([layout.camPos[0], layout.camPos[1]], layout.camPos[2], shotItems) : null;
  const camIn = shotItems ? itemAt([layout.camPos[0], layout.camPos[1]], layout.camPos[2], shotItems) : undefined;
  const camOut = outside ? `机位在「${itemLabel(outside.wall, shotItems ?? [])}」外面：拍出来会被墙挡住` : camIn ? `机位在「${itemLabel(camIn, shotItems ?? [])}」里面：拍出来会被挡住，挪开一点` : "";

  const pick = async (s: SetShot, force = false) => {
    if (!force && (dirty || otherDirty) && s.code !== code && !await askConfirm("这个镜头的修改还没保存，切换会丢掉。确定切换？")) return;
    setCode(s.code);
    onShotChange?.(s.code);
    const l = s.edited ?? s.original;
    setLayout(l);
    setDirty(false);
    setMsg("");
    recenter(l, sceneItems?.[s.code] ?? null);
    const url = new URL(window.location.href);
    url.searchParams.set("shot", s.code);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const update = (patch: Partial<SetLayout>) => {
    setLayout((l) => ({ ...l, ...patch }));
    setDirty(true);
  };

  const recenterRef = useRef(recenter);
  recenterRef.current = recenter;
  useEffect(() => {
    recenterRef.current(layoutRef.current);
    const camEl = camCanvas.current;
    const mapEl = mapCanvas.current;
    if (!camEl || !mapEl) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#c9d3dc");
    scene.add(new THREE.HemisphereLight("#eef3ff", "#4a5235", 1.6));
    const sun = new THREE.DirectionalLight("#fff1dc", 1.6);
    sun.position.set(-30, 40, 20);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: "#5d6b44" }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    scene.add(ground);
    const propsGroup = new THREE.Group();
    scene.add(propsGroup);
    propsRef.current = propsGroup;

    const bike = new THREE.Group();
    scene.add(bike);
    const bikeStandIn = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.12), new THREE.MeshLambertMaterial({ color: "#f4f4f2" }));
    bikeStandIn.position.y = 0.25;
    bike.add(bikeStandIn);
    if (glbUrl) {
      new GLTFLoader().load(glbUrl, (g) => {
        const obj = g.scene;
        const box = new THREE.Box3().setFromObject(obj);
        const c = box.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -box.min.y, -c.z);
        bike.remove(bikeStandIn);
        bike.add(obj);
        const s = box.getSize(new THREE.Vector3());
        const proxy = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshLambertMaterial({ color: "#d8d8d8", transparent: true, opacity: 0.4, depthWrite: false }));
        proxy.position.y = s.y / 2;
        proxyRef.current = (on) => {
          obj.visible = !on;
          if (on) bike.add(proxy);
          else bike.remove(proxy);
        };
        // KB002 等模型车头沿 x 轴：长 = x，宽 = z
        setAutoRig(estimateRig(s.x, s.z, s.y));
        setModelReady(true);
      });
    }
    const figGroup = new THREE.Group();
    scene.add(figGroup);
    let figKey = "";
    const opGroup = new THREE.Group();
    scene.add(opGroup);
    let opKey = "-";

    const marker = (color: string, r: number) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 10;
      m.layers.set(MARKER_LAYER);
      scene.add(m);
      return m;
    };
    const camMark = marker("#fbbf24", 1);
    const targetMark = marker("#38bdf8", 0.7);
    const bikeMark = marker("#f43f5e", 0.7);
    const fovGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    const fovLine = new THREE.Line(fovGeo, new THREE.LineBasicMaterial({ color: "#fbbf24", depthTest: false }));
    fovLine.renderOrder = 11;
    fovLine.layers.set(MARKER_LAYER);
    scene.add(fovLine);

    const shotCam = new THREE.PerspectiveCamera(40, 2.33, 0.03, 2000);
    const handGroup = new THREE.Group();
    shotCam.add(handGroup);
    scene.add(shotCam);
    let handKey = "-";
    const mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    mapCam.layers.enable(MARKER_LAYER);
    mapCam.up.set(0, 0, -1);
    const camR = new THREE.WebGLRenderer({ canvas: camEl, antialias: true, preserveDrawingBuffer: true });
    const mapR = new THREE.WebGLRenderer({ canvas: mapEl, antialias: true });
    for (const r of [camR, mapR]) r.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const fit = (r: THREE.WebGLRenderer, el: HTMLCanvasElement) => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = r.getSize(new THREE.Vector2());
      if (w && h && (s.x !== w || s.y !== h)) r.setSize(w, h, false);
      return w / Math.max(h, 1);
    };

    // 同角度产品参考图：只留产品、白底，沿「产品 → 本镜摄影机」的方向把产品拍满画面
    productShotRef.current = () => {
      if (!bike.visible || bikeStandIn.parent) return null;
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setSize(768, 768, false);
      const hide = [ground, propsGroup, figGroup, opGroup, handGroup];
      const was = hide.map((o) => o.visible);
      for (const o of hide) o.visible = false;
      const bg = scene.background;
      scene.background = new THREE.Color("#ffffff");
      const box = new THREE.Box3().setFromObject(bike);
      const c = box.getCenter(new THREE.Vector3());
      const rad = box.getSize(new THREE.Vector3()).length() / 2 || 1;
      const cam = new THREE.PerspectiveCamera(30, 1, rad / 100, rad * 100);
      const d = shotCam.position.clone().sub(c);
      if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
      cam.position.copy(c).add(d.normalize().multiplyScalar((rad / Math.sin(Math.PI / 12)) * 1.05));
      cam.lookAt(c);
      r.render(scene, cam);
      const png = r.domElement.toDataURL("image/png");
      scene.background = bg;
      hide.forEach((o, i) => (o.visible = was[i]));
      r.dispose();
      r.forceContextLoss();
      return png;
    };

    let raf = 0;
    const frame = () => {
      let l = layoutRef.current;
      if (previewRef.current !== null) {
        const t = (performance.now() - previewRef.current) / 3000;
        if (t >= 1) previewRef.current = null;
        else l = l.move?.kind === "handheld" ? shakeLayout(l, t * 3) : lerpLayout(l, moveEnd(l), t);
      }
      const v = viewRef.current;
      const cam = toV(l.camPos);
      const target = toV(l.lookAt);
      const hf = hfov(l.lens);
      fit(camR, camEl);
      shotCam.aspect = l.aspect;
      shotCam.fov = (2 * Math.atan(Math.tan(hf / 2) / l.aspect) * 180) / Math.PI;
      shotCam.position.copy(cam);
      shotCam.lookAt(target);
      shotCam.updateProjectionMatrix();

      const hasBike = Boolean(l.bike);
      bike.visible = hasBike;
      bikeMark.visible = hasBike;
      if (l.bike) {
        bike.position.set(l.bike[0], l.bikeLift ?? 0, -l.bike[1]);
        // KB002 模型车头朝 -x；转 yaw-90 后，朝向 0° 时车头朝世界 -z（地图上方）
        bike.rotation.set(((l.bikeRoll ?? 0) * Math.PI) / 180, (((l.bikeYaw ?? 0) - 90) * Math.PI) / 180, (-(l.bikePitch ?? 0) * Math.PI) / 180, "YXZ");
        bikeMark.position.set(l.bike[0], 0.02, -l.bike[1]);
      }
      const figs = figuresOf(l);
      const rg = rigRef.current;
      const key = JSON.stringify([figs, rg, l.bike, l.bikeYaw, l.bikeLift, l.bikePitch, l.bikeRoll]);
      if (key !== figKey) {
        figKey = key;
        for (const c of [...figGroup.children]) {
          figGroup.remove(c);
          c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        // 人偶本地 +z 朝前；骑乘时挂在和产品一样的变换下（车侧倾 / 抬头 / 离地，人一起动），原点放在座椅中心
        const bx = l.bike?.[0] ?? 0;
        const by = l.bike?.[1] ?? 0;
        for (const f of figs) {
          const ride = f.onProduct && Boolean(l.bike);
          const g = buildFigure(f.kind, ride ? "ride" : f.pose === "ride" ? "stand" : f.pose, { ride: rideOf(rg), custom: f.custom, h: f.h });
          const mount = new THREE.Group();
          if (ride) {
            mount.position.copy(bike.position);
            mount.rotation.copy(bike.rotation);
            g.rotation.y = -Math.PI / 2;
            g.position.set(rg.seatBack, 0, 0);
          } else {
            g.rotation.y = Math.PI - (f.yaw * Math.PI) / 180;
            g.position.set(bx + f.dx, 0, -(by + f.dy));
          }
          mount.add(g);
          figGroup.add(mount);
        }
      }

      // 拍摄者人偶：跟着镜头走，手机在身体前方
      const os = opRef.current !== null ? parseOp(opRef.current) : null;
      const oKey = os && !os.custom ? os.pose : "";
      if (oKey !== opKey) {
        opKey = oKey;
        for (const c of [...opGroup.children]) {
          opGroup.remove(c);
          c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        if (os && !os.custom) opGroup.add(buildFigure("adult", os.pose, { custom: OP_HANDS[os.pose] ?? undefined }));
      }
      if (os && !os.custom) {
        const oo = operatorOrigin(os.pose, l);
        opGroup.position.set(oo.x, 0, -oo.y);
        opGroup.rotation.y = Math.PI - (oo.heading * Math.PI) / 180;
      }
      const hKey = os && !os.custom && os.hand ? [freeHand(os).side, os.act, l.lens, l.aspect].join() : "";
      if (hKey !== handKey) {
        handKey = hKey;
        for (const c of [...handGroup.children]) {
          handGroup.remove(c);
          c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        if (os && hKey) handGroup.add(buildFreeHand(freeHand(os).side === "left" ? -1 : 1, os.act ?? "reach", 18 / l.lens, 18 / l.lens / l.aspect));
      }
      camMark.position.set(cam.x, 0.03, cam.z);
      targetMark.position.set(target.x, 0.03, target.z);
      const dir = new THREE.Vector3(target.x - cam.x, 0, target.z - cam.z).normalize();
      const len = v.span * 0.6;
      const a = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), hf / 2).multiplyScalar(len).add(cam);
      const b = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -hf / 2).multiplyScalar(len).add(cam);
      const pos = fovGeo.getAttribute("position") as THREE.BufferAttribute;
      pos.setXYZ(0, a.x, 0.05, a.z);
      pos.setXYZ(1, cam.x, 0.05, cam.z);
      pos.setXYZ(2, b.x, 0.05, b.z);
      pos.setXYZ(3, a.x, 0.05, a.z);
      pos.needsUpdate = true;
      const s = v.span / 30;
      camMark.scale.setScalar(s);
      targetMark.scale.setScalar(s);
      bikeMark.scale.setScalar(s);

      const mapAspect = fit(mapR, mapEl);
      mapCam.left = (-v.span / 2) * mapAspect;
      mapCam.right = (v.span / 2) * mapAspect;
      mapCam.top = v.span / 2;
      mapCam.bottom = -v.span / 2;
      mapCam.position.set(v.cx, 300, v.cz);
      mapCam.lookAt(v.cx, 0, v.cz);
      mapCam.updateProjectionMatrix();

      camR.render(scene, shotCam);
      mapR.render(scene, mapCam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const ground3 = (e: PointerEvent | WheelEvent) => {
      const r = mapEl.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, mapCam);
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    };
    let drag: { handle: Handle | "pan"; x: number; z: number } | null = null;
    const down = (e: PointerEvent) => {
      const p = ground3(e);
      if (!p) return;
      const l = layoutRef.current;
      const near = viewRef.current.span * 0.05;
      const cands: [Handle, number][] = [
        ["cam", Math.hypot(p.x - l.camPos[0], -p.z - l.camPos[1])],
        ["target", Math.hypot(p.x - l.lookAt[0], -p.z - l.lookAt[1])],
        ...(l.bike ? ([["bike", Math.hypot(p.x - l.bike[0], -p.z - l.bike[1])]] as [Handle, number][]) : []),
      ];
      const best = cands.sort((a, b) => a[1] - b[1])[0];
      drag = best && best[1] < near ? { handle: best[0], x: p.x, z: p.z } : { handle: "pan", x: p.x, z: p.z };
      mapEl.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const p = ground3(e);
      if (!p) return;
      const bx = Math.round(p.x * 100) / 100;
      const by = Math.round(-p.z * 100) / 100;
      if (drag.handle === "pan") {
        viewRef.current.cx -= p.x - drag.x;
        viewRef.current.cz -= p.z - drag.z;
        return;
      }
      const h = drag.handle;
      setLayout((l) =>
        h === "cam" ? { ...l, camPos: [bx, by, l.camPos[2]] } : h === "target" ? { ...l, lookAt: [bx, by, l.lookAt[2]] } : { ...l, bike: [bx, by] },
      );
      setDirty(true);
    };
    const up = () => {
      drag = null;
    };
    // 滚轮默认滚页面；点过地图（鼠标还在地图上）或按住 Ctrl 才缩放
    let armed = false;
    const arm = () => (armed = true);
    const disarm = () => (armed = false);
    const wheel = (e: WheelEvent) => {
      if (!(armed || e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      viewRef.current.span = Math.min(400, Math.max(3, viewRef.current.span * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));
    };
    mapEl.addEventListener("pointerdown", down);
    mapEl.addEventListener("pointermove", move);
    mapEl.addEventListener("pointerup", up);
    mapEl.addEventListener("wheel", wheel, { passive: false });
    mapEl.addEventListener("pointerdown", arm);
    mapEl.addEventListener("pointerleave", disarm);
    return () => {
      cancelAnimationFrame(raf);
      mapEl.removeEventListener("pointerdown", down);
      mapEl.removeEventListener("pointermove", move);
      mapEl.removeEventListener("pointerup", up);
      mapEl.removeEventListener("wheel", wheel);
      mapEl.removeEventListener("pointerdown", arm);
      mapEl.removeEventListener("pointerleave", disarm);
      camR.dispose();
      mapR.dispose();
      propsRef.current = null;
      productShotRef.current = null;
    };
  }, [glbUrl]);

  useEffect(() => {
    const g = propsRef.current;
    if (!g) return;
    g.clear();
    if (shotItems) {
      g.add(buildScene(shotItems));
      return;
    }
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (const p of shotProps) {
      const lo = toV(p.lo);
      const hi = toV(p.hi);
      const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(p.rgb?.[0] ?? 0.5, p.rgb?.[1] ?? 0.5, p.rgb?.[2] ?? 0.5) }));
      m.scale.set(Math.max(Math.abs(hi.x - lo.x), 0.01), Math.max(Math.abs(hi.y - lo.y), 0.01), Math.max(Math.abs(hi.z - lo.z), 0.01));
      m.position.set((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2);
      g.add(m);
    }
  }, [shotProps, shotItems]);

  const idx = shots.findIndex((s) => s.code === code);
  const prev = idx > 0 ? shots[idx - 1] : null;
  const diff = prev ? angleDiff(heading(layout), heading(prev.edited ?? prev.original)) : null;
  const camHeight = layout.camPos[2];
  const dist = Math.hypot(layout.lookAt[0] - layout.camPos[0], layout.lookAt[1] - layout.camPos[1]);

  const save = (data: SetLayout | null) =>
    start(async () => {
      if (data && dirty) data = { ...data, source: `手动调整（${new Date().toLocaleString("zh-CN", { hour12: false })}）` };
      const r = onSave ? await onSave(code, data) : await saveSetLayoutAction(projectId, episode, code, data);
      if (r.error) return setMsg(r.error);
      // 短视频：保存机位时同时截下 3D 构图，少一步也不会忘
      if (data && onCapture) {
        previewRef.current = null;
        await new Promise((res) => requestAnimationFrame(() => res(null)));
        if (placeholderProduct) {
          proxyRef.current?.(true);
          for (let i = 0; i < 2; i++) await new Promise((res) => requestAnimationFrame(() => res(null)));
        }
        const png = camCanvas.current?.toDataURL("image/png");
        proxyRef.current?.(false);
        const c = png ? await onCapture(code, png) : { error: "截图失败" };
        const pp = !c.error && onCaptureProduct ? productShotRef.current?.() : null;
        const p: { error?: string } = pp && onCaptureProduct ? await onCaptureProduct(code, pp) : {};
        setMsg(c.error ?? p.error ?? "机位和 3D 构图都已保存。点左上「← 回到镜头」确认构图，或点上面的下一镜接着摆");
        setDirty(false);
        router.refresh();
        return;
      }
      setMsg(data ? "已保存为你的修改（原始数据保留着）" : "已恢复成当时的数据");
      if (!data) setLayout(shot.original);
      setDirty(false);
      router.refresh();
    });

  const saveRef = useRef(save);
  saveRef.current = save;
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoCapture || autoDone.current || !onCapture || shot.locked || !modelReady) return;
    autoDone.current = true;
    // 保存后页面会刷新、组件会重建：同一镜两分钟内只自动保存一次，防止循环
    const k = `autocap:${code}`;
    if (Date.now() - Number(sessionStorage.getItem(k) ?? 0) < 120_000) return;
    sessionStorage.setItem(k, String(Date.now()));
    window.history.replaceState(window.history.state, "", `?shot=${code}`);
    setMsg("正在自动更新 3D 构图…");
    setTimeout(() => saveRef.current(layout), 800);
  }, [autoCapture, onCapture, shot.locked, modelReady, code, layout]);

  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!live) return;
    setLayout((l) => ({ ...l, figures: live.figures, figure: live.figures.length > 0, bike: live.bike, bikeYaw: live.bikeYaw, ...(live.bikeLift === undefined ? {} : { bikeLift: live.bikeLift, bikePitch: live.bikePitch, bikeRoll: live.bikeRoll, bikeGround: live.bikeGround }) }));
  }, [live]);
  useEffect(() => {
    if (!captureSignal || !onCapture || shot.locked) return;
    setMsg("正在更新 3D 构图…");
    const t = setTimeout(() => saveRef.current(layoutRef.current), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureSignal]);
  useEffect(() => {
    const s = activeCode && activeCode !== code ? shots.find((x) => x.code === activeCode) : undefined;
    if (s) pick(s, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCode]);

  const more = (
    <>
          <Slider label="看向点高度" value={layout.lookAt[2]} min={-2} max={20} step={0.05} unit="米" onChange={(v) => update({ lookAt: [layout.lookAt[0], layout.lookAt[1], v] })} />
          {layout.bike ? <Slider label="产品朝向" value={layout.bikeYaw ?? 0} min={-180} max={180} step={1} unit="°" onChange={(v) => update({ bikeYaw: v })} /> : null}
          {layout.bike ? (
            <>
              <Slider label="产品离地高度" value={layout.bikeLift ?? 0} min={0} max={1.5} step={0.05} unit="米" onChange={(v) => update({ bikeLift: v })} />
              <Slider label="产品俯仰（车头抬起为正）" value={layout.bikePitch ?? 0} min={-90} max={90} step={1} unit="°" onChange={(v) => update({ bikePitch: v })} />
              <Slider label="产品侧倾" value={layout.bikeRoll ?? 0} min={-180} max={180} step={1} unit="°" onChange={(v) => update({ bikeRoll: v })} />
              <div className="flex flex-wrap gap-1 text-[11px]">
                {(
                  [
                    ["平放", 0, 0, 0],
                    ["侧倒在地", 0.12, 0, 85],
                    ["斜靠（侧倾 18°）", 0, 0, 18],
                    ["车头抬起", 0, 25, 0],
                    ["提起来", 0.45, 0, 0],
                  ] as const
                ).map(([n, lift, pitch, roll]) => (
                  <button key={n} type="button" className="rounded border border-white/15 px-2 py-0.5 text-neutral-300 hover:border-amber-400/60" onClick={() => update({ bikeLift: lift, bikePitch: pitch, bikeRoll: roll })}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          ) : null}
    </>
  );
  const controls = (
        <fieldset disabled={Boolean(compact && shot.locked)} className={`min-w-0 space-y-3 rounded-xl border border-white/10 bg-neutral-900/70 p-4 ${compact && shot.locked ? "opacity-60" : ""}`}>
          {compact ? <p className="text-sm font-medium text-white">相机</p> : null}
          <Slider label="焦段" value={layout.lens} min={12} max={200} step={1} unit="mm" onChange={(v) => update({ lens: v })} />
          <Slider label="机位高度" value={camHeight} min={0.05} max={12} step={0.05} unit="米" onChange={(v) => update({ camPos: [layout.camPos[0], layout.camPos[1], v] })} />
          {compact ? (
            <>
              <Slider label="看向点高度" value={layout.lookAt[2]} min={-2} max={20} step={0.05} unit="米" onChange={(v) => update({ lookAt: [layout.lookAt[0], layout.lookAt[1], v] })} />
              <div>
                <button type="button" disabled={pending || (!shot.edited && !dirty) || Boolean(shot.locked)} onClick={() => save(null)} className="rounded-lg border border-white/15 px-3 py-1 text-sm text-neutral-300 disabled:opacity-40">
                  恢复自动机位
                </button>
                <button type="button" disabled={pending || Boolean(shot.locked)} onClick={() => update(frameShot(layout, opRef.current !== null ? (OP_POSES.find((p) => p.id === parseOp(opRef.current ?? undefined).pose)?.lo ?? 0) : 0))} title="照真实手机广告：车和人占画面一半左右，车轮下面少留地面，机位放低" className="ml-2 rounded-lg border border-amber-400/40 px-3 py-1 text-sm text-amber-200 disabled:opacity-40">
                  按构图规则对准
                </button>
              </div>
            </>
          ) : (
            more
          )}
          {onSave ? (
            <details className="group border-t border-white/10 pt-3 text-xs text-neutral-400">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-white [&::-webkit-details-marker]:hidden">
                运镜和拍摄者
                <span className="text-xs text-neutral-400">{MOVES.find((m) => m.id === (layout.move?.kind ?? "static"))?.label}</span>
                <span className="ml-auto text-xs text-neutral-500 group-open:hidden">展开</span>
                <span className="ml-auto hidden text-xs text-neutral-500 group-open:inline">收起</span>
              </summary>
              <div className="mt-2 space-y-2">
              <label className="block">
                运镜
                <select
                  value={layout.move?.kind ?? "static"}
                  onChange={(e) => update({ move: { kind: e.target.value as SetMove["kind"], amount: layout.move?.amount || 0.5 } })}
                  className="mt-1 w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-white"
                >
                  {MOVES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {layout.move && layout.move.kind !== "static" ? (
                <Slider label={layout.move.kind === "handheld" ? "晃动幅度" : "运镜幅度"} value={layout.move.amount} min={0.1} max={1} step={0.05} unit="" onChange={(v) => update({ move: { kind: layout.move!.kind, amount: v } })} />
              ) : null}
              <button type="button" onClick={() => (previewRef.current = performance.now())} className="rounded-lg border border-white/15 px-3 py-1 text-sm text-neutral-300">
                ▶ 预演运镜（3 秒）
              </button>
              {moveExtra?.(code, Boolean(shot.locked), { layout, setCamH: (h) => update({ camPos: [layout.camPos[0], layout.camPos[1], h] }) })}
              </div>
            </details>
          ) : null}
          {compact ? null : (
            <>
          <div className="space-y-1 border-t border-white/10 pt-3 text-xs">
            <p className="text-neutral-400">
              镜头朝向 <span className="text-white">{heading(layout).toFixed(0)}°</span>（北 0°，东 90°） · 到看向点 {dist.toFixed(1)} 米
            </p>
            {diff !== null && prev ? (
              <p className={diff >= 30 ? "text-emerald-300" : "text-amber-300"}>
                和上一镜 {codePrefix}
                {prev.code} 的角度差 {diff.toFixed(0)}°{diff >= 30 ? "，够了" : "：不到 30°，直接切会像跳帧（除非景别差 2 倍以上）"}
              </p>
            ) : null}
            <p className="text-neutral-500">数据来源：{shot.edited ? shot.edited.source || "手动调整" : shot.original.source}</p>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
            <button type="button" disabled={(!dirty && !(onSave && (!shot.edited || shot.needsCapture))) || pending || Boolean(shot.locked)} onClick={() => save(layout)} className="rounded-lg bg-amber-400 px-3 py-1 text-sm font-medium text-black disabled:opacity-40">
              {onCapture ? "保存机位 + 3D 构图" : "保存我的修改"}
            </button>
            <button type="button" disabled={pending || (!shot.edited && !dirty) || Boolean(shot.locked)} onClick={() => save(null)} className="rounded-lg border border-white/15 px-3 py-1 text-sm text-neutral-300 disabled:opacity-40">
              {onSave ? "恢复自动机位" : "恢复当时的数据"}
            </button>
          </div>
            </>
          )}
          {msg ? <p className="text-xs text-sky-200">{msg}</p> : null}
          {compact ? null : (
          <p className="text-[11px] leading-relaxed text-neutral-500">
            {onCapture ? "在这里怎么改都不花钱。每个镜头调完都要点“保存机位 + 3D 构图”，之后回工作台确认构图；生成首帧前会先问你。" : "在这里怎么改都不花钱。改完不会自动重新出图：按新布景出 Blender 构图和首帧，下一轮接进来，出图前会先问你。"}
          </p>
          )}
        </fieldset>
  );
  return (
    <div className="space-y-4">
      {compact ? null : (
        <>
      <div className="flex flex-wrap gap-2">
        {shots.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => pick(s)}
            className={`rounded-lg border px-3 py-1 text-sm ${s.code === code ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-white/10 text-neutral-400 hover:bg-white/5"}`}
          >
            {s.label ?? `${codePrefix}${s.code}`}
            {s.edited ? <span className="ml-1 text-[10px] text-sky-300">已改</span> : null}
            {s.locked ? <span className="ml-1 text-[10px] text-neutral-500">锁</span> : null}
          </button>
        ))}
      </div>
      <p className="text-sm text-neutral-300">{shot.title}</p>
      {shot.locked ? <p className="rounded-md bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">{shot.locked}</p> : null}
        </>
      )}

      <div className={compact ? "grid items-start gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]" : "grid gap-4 xl:grid-cols-2"}>
        <figure>
          <figcaption className="mb-1 text-xs text-neutral-400">摄影机画面（按当时的机位、焦段实时算）</figcaption>
          <canvas ref={camCanvas} className={`${layout.aspect < 1 ? "mx-auto max-w-sm" : ""} w-full rounded-lg border border-white/10 bg-black`} style={{ aspectRatio: String(layout.aspect) }} />
        </figure>
        <figure>
          <figcaption className="mb-1 text-xs text-neutral-400">
            俯视地图：拖<span className="text-amber-300">黄点</span>挪机位，拖<span className="text-sky-300">蓝点</span>改看向哪里
            {layout.bike ? <>，拖<span className="text-rose-300">红点</span>挪车</> : null}；拖空白处平移。缩放：按住 Ctrl 滚轮，或点右上角 + / −。上方是北
          </figcaption>
          <div className="relative">
            <canvas ref={mapCanvas} className={`aspect-[2.33] w-full cursor-crosshair touch-none rounded-lg border bg-black ${camOut ? "border-rose-500" : "border-white/10"}`} />
            <div className="absolute right-2 top-2 flex gap-1 text-xs">
              <button type="button" aria-label="放大地图" className="rounded bg-black/70 px-2 py-1 text-white hover:bg-black" onClick={() => (viewRef.current.span = Math.max(3, viewRef.current.span / 1.25))}>
                +
              </button>
              <button type="button" aria-label="缩小地图" className="rounded bg-black/70 px-2 py-1 text-white hover:bg-black" onClick={() => (viewRef.current.span = Math.min(400, viewRef.current.span * 1.25))}>
                −
              </button>
              <button type="button" className="rounded bg-black/70 px-2 py-1 text-white hover:bg-black" onClick={() => recenter(layout)}>
                回到全景
              </button>
            </div>
          </div>
          {camOut ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-rose-300">
              {camOut}
              {outside && !(compact && shot.locked) ? (
                <button type="button" className="rounded border border-rose-400/50 px-2 py-0.5 text-rose-200" onClick={() => update({ camPos: [outside.inside[0], outside.inside[1], layout.camPos[2]] })}>
                  放回房间里
                </button>
              ) : null}
            </p>
          ) : null}
        </figure>
      </div>

      <div className={compact ? "space-y-3" : "grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"}>
        {controlsSlot ? createPortal(controls, controlsSlot) : controls}
        <details open={!compact} className="min-w-0">
          <summary className="mb-2 cursor-pointer select-none text-xs text-neutral-400">{compact ? "历史结果" : "当时按这个布景出来的结果（对照看 3D 数据怎么变成画面）"}</summary>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {shot.refs.map((r) =>
              r.video ? (
                <figure key={r.url ?? r.fileId} className="w-80 shrink-0">
                  <video src={r.url ?? `/api/library/${r.fileId}`} controls preload="metadata" className="w-full rounded border border-white/10 bg-black" />
                  <figcaption className="mt-1 truncate text-[11px] text-neutral-500">{r.label}</figcaption>
                </figure>
              ) : (
                <a key={r.url ?? r.fileId} href={r.url ?? `/api/library/${r.fileId}`} target="_blank" rel="noreferrer" className={`${shot.original.aspect < 1 ? "w-48" : "w-80"} shrink-0`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url ?? `/api/library/${r.fileId}`} alt={r.label} className="w-full rounded border border-white/10 bg-black" />
                  <span className="mt-1 block truncate text-[11px] text-neutral-500">{r.label}</span>
                </a>
              ),
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
