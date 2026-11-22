"use client";

import { askConfirm } from "@/components/ConfirmHost";
import type { CastOption } from "@/lib/families";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { saveProductRigAction, saveSceneVersionAction, sceneConflictsAction } from "@/app/scene-actions";
import { saveShortLayoutAction } from "@/app/short-actions";
import { brainStageAction, type StageProposal } from "@/app/brain-stage-actions";
import { buildFigure, presetPose, shape } from "@/components/shorts/scene-mesh";
import { estimateRig, figuresOf, FIGURE_POSES, JOINTS, KB002_RIG, RIG_KEYS, rideOf, rigFrom, rigLocal, type FigureKind, type FigureSpec, type JointId, type P3, type ProductRig, type RigKey } from "@/lib/figures";
import type { SetLayout } from "@/lib/production-repo";
import { activeItems, findItemType, ITEM_TYPES, newItem, type SceneItem } from "@/lib/shorts-scenes";

interface Doc {
  figures: FigureSpec[];
  items: SceneItem[];
  bike?: [number, number];
  bikeYaw: number;
  bikeLift: number;
  bikePitch: number;
  bikeRoll: number;
  /** 这个姿势贴地要抬多高；bikeLift - bikeGround = 真的悬空多少 */
  bikeGround: number;
  rig: ProductRig | null;
}
/** 产品快捷姿势：[名字, 俯仰, 侧倾, 贴地后再抬高] —— 侧倾 + = 往左倒，俯仰 + = 车头抬起 */
const PRODUCT_POSES: [string, number, number, number][] = [
  ["立着", 0, 0, 0],
  ["左侧躺", 0, 90, 0],
  ["右侧躺", 0, -90, 0],
  ["倒放（车轮朝天）", 0, 180, 0],
  ["后轮着地竖起", 80, 0, 0],
  ["车头抬起", 25, 0, 0],
  ["往左斜靠", 0, 18, 0],
  ["往右斜靠", 0, -18, 0],
  ["提起来", 0, 0, 0.45],
];

function Range({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="block text-neutral-400">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-white">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-400" />
    </label>
  );
}
type Mode = "translate" | "rotate" | "scale";
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const effPose = (f: FigureSpec, hasBike: boolean) => (f.onProduct && hasBike ? "ride" : f.pose === "ride" ? "stand" : f.pose);

export function StageEditor({
  videoId,
  shotCode,
  shotLabel,
  shots,
  locked,
  layout,
  scene,
  items,
  glbUrl,
  modelId,
  rig,
  initialSel,
  backHref,
  onDocChange,
  onSaved,
  onDirty,
  compact,
  saveSignal = 0,
  members = [],
}: {
  videoId: string;
  /** 这一镜家庭的成员（家庭库）；人偶可以绑定 */
  members?: CastOption[];
  shotCode: string;
  shotLabel: string;
  shots: { code: string; label: string; href: string }[];
  locked?: string;
  layout: SetLayout;
  scene: { id: string; name: string; v: number; theme: string; themeLabel: string };
  items: SceneItem[];
  glbUrl: string | null;
  modelId: string | null;
  rig: ProductRig | null;
  initialSel?: string;
  backHref: string;
  /** 同页的机位编辑器要实时看到人偶 / 产品 / 家具 */
  onDocChange?: (d: { figures: FigureSpec[]; bike?: [number, number]; bikeYaw: number; bikeLift: number; bikePitch: number; bikeRoll: number; bikeGround: number; items: SceneItem[] }) => void;
  /** 有它就不跳页：保存后交给同页的机位编辑器更新 3D 构图 */
  onSaved?: () => void;
  /** 有没有没保存的改动（同页离开提醒用） */
  onDirty?: (dirty: boolean) => void;
  /** 合并 3D 页用：工具条在上、大画面，已锁定只能看 */
  compact?: boolean;
  /** 变一次 = 外面点了保存 */
  saveSignal?: number;
}) {
  const router = useRouter();
  const init = useRef<Doc>({ figures: figuresOf(layout), items, bike: layout.bike, bikeYaw: layout.bikeYaw ?? 0, bikeLift: layout.bikeLift ?? 0, bikePitch: layout.bikePitch ?? 0, bikeRoll: layout.bikeRoll ?? 0, bikeGround: layout.bikeGround ?? 0, rig });
  const [doc, setDoc] = useState<Doc>(init.current);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [sel, setSel] = useState<string | null>(initialSel && figuresOf(layout).some((f) => f.id === initialSel) ? `fig:${initialSel}` : compact && layout.bike ? "product" : null);
  const [mode, setMode] = useState<Mode>("translate");
  const [rigMode, setRigMode] = useState(false);
  const [shotView, setShotView] = useState(false);
  const [autoRig, setAutoRig] = useState<ProductRig | null>(null);
  const [msg, setMsg] = useState("");
  const [ask, setAsk] = useState("");
  const [brain, setBrain] = useState<StageProposal | null>(null);
  const [brainMsg, setBrainMsg] = useState("");
  const [thinking, setThinking] = useState(false);
  const [pending, start] = useTransition();
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ sync: () => void } | null>(null);
  const ro = Boolean(compact && locked);
  const st = useRef({ doc, sel, mode, rigMode, shotView, autoRig, ro });
  st.current = { doc, sel, mode, rigMode, shotView, autoRig, ro };
  const bikeRef = useRef<THREE.Group | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const rigUse = doc.rig ?? autoRig ?? KB002_RIG;
  const commit = (next: Doc | ((d: Doc) => Doc)) => {
    const d = docRef.current;
    const n = typeof next === "function" ? next(d) : next;
    setPast((p) => [...p.slice(-60), d]);
    setFuture([]);
    setDoc(n);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [docRef.current, ...f]);
    setDoc(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, docRef.current]);
    setDoc(future[0]);
    setFuture((f) => f.slice(1));
  };
  useEffect(() => {
    onDocChange?.({ figures: doc.figures, bike: doc.bike, bikeYaw: doc.bikeYaw, bikeLift: doc.bikeLift, bikePitch: doc.bikePitch, bikeRoll: doc.bikeRoll, bikeGround: doc.bikeGround, items: doc.items });
  }, [doc, onDocChange]);
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const s3 = new THREE.Scene();
    s3.background = new THREE.Color("#1c1f24");
    s3.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 6, 4);
    s3.add(sun);
    s3.add(new THREE.GridHelper(20, 40, 0x555555, 0x333333));

    const cam = new THREE.PerspectiveCamera(45, 1, 0.02, 200);
    const b0 = st.current.doc.bike ?? [0, 0];
    cam.position.set(b0[0] + 2.4, 1.8, -b0[1] + 2.6);
    const orbit = new OrbitControls(cam, el);
    // 普通滚轮留给页面滚动；按住 Ctrl / ⌘ / Alt 再滚才缩放 3D（触控板双指捏合也带 Ctrl）
    const wheelGate = (e: WheelEvent) => {
      orbit.enableZoom = e.ctrlKey || e.metaKey || e.altKey;
    };
    el.addEventListener("wheel", wheelGate, { capture: true });
    orbit.target.set(b0[0], 0.4, -b0[1]);
    orbit.update();
    const shotCam = new THREE.PerspectiveCamera(40, 9 / 16, 0.03, 200);
    const camHelper = new THREE.CameraHelper(shotCam);
    s3.add(camHelper);
    const toV = (p: [number, number, number]) => new THREE.Vector3(p[0], p[2], -p[1]);
    shotCam.position.copy(toV(layout.camPos));
    shotCam.lookAt(toV(layout.lookAt));
    shotCam.fov = (2 * Math.atan(Math.tan(Math.atan(18 / layout.lens)) / (9 / 16)) * 180) / Math.PI;
    shotCam.updateProjectionMatrix();
    camHelper.update();

    const tc = new TransformControls(cam, el);
    tc.setSize(0.8);
    const helper = tc.getHelper();
    s3.add(helper);
    tc.addEventListener("dragging-changed", (e) => {
      orbit.enabled = !e.value && !st.current.shotView;
      if (!e.value) finishDrag();
    });

    const world = new THREE.Group();
    s3.add(world);
    const bike = new THREE.Group();
    bike.userData.key = "product";
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    stand.position.y = 0.25;
    bike.add(stand);
    s3.add(bike);
    bikeRef.current = bike;
    const rigMarks = new THREE.Group();
    rigMarks.userData.rig = true;
    bike.add(rigMarks);
    if (glbUrl)
      new GLTFLoader().load(glbUrl, (g) => {
        const obj = g.scene;
        const box = new THREE.Box3().setFromObject(obj);
        const c = box.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -box.min.y, -c.z);
        bike.remove(stand);
        bike.add(obj);
        const sz = box.getSize(new THREE.Vector3());
        setAutoRig(estimateRig(sz.x, sz.z, sz.y));
      });

    const byKey = new Map<string, THREE.Object3D>();
    const dispose = (o: THREE.Object3D) => o.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    const handle = (color: string, r: number, key: string) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
      m.renderOrder = 20;
      m.userData.key = key;
      byKey.set(key, m);
      return m;
    };

    const sync = () => {
      const { doc: d, sel: s, mode: md, rigMode: rm } = st.current;
      const rg = d.rig ?? st.current.autoRig ?? KB002_RIG;
      tc.detach();
      for (const c of [...world.children]) {
        world.remove(c);
        dispose(c);
      }
      for (const c of [...rigMarks.children]) {
        rigMarks.remove(c);
        dispose(c);
      }
      byKey.clear();
      for (const i of activeItems(d.items, scene.theme)) {
        const o = new THREE.Group();
        o.position.set(i.x, i.z, -i.y);
        o.rotation.y = rad(i.yaw);
        o.add(shape(i));
        o.userData.key = `item:${i.id}`;
        byKey.set(o.userData.key, o);
        world.add(o);
      }
      bike.visible = Boolean(d.bike);
      const bx = d.bike?.[0] ?? 0;
      const by = d.bike?.[1] ?? 0;
      bike.position.set(bx, d.bikeLift, -by);
      bike.rotation.set(rad(d.bikeRoll), rad(d.bikeYaw - 90), rad(-d.bikePitch), "YXZ");
      byKey.set("product", bike);
      if (rm && d.bike) for (const r of RIG_KEYS) rigMarks.add(handle(r.color, 0.03, `rig:${r.k}`).translateX(rigLocal(rg, r.k)[0]).translateY(rigLocal(rg, r.k)[1]).translateZ(rigLocal(rg, r.k)[2]));
      const yawR = rad(d.bikeYaw);
      for (const f of d.figures) {
        const ride = f.onProduct && Boolean(d.bike);
        const root = new THREE.Group();
        root.userData.key = `fig:${f.id}`;
        root.add(buildFigure(f.kind, effPose(f, Boolean(d.bike)), { ride: rideOf(rg), custom: f.custom, h: f.h }));
        if (ride) {
          root.rotation.y = yawR + Math.PI;
          root.position.set(bx + Math.sin(yawR) * rg.seatBack, 0, -by + Math.cos(yawR) * rg.seatBack);
        } else {
          root.rotation.y = Math.PI - rad(f.yaw);
          root.position.set(bx + f.dx, 0, -(by + f.dy));
        }
        byKey.set(root.userData.key, root);
        if (!rm && (s === root.userData.key || s?.startsWith(`joint:${f.id}:`))) {
          const base = presetPose(f.kind, effPose(f, Boolean(d.bike)), rideOf(rg), f.h);
          for (const j of JOINTS) {
            const p = f.custom?.[j.id] ?? base[j.id];
            root.add(handle(j.id === "hip" ? "#f472b6" : "#38bdf8", 0.03, `joint:${f.id}:${j.id}`).translateX(p[0]).translateY(p[1]).translateZ(p[2]));
          }
        }
        world.add(root);
      }
      const target = s ? byKey.get(s) : null;
      if (target && !st.current.ro && !(s?.startsWith("fig:") && d.figures.find((f) => `fig:${f.id}` === s)?.onProduct && d.bike)) {
        const point = Boolean(s?.startsWith("joint:") || s?.startsWith("rig:"));
        const m: Mode = point ? "translate" : md === "scale" && !s?.startsWith("item:") ? "translate" : md;
        tc.setMode(m);
        tc.showX = m !== "rotate";
        tc.showZ = m !== "rotate";
        tc.showY = m === "rotate" || point || Boolean(s?.startsWith("item:"));
        tc.setSpace(m === "scale" ? "local" : "world");
        tc.attach(target);
      }
    };

    const finishDrag = () => {
      const o = tc.object;
      const key = o?.userData.key as string | undefined;
      if (!o || !key) return;
      const d = st.current.doc;
      const rg = d.rig ?? st.current.autoRig ?? KB002_RIG;
      let n: Doc = d;
      if (key === "product") n = { ...d, bike: [r2(o.position.x), r2(-o.position.z)], bikeYaw: Math.round(wrap(deg(o.rotation.y) + 90)) };
      else if (key.startsWith("item:")) {
        const id = key.slice(5);
        n = {
          ...d,
          items: d.items.map((i) =>
            i.id === id
              ? { ...i, x: r2(o.position.x), y: r2(-o.position.z), z: r2(Math.max(0, o.position.y)), yaw: Math.round(wrap(deg(o.rotation.y))), w: r2(Math.max(0.05, i.w * o.scale.x)), h: r2(Math.max(0.05, i.h * o.scale.y)), d: r2(Math.max(0.05, i.d * o.scale.z)) }
              : i,
          ),
        };
      } else if (key.startsWith("fig:")) {
        const id = key.slice(4);
        const bx = d.bike?.[0] ?? 0;
        const by = d.bike?.[1] ?? 0;
        n = { ...d, figures: d.figures.map((f) => (f.id === id ? { ...f, dx: r2(o.position.x - bx), dy: r2(-o.position.z - by), yaw: Math.round(wrap(deg(Math.PI - o.rotation.y))) } : f)) };
      } else if (key.startsWith("joint:")) {
        const [, fid, j] = key.split(":");
        const p: P3 = [r3(o.position.x), r3(Math.max(0, o.position.y)), r3(o.position.z)];
        n = { ...d, figures: d.figures.map((f) => (f.id === fid ? { ...f, custom: { ...f.custom, [j as JointId]: p } } : f)) };
      } else if (key.startsWith("rig:")) n = { ...d, rig: rigFrom(rg, key.slice(4) as RigKey, o.position) };
      if (n !== d) commitRef.current(n);
    };

    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || tc.dragging) return;
      const r = el.getBoundingClientRect();
      const active = st.current.shotView ? shotCam : cam;
      const vp = viewport();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left - vp.x) / vp.w) * 2 - 1, -(((e.clientY - r.top - vp.y) / vp.h) * 2 - 1)), active);
      const hits = ray.intersectObjects([world, bike], true);
      const keyOf = (o: THREE.Object3D | null): string | null => {
        for (let x = o; x; x = x.parent) if (x.userData.key) return x.userData.key as string;
        return null;
      };
      const keys = hits.map((h) => keyOf(h.object)).filter((k): k is string => Boolean(k));
      const pick = keys.find((k) => k.startsWith("joint:") || k.startsWith("rig:")) ?? keys[0] ?? null;
      setSelRef.current(pick);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);

    const viewport = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!st.current.shotView) return { x: 0, y: 0, w, h };
      const vw = Math.min(w, (h * 9) / 16);
      return { x: (w - vw) / 2, y: 0, w: vw, h };
    };
    let raf = 0;
    const frame = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const sz = renderer.getSize(new THREE.Vector2());
      if (w && h && (sz.x !== w || sz.y !== h)) renderer.setSize(w, h, false);
      const vp = viewport();
      const active = st.current.shotView ? shotCam : cam;
      if (tc.camera !== active) tc.camera = active;
      orbit.enabled = !st.current.shotView && !tc.dragging;
      camHelper.visible = !st.current.shotView;
      cam.aspect = w / Math.max(h, 1);
      cam.updateProjectionMatrix();
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, w, h);
      renderer.setScissor(0, 0, w, h);
      renderer.setClearColor("#0a0a0a");
      renderer.clear();
      renderer.setViewport(vp.x, h - vp.y - vp.h, vp.w, vp.h);
      renderer.setScissor(vp.x, h - vp.y - vp.h, vp.w, vp.h);
      renderer.render(s3, active);
      raf = requestAnimationFrame(frame);
    };
    frame();
    api.current = { sync };
    sync();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      // three 0.169 的 TransformControls.dispose() 会调用不存在的 this.traverse，这里手动清理
      tc.detach();
      tc.disconnect();
      s3.remove(helper);
      helper.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      el.removeEventListener("wheel", wheelGate, { capture: true });
      orbit.dispose();
      renderer.dispose();
    };
    // 场景只建一次；之后靠 sync() 按 doc 重建物件
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitRef = useRef(commit);
  commitRef.current = commit;
  const setSelRef = useRef(setSel);
  setSelRef.current = setSel;

  useEffect(() => {
    api.current?.sync();
  }, [doc, sel, mode, rigMode, autoRig]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,select,textarea")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) undoRef.current.redo();
        else undoRef.current.undo();
      } else if (e.key === "w") setMode("translate");
      else if (e.key === "e") setMode("rotate");
      else if (e.key === "r") setMode("scale");
      else if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selFig = doc.figures.find((f) => sel === `fig:${f.id}` || sel?.startsWith(`joint:${f.id}:`)) ?? null;
  const selItem = doc.items.find((i) => sel === `item:${i.id}`) ?? null;
  const patchFig = (p: Partial<FigureSpec>) => selFig && commit((d) => ({ ...d, figures: d.figures.map((f) => (f.id === selFig.id ? { ...f, ...p } : f)) }));
  const addFig = (kind: FigureKind) => {
    const id = `f${Date.now().toString(36)}`;
    commit((d) => ({ ...d, figures: [...d.figures, { id, kind, pose: "stand", onProduct: false, dx: kind === "adult" ? 1 : 0.6, dy: -0.4, yaw: 0 }] }));
    setSel(`fig:${id}`);
  };
  const addItem = (type: string) => {
    const it = newItem(type, (doc.bike?.[0] ?? 0) + 1.2, (doc.bike?.[1] ?? 0) + 1.2);
    commit((d) => ({ ...d, items: [...d.items, it] }));
    setSel(`item:${it.id}`);
  };
  const del = () => {
    if (selFig) commit((d) => ({ ...d, figures: d.figures.filter((f) => f.id !== selFig.id) }));
    else if (selItem) commit((d) => ({ ...d, items: d.items.filter((i) => i.id !== selItem.id) }));
    setSel(null);
  };
  const base = selFig ? presetPose(selFig.kind, effPose(selFig, Boolean(doc.bike)), rideOf(rigUse), selFig.h) : null;

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const itemsChanged = !same(doc.items, init.current.items);
  const poseOf = (d: Doc) => [d.figures, d.bike, d.bikeYaw, d.bikeLift, d.bikePitch, d.bikeRoll, d.bikeGround];
  const layoutChanged = !same(poseOf(doc), poseOf(init.current));
  /** 按这个姿势让产品最低点刚好贴地（算模型转过以后的包围盒） */
  const groundLift = (pitch: number, roll: number) => {
    const b = bikeRef.current;
    if (!b) return 0;
    const p = b.position.clone();
    const r = b.rotation.clone();
    b.position.set(0, 0, 0);
    b.rotation.set(rad(roll), rad(docRef.current.bikeYaw - 90), rad(-pitch), "YXZ");
    b.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const c of b.children) if (!c.userData.rig) box.expandByObject(c, true);
    b.position.copy(p);
    b.rotation.copy(r);
    b.updateMatrixWorld(true);
    return box.isEmpty() ? 0 : r2(Math.max(0, -box.min.y));
  };
  /** 改俯仰 / 侧倾时自动贴地，悬空高度不变（传了 clear 就用它） */
  const setBikeAngles = (pitch: number, roll: number, clear?: number) =>
    commit((d) => {
      const g = groundLift(pitch, roll);
      const c = clear ?? Math.max(0, d.bikeLift - d.bikeGround);
      return { ...d, bikePitch: pitch, bikeRoll: roll, bikeGround: g, bikeLift: r2(g + c) };
    });
  const rigChanged = !same(doc.rig, init.current.rig);
  const anyChanged = itemsChanged || layoutChanged || rigChanged;
  useEffect(() => {
    onDirty?.(anyChanged && !(compact && locked));
  }, [anyChanged, onDirty, compact, locked]);
  const save = () =>
    start(async () => {
      setMsg("");
      const notes: string[] = [];
      if (layoutChanged) {
        if (locked) return setMsg(`⚠ ${locked}`);
        const r = await saveShortLayoutAction(videoId, shotCode, { ...layout, figures: doc.figures, figure: doc.figures.length > 0, bike: doc.bike, bikeYaw: doc.bikeYaw, bikeLift: doc.bikeLift, bikePitch: doc.bikePitch, bikeRoll: doc.bikeRoll, bikeGround: doc.bikeGround });
        if (r.error) return setMsg(`⚠ ${r.error}`);
        if (!itemsChanged && !rigChanged) {
          setMsg("已保存，正在回场地地图自动更新 3D 构图…");
          return onSaved ? onSaved() : router.push(`${backHref}&capture=1`);
        }
        notes.push("人偶和产品位置已存到本镜");
      }
      if (rigChanged && doc.rig && modelId) {
        const r = await saveProductRigAction(modelId, doc.rig);
        if (r.error) return setMsg(`⚠ ${r.error}`);
        notes.push("产品接触点已保存（这个产品所有镜头共用）");
      }
      if (itemsChanged) {
        const c = await sceneConflictsAction(scene.id, doc.items);
        if (c.error) return setMsg(`⚠ ${c.error}`);
        if (c.result?.length && !await askConfirm(`这些已锁定镜头的画面里能看到被改动的物件（它们继续用旧版本，不受影响，但新旧画面会对不上）：\n${c.result.join("\n")}\n\n仍然存成新版本吗？`)) return setMsg(notes.join("；") || "家具改动没有保存");
        const r = await saveSceneVersionAction(scene.id, doc.items, `摆放界面修改（基于 v${scene.v}）`, undefined, locked ? undefined : { videoId, shotId: shotCode });
        if (r.error) return setMsg(`⚠ ${r.error}`);
        notes.push(`家具已存为「${scene.name}」v${r.result}${locked ? "（本镜已锁定，继续用旧版本）" : "，本镜已改用新版本"}`);
      }
      if (layoutChanged) {
        setMsg(`${notes.join("；")}；正在回场地地图自动更新 3D 构图…`);
        return onSaved ? onSaved() : router.push(`${backHref}&capture=1`);
      }
      setMsg(notes.join("；") || "没有改动");
      router.refresh();
    });

  useEffect(() => {
    if (saveSignal) save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);
  const btn = (on: boolean) => `rounded px-2 py-1 text-xs ${on ? "bg-amber-400 text-black" : "border border-white/15 text-neutral-300"}`;
  const vHeader = (
    <>
        <div className="space-y-1 rounded-xl border border-white/10 bg-neutral-900/70 p-3">
          <div className="flex flex-wrap gap-1">
            {shots.map((s) => (
              <a key={s.code} href={s.href} className={btn(s.code === shotCode)}>
                {s.label}
              </a>
            ))}
          </div>
          <p className="text-white">{shotLabel}</p>
          <p className="text-neutral-400">
            场地：{scene.name} v{scene.v} · 主题：{scene.themeLabel}
          </p>
          {locked ? <p className="text-amber-300">{locked}（人偶和产品只能看不能存；家具改动会存成新版本，本镜继续用旧版本）</p> : null}
        </div>

    </>
  );
  const vView = (
    <>
        <div className="space-y-2 rounded-xl border border-white/10 bg-neutral-900/70 p-3">
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn(!shotView)} onClick={() => setShotView(false)}>
              自由视角
            </button>
            <button type="button" className={btn(shotView)} onClick={() => setShotView(true)}>
              镜头视角
            </button>
            {ro ? null : (
              <>
            <span className="mx-1" />
            <button type="button" disabled={!past.length} onClick={undo} className={`${btn(false)} disabled:opacity-40`}>
              撤销
            </button>
            <button type="button" disabled={!future.length} onClick={redo} className={`${btn(false)} disabled:opacity-40`}>
              重做
            </button>
              </>
            )}
          </div>
          {ro ? null : (
            <>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn(mode === "translate")} onClick={() => setMode("translate")}>
              移动 W
            </button>
            <button type="button" className={btn(mode === "rotate")} onClick={() => setMode("rotate")}>
              转向 E
            </button>
            <button type="button" className={btn(mode === "scale")} onClick={() => setMode("scale")}>
              大小 R（家具）
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">在 3D 里点物件选中，拖箭头 / 圆环。左键拖空白处转视角，右键平移，滚轮缩放。Ctrl/⌘+Z 撤销。</p>
            </>
          )}
        </div>

    </>
  );
  const vObjects = (
    <>
        <div className="space-y-1 rounded-xl border border-white/10 bg-neutral-900/70 p-3">
          <p className="text-neutral-400">物件</p>
          {doc.bike ? (
            <button type="button" className={btn(sel === "product")} onClick={() => setSel("product")}>
              产品
            </button>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {doc.figures.map((f, i) => (
              <button key={f.id} type="button" className={btn(selFig?.id === f.id)} onClick={() => setSel(`fig:${f.id}`)}>
                人偶{i + 1}·{members.find((m) => m.id === f.memberId)?.name ?? (f.kind === "adult" ? "大人" : "小孩")}
              </button>
            ))}
            <button type="button" className={btn(false)} onClick={() => addFig("child")}>
              + 小孩
            </button>
            <button type="button" className={btn(false)} onClick={() => addFig("adult")}>
              + 大人
            </button>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {activeItems(doc.items, scene.theme).map((i) => (
              <button key={i.id} type="button" className={btn(sel === `item:${i.id}`)} onClick={() => setSel(`item:${i.id}`)}>
                {findItemType(i.type).label}
              </button>
            ))}
          </div>
          <select value="" onChange={(e) => e.target.value && addItem(e.target.value)} className="w-full rounded border border-white/10 bg-neutral-950 px-1 py-1 text-white">
            <option value="">+ 加家具…</option>
            {ITEM_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

    </>
  );
  const vSel = (
    <>
        {selFig && base ? (
          <div className="space-y-2 rounded-xl border border-amber-400/30 bg-neutral-900/70 p-3">
            <div className="flex flex-wrap gap-1">
              {FIGURE_POSES.filter((p) => p.id !== "ride" || doc.bike).map((p) => (
                <button key={p.id} type="button" className={btn(effPose(selFig, Boolean(doc.bike)) === p.id)} onClick={() => patchFig({ pose: p.id, onProduct: p.id === "ride" && Boolean(doc.bike), custom: undefined })}>
                  {p.label}
                </button>
              ))}
            </div>
            {selFig.custom ? (
              <p className="text-[11px] text-amber-200">手脚拖过：自定义（从「{FIGURE_POSES.find((p) => p.id === effPose(selFig, Boolean(doc.bike)))?.label ?? selFig.pose}」改过来）</p>
            ) : null}
            <ActionBox value={selFig.action ?? ""} onChange={(v) => patchFig({ action: v || undefined, actionEn: undefined })} />
            {members.length ? (
              <label className="block text-neutral-400">
                是谁（家庭库）
                <select
                  value={selFig.memberId ?? ""}
                  onChange={(e) => {
                    const m = members.find((x) => x.id === e.target.value);
                    patchFig(m ? { memberId: m.id, kind: m.kind, h: m.h, custom: undefined } : { memberId: undefined, h: undefined, custom: undefined });
                  }}
                  className="w-full rounded border border-white/10 bg-neutral-950 px-1 py-0.5 text-white"
                >
                  <option value="">不绑定（大人 1.75 米 / 小孩 0.95 米）</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-[11px] text-neutral-500">这条视频没选家庭：在视频设定里选了家庭，人偶就能绑定成员、按身高缩放。</p>
            )}
            <div className="flex gap-1">
              <button type="button" className={btn(selFig.kind === "child")} onClick={() => patchFig({ kind: "child", custom: undefined, memberId: undefined, h: undefined })}>
                小孩
              </button>
              <button type="button" className={btn(selFig.kind === "adult")} onClick={() => patchFig({ kind: "adult", custom: undefined, memberId: undefined, h: undefined })}>
                大人
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              {selFig.onProduct && doc.bike ? "骑在产品上：跟着产品走。" : "拖人偶脚下的箭头挪位置，切到「转向」拖圆环转身。"}拖<span className="text-sky-300">蓝球</span>（手、脚）和<span className="text-pink-300">粉球</span>
              （臀部），膝盖和手肘自动弯。
            </p>
            {!(selFig.onProduct && doc.bike) ? (
              <div className="flex gap-1 text-neutral-400">
                {(
                  [
                    ["dx", "离产品往东 米", 0.05],
                    ["dy", "往北 米", 0.05],
                    ["yaw", "面朝 °", 5],
                  ] as const
                ).map(([k, label, step]) => (
                  <label key={k} className="flex-1">
                    {label}
                    <input type="number" step={step} value={selFig[k]} onChange={(e) => patchFig({ [k]: Number(e.target.value) })} className="w-full rounded border border-white/10 bg-neutral-950 px-1 py-0.5 text-white" />
                  </label>
                ))}
              </div>
            ) : null}
            {(["lean", "head"] as const).map((k) => (
              <label key={k} className="block text-neutral-400">
                <span className="flex justify-between">
                  <span>{k === "lean" ? "身体前倾" : "头转向（+ = 向左）"}</span>
                  <span className="text-white">{Math.round(deg(selFig.custom?.[k] ?? base[k]))}°</span>
                </span>
                <input type="range" min={k === "lean" ? -30 : -80} max={k === "lean" ? 60 : 80} step={1} value={Math.round(deg(selFig.custom?.[k] ?? base[k]))} onChange={(e) => patchFig({ custom: { ...selFig.custom, [k]: rad(Number(e.target.value)) } })} className="w-full accent-amber-400" />
              </label>
            ))}
            <div className="flex gap-2">
              <button type="button" disabled={!selFig.custom} onClick={() => patchFig({ custom: undefined })} className={`${btn(false)} disabled:opacity-40`}>
                恢复预设姿态
              </button>
              <button type="button" onClick={del} className="text-rose-300">
                删除人偶
              </button>
            </div>
          </div>
        ) : null}
        {selItem ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-neutral-900/70 p-3">
            <span>
              {findItemType(selItem.type).label} {selItem.w}×{selItem.d}×{selItem.h} 米
            </span>
            <button type="button" onClick={del} className="ml-auto text-rose-300">
              删除
            </button>
          </div>
        ) : null}

    </>
  );
  const clear = r2(Math.max(0, doc.bikeLift - doc.bikeGround));
  const vProduct =
    doc.bike && sel === "product" ? (
      <div className="space-y-2 rounded-xl border border-amber-400/30 bg-neutral-900/70 p-3">
        <p className="text-white">产品 · 姿势</p>
        <div className="flex flex-wrap gap-1">
          {PRODUCT_POSES.map(([n, pitch, roll, extra]) => (
            <button key={n} type="button" className={btn(doc.bikePitch === pitch && doc.bikeRoll === roll && clear === extra)} onClick={() => setBikeAngles(pitch, roll, extra)}>
              {n}
            </button>
          ))}
        </div>
        <Range label="朝向" value={Math.round(wrap(doc.bikeYaw))} min={-180} max={180} step={1} unit="°" onChange={(v) => commit((d) => ({ ...d, bikeYaw: v }))} />
        <Range label="离地高度（0 = 贴着地面）" value={clear} min={0} max={1.5} step={0.05} unit="米" onChange={(v) => commit((d) => ({ ...d, bikeLift: r2(d.bikeGround + v) }))} />
        <Range label="俯仰（+ = 车头抬起）" value={doc.bikePitch} min={-90} max={90} step={1} unit="°" onChange={(v) => setBikeAngles(v, doc.bikeRoll)} />
        <Range label="侧倾（+ = 往左倒）" value={doc.bikeRoll} min={-180} max={180} step={1} unit="°" onChange={(v) => setBikeAngles(doc.bikePitch, v)} />
        <p className="text-[11px] text-neutral-500">水平位置：在 3D 里拖箭头。转向：点上方「转向」再拖圆环，或拖上面的「朝向」。</p>
      </div>
    ) : null;
  const vRig = (
    <>
        {doc.bike && modelId ? (
          <div className="space-y-2 rounded-xl border border-white/10 bg-neutral-900/70 p-3">
            <button type="button" className={btn(rigMode)} onClick={() => (setRigMode((m) => !m), setSel(null))}>
              {rigMode ? "退出接触点模式" : "校正产品接触点"}
            </button>
            {rigMode ? (
              <>
                <p className="text-[11px] text-neutral-500">
                  拖产品上的点：<span className="text-amber-300">座位</span>、<span className="text-cyan-300">握把</span>、<span className="text-lime-300">脚</span>。左右会自动对称，骑车的人偶跟着变。这个产品所有镜头共用。
                </p>
                <button type="button" disabled={!autoRig} onClick={() => autoRig && commit((d) => ({ ...d, rig: autoRig }))} className={`${btn(false)} disabled:opacity-40`}>
                  按模型尺寸自动估算
                </button>
              </>
            ) : null}
          </div>
        ) : null}

    </>
  );
  const vSave = (
    <>
        <div className="space-y-2 rounded-xl border border-white/10 bg-neutral-900/70 p-3">
          <button type="button" disabled={pending || !(itemsChanged || layoutChanged || rigChanged)} onClick={save} className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black disabled:opacity-40">
            {pending ? "保存中…" : layoutChanged && !locked ? "保存（会自动更新 3D 构图）" : "保存"}
          </button>
          <p className="text-[11px] text-neutral-500">
            {[layoutChanged && "人偶 / 产品", itemsChanged && "家具（存成场地新版本）", rigChanged && "产品接触点"].filter(Boolean).join("、") || "还没有改动"}
          </p>
          {msg ? <p className="text-neutral-300">{msg}</p> : null}
          <a href={backHref} className="block text-amber-300 underline">
            ← 回机位 · 构图（不保存）
          </a>
        </div>
    </>
  );
  const [askOk, setAskOk] = useState(false);
  const askBrain = () => {
    setAskOk(false);
    setBrain(null);
    setBrainMsg("大脑在想…（半分钟到两分钟）");
    const d = docRef.current;
    setThinking(true);
    void (async () => {
      const r = await brainStageAction(videoId, shotCode, ask, { figures: d.figures, bike: d.bike, bikeYaw: d.bikeYaw, items: d.items, theme: scene.theme }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : "大脑调整失败", result: undefined }));
      setThinking(false);
      if (r.error || !r.result) return setBrainMsg(`⚠ ${r.error ?? "大脑没有返回结果"}`);
      const p = r.result;
      commit((x) => ({ ...x, figures: p.figures, bike: p.bike, bikeYaw: p.bikeYaw }));
      setSel(null);
      setBrain(p);
      setBrainMsg(`已在 3D 里改好，还没保存。不对就点「撤销」或再说一句。本次花费 $${p.usd.toFixed(3)}`);
    })();
  };
  const vBrain = ro ? null : (
    <div className="space-y-2 rounded-xl border border-violet-400/30 bg-violet-400/5 p-3">
      <p className="text-white">跟大脑说一句 <span className="text-[11px] text-neutral-400">调人偶和产品（家具在「场地」里改，摄影机在右边「镜头」里调）</span></p>
      <div className="flex gap-2">
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="比如：小孩骑在车上，大人站在旁边，其他细节你帮我调" className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-950 px-2 py-1 text-white" />
        <button type="button" disabled={thinking || askOk || ask.trim().length < 2} onClick={() => setAskOk(true)} className="rounded-lg bg-violet-400 px-3 py-1 font-medium text-black disabled:opacity-40">
          {thinking ? "想中…" : "让大脑调"}
        </button>
      </div>
      {askOk ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-violet-400/40 p-2 text-neutral-200">
          <span>调用大脑（Kimi）1 次，实测约 $0.02–$0.07（按实际用量记），不出图。改完只在 3D 里预览，不会自动保存。</span>
          <button type="button" onClick={askBrain} className="rounded bg-violet-400 px-2 py-0.5 font-medium text-black">
            确定，调用
          </button>
          <button type="button" onClick={() => setAskOk(false)} className="rounded border border-white/10 px-2 py-0.5">
            取消
          </button>
        </div>
      ) : null}
      {brainMsg ? <p className="text-neutral-300">{brainMsg}</p> : null}
      {brain ? (
        <div className="space-y-1 text-[12px]">
          {brain.summary ? <p className="text-white">{brain.summary}</p> : null}
          {brain.changes.length ? (
            <ul className="list-disc pl-4 text-neutral-300">
              {brain.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
          {brain.camera ? <p className="text-sky-300">摄影机建议（要你在右边手动调）：{brain.camera}</p> : null}
          {brain.text.map((c, i) => (
            <p key={i} className="text-neutral-400">分镜文字建议（没改，要你在镜头里手动改）：{c}</p>
          ))}
          {brain.cannot.map((c, i) => (
            <p key={i} className="text-amber-300">做不到：{c}</p>
          ))}
          {brain.questions.map((q, i) => (
            <p key={i} className="text-violet-200">问你：{q}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
  if (compact) {
    return (
      <div className="space-y-2 text-xs text-neutral-300">
        <div className="grid gap-2 md:grid-cols-2">
          {vView}
          {ro ? null : vObjects}
        </div>
        {vBrain}
        <canvas ref={canvas} className="h-[70vh] w-full touch-none rounded-xl border border-white/10 bg-black" />
        <fieldset disabled={ro} className={`grid min-w-0 gap-2 md:grid-cols-2 ${ro ? "opacity-60" : ""}`}>
          {vProduct}
          {vSel}
          {ro ? null : vRig}
          {!vProduct && !selFig && !selItem ? <p className="text-neutral-500">点 3D 里的人、车或家具选中它，这里会出现它的位置和姿势。</p> : null}
        </fieldset>
        {msg ? <p className="text-neutral-300">{msg}</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-3 text-xs text-neutral-300">
        {vHeader}
        {vView}
        {vBrain}
        {vObjects}
        {vSel}
        {vRig}
        {vSave}
      </aside>
      <canvas ref={canvas} className="h-[78vh] w-full touch-none rounded-xl border border-white/10 bg-black" />
    </div>
  );
}

/** 人偶「动作」栏：这个人在做什么，用大白话写；提示词里的动作只看这里 */
function ActionBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-neutral-400">
      动作（这个人在做什么，一句大白话；首帧提示词里的动作只看这里）
      <textarea
        value={value}
        rows={2}
        placeholder="比如：双手握住车把，把车扶稳"
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-white/10 bg-neutral-950 px-1 py-0.5 text-white"
      />
    </label>
  );
}
