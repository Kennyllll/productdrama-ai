"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { compareModelAction, flipStepUpAction, reviewModelAction, turnModelAction } from "@/app/model-actions";
import { Tag } from "@/components/ui";
import { RIG_KEYS, rigFrom, rigLocal, type ProductRig, type RideKind, type RigKey } from "@/lib/figures";
import { measureRig } from "@/lib/rig-measure";
import { bestYaw, maskOf, overlap, photoFg, YAWS, type Yaw } from "@/lib/silhouette";

const btn = "rounded-md border border-white/15 px-2.5 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40";
const field = "rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none";

/** 和 3D 编辑器、Blender 渲染同一个惯例：车头朝 -X，上方 +Y，产品自己的左边在 +Z */
const VIEWS: Record<string, [number, number, number]> = {
  正面: [-1, 0.15, 0],
  背面: [1, 0.15, 0],
  左侧: [0, 0.15, 1],
  右侧: [0, 0.15, -1],
  顶部: [0.01, 1, 0],
  底部: [0.01, -1, 0],
  "左前 45°": [-0.7, 0.2, 0.7],
  "右前 45°": [-0.7, 0.2, -0.7],
  "左后 45°": [0.7, 0.2, 0.7],
  "右后 45°": [0.7, 0.2, -0.7],
};
/** 视图方块：从上往下看，车头朝上 */
const CUBE: [string, string][] = [
  ["左前 45°", "左前"], ["正面", "前"], ["右前 45°", "右前"],
  ["左侧", "左"], ["顶部", "顶"], ["右侧", "右"],
  ["左后 45°", "左后"], ["背面", "后"], ["右后 45°", "右后"],
];

type RigState = { rig: ProductRig; how: "auto" | "guess" | "edit" | "saved" };
type Api = {
  setView: (v: string) => void;
  setMarks: (g: ProductRig | null, sel: RigKey | null, edit: boolean) => void;
  remeasure: () => void;
  capture: (v: string) => string;
  silhouette: (v: string, yaw: Yaw) => Uint8Array | null;
  /** 现在看着的方向如果是车头，要把车转多少度才朝前 */
  frontYaw: () => Yaw;
};

function Viewer({ url, view, kind, rig, onRig, sel, onPick, editRig, withRig, apiRef, onLoaded }: {
  url: string; view: string; kind: RideKind; rig: ProductRig | null; onRig: (r: RigState) => void; sel: RigKey | null; onPick: (k: RigKey | null) => void;
  editRig: boolean; withRig: boolean; apiRef: { current: Api | null }; onLoaded: (ok: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ rig, onRig, kind, sel, editRig, view, onPick, onLoaded });
  live.current = { rig, onRig, kind, sel, editRig, view, onPick, onLoaded };
  const [msg, setMsg] = useState("加载模型中…");

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color("#d9d9d9");
    scene.background = bgColor;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.001, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    let center = new THREE.Vector3();
    let radius = 1;
    let fit = 3.2;
    let model: THREE.Object3D | null = null;
    const place = (cam: THREE.PerspectiveCamera, v: string, c: THREE.Vector3) => {
      const d = new THREE.Vector3(...(VIEWS[v] ?? VIEWS["左前 45°"])).normalize();
      cam.position.copy(c).addScaledVector(d, fit);
      cam.lookAt(c);
    };
    const setView = (v: string) => {
      place(camera, v, center);
      controls.target.copy(center);
      controls.update();
    };
    // 接触点：5 个彩色小球，放在和 3D 编辑器同一个产品坐标里（模型中心、贴地、车头 -x）
    const marks = new THREE.Group();
    scene.add(marks);
    const meshes = new Map<RigKey, THREE.Mesh>();
    let loaded = false;
    let pts: number[] = [];
    const tc = new TransformControls(camera, renderer.domElement);
    tc.setSize(0.7);
    const helper = tc.getHelper();
    scene.add(helper);
    tc.addEventListener("dragging-changed", (e) => {
      controls.enabled = !e.value;
    });
    tc.addEventListener("objectChange", () => {
      const o = tc.object;
      const g = live.current.rig;
      if (o && g) live.current.onRig({ rig: rigFrom(g, o.userData.key as RigKey, o.position), how: "edit" });
    });
    const setMarks = (g: ProductRig | null, s: RigKey | null, edit: boolean) => {
      if (!loaded) return;
      marks.visible = !!g;
      if (!g) return void tc.detach();
      for (const r of RIG_KEYS) {
        let m = meshes.get(r.k);
        if (!m) {
          m = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.035, 16, 12), new THREE.MeshBasicMaterial({ color: r.color, depthTest: false }));
          m.renderOrder = 10;
          m.userData.key = r.k;
          meshes.set(r.k, m);
          marks.add(m);
        }
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.set(s === r.k ? "#ffffff" : r.color);
        if (!(tc.dragging && tc.object === m)) m.position.set(...rigLocal(g, r.k));
      }
      const want = edit && s ? meshes.get(s) ?? null : null;
      if (want !== (tc.object ?? null)) {
        if (want) tc.attach(want);
        else tc.detach();
      }
    };
    const remeasure = () => {
      if (pts.length) {
        const r = measureRig(pts, live.current.kind);
        live.current.onRig({ rig: r.rig, how: r.auto ? "auto" : "guess" });
      }
    };
    // 点模型上的彩色点 = 选中它拖动
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || tc.dragging || !live.current.editRig) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(marks.children, false)[0];
      if (hit) live.current.onPick(hit.object.userData.key as RigKey);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const extras: THREE.Object3D[] = [marks, helper];
    const hideExtras = () => {
      const was = extras.map((o) => o.visible);
      extras.forEach((o) => (o.visible = false));
      return () => extras.forEach((o, i) => (o.visible = was[i]));
    };
    // 截一张这个角度的模型图（不带接触点、箭头和格子），给对照表和看图检查
    const capture = (v: string) => {
      const restore = hideExtras();
      setView(v);
      renderer.render(scene, camera);
      const out = renderer.domElement.toDataURL("image/jpeg", 0.9);
      restore();
      setView(live.current.view);
      return out;
    };
    // 黑色剪影（白底），按 yaw 临时转一下模型：自动判断车头朝向用
    const rt = new THREE.WebGLRenderTarget(128, 128);
    const silCam = new THREE.PerspectiveCamera(35, 1, 0.001, 1000);
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const silhouette = (v: string, yaw: Yaw) => {
      if (!model) return null;
      const restore = hideExtras();
      const rot = model.rotation.y;
      model.rotation.y = (yaw * Math.PI) / 180;
      model.updateMatrixWorld(true);
      const c = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      silCam.near = radius / 100;
      silCam.far = radius * 100;
      silCam.updateProjectionMatrix();
      place(silCam, v, c);
      scene.background = new THREE.Color("#ffffff");
      scene.overrideMaterial = black;
      renderer.setRenderTarget(rt);
      renderer.render(scene, silCam);
      const px = new Uint8Array(128 * 128 * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, 128, 128, px);
      renderer.setRenderTarget(null);
      scene.overrideMaterial = null;
      scene.background = bgColor;
      model.rotation.y = rot;
      model.updateMatrixWorld(true);
      restore();
      return maskOf(px, 128, 128, (r) => r < 128, true);
    };
    const frontYaw = (): Yaw => {
      const d = camera.position.clone().sub(controls.target);
      if (Math.abs(d.x) >= Math.abs(d.z)) return d.x < 0 ? 0 : 180;
      return d.z > 0 ? -90 : 90;
    };
    apiRef.current = { setView, setMarks, remeasure, capture, silhouette, frontYaw };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    };
    loop();
    new GLTFLoader().load(
      url,
      (g) => {
        model = g.scene;
        scene.add(g.scene);
        const box = new THREE.Box3().setFromObject(g.scene);
        const size = box.getSize(new THREE.Vector3());
        center = box.getCenter(new THREE.Vector3());
        radius = Math.max(size.x, size.y, size.z) / 2 || 1;
        // 整个包围球都放进画面，留一点边
        fit = ((size.length() / 2 || 1) / Math.sin((17.5 * Math.PI) / 180)) * 1.08;
        // 地面在模型自己的 y = 0：车轮应该正好落在格子上
        const grid = new THREE.GridHelper(radius * 6, 12, 0x555555, 0x999999);
        scene.add(grid);
        extras.push(grid);
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(center.x, box.max.y + radius * 0.08, center.z), radius * 1.6, 0xe11d48);
        scene.add(arrow);
        extras.push(arrow);
        camera.near = radius / 100;
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        setView(live.current.view);
        setMsg("");
        if (withRig) {
          g.scene.updateMatrixWorld(true);
          const v = new THREE.Vector3();
          g.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const p = m.geometry.getAttribute("position");
            for (let i = 0; i < p.count; i++) {
              v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
              pts.push(v.x - center.x, v.y - box.min.y, v.z - center.z);
            }
          });
          marks.position.set(center.x, box.min.y, center.z);
          loaded = true;
          if (live.current.rig) setMarks(live.current.rig, live.current.sel, live.current.editRig);
          else remeasure();
        }
        requestAnimationFrame(() => live.current.onLoaded(true));
      },
      undefined,
      () => {
        setMsg("模型加载失败：刷新一下；还不行就退回重建");
        live.current.onLoaded(false);
      },
    );
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      pts = [];
      apiRef.current = null;
      // three 0.169 的 TransformControls.dispose() 会调用不存在的 this.traverse，这里手动清理
      tc.detach();
      tc.disconnect();
      scene.remove(helper);
      controls.dispose();
      rt.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    apiRef.current?.setView(view);
  }, [view, apiRef]);

  useEffect(() => {
    apiRef.current?.setMarks(rig, sel, editRig);
  }, [rig, sel, editRig, apiRef]);

  return (
    <div ref={host} className="absolute inset-0">
      {msg ? <p className="absolute inset-0 grid place-items-center text-sm text-neutral-600">{msg}</p> : null}
    </div>
  );
}

function ViewCube({ view, onView }: { view: string; onView: (v: string) => void }) {
  return (
    <div className="grid w-[6.75rem] grid-cols-3 overflow-hidden rounded-md border border-black/20 bg-white/80 text-[11px] text-neutral-700 shadow" role="group" aria-label="视图">
      {CUBE.map(([v, s]) => (
        <button key={v} type="button" title={v} onClick={() => onView(v)} className={`h-7 border-black/10 [&:not(:nth-child(3n))]:border-r [&:nth-child(-n+6)]:border-b ${v === view ? "bg-amber-400 font-medium text-black" : "hover:bg-amber-100"}`}>
          {s}
        </button>
      ))}
    </div>
  );
}

type Precision = "exact" | "approx" | "color";
type Cmp = { label: string; issues: string[] }[];
type Orient = { state: "wait" } | { state: "none" } | { state: "done"; yaw: Yaw; score: number };
const PREC: Record<Precision, { tag: string; tone: "emerald" | "amber"; rule: string }> = {
  exact: { tag: "精确 · 工厂文件", tone: "emerald", rule: "工厂文件就是真实产品：外形和照片要对得上，有差别先确认是透视还是文件不对。" },
  approx: { tag: "近似 · 照片建的", tone: "amber", rule: "只用来摆位置和定角度，出图时车的样子照实物照画；外形差一点不影响，大小、朝向、接触点要对。" },
  color: { tag: "颜色款", tone: "emerald", rule: "颜色和贴纸要和这个颜色的实物照对得上。" },
};

function loadMask(src: string): Promise<Uint8Array | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const k = 160 / Math.max(img.width, img.height);
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      ok(maskOf(d, w, h, photoFg(d, w, h)));
    };
    img.onerror = () => ok(null);
    img.src = src;
  });
}

function Finding({ tone, title, children }: { tone: "ok" | "warn" | "wait" | "info"; title: string; children?: React.ReactNode }) {
  const icon = { ok: "✓", warn: "!", wait: "…", info: "·" }[tone];
  const color = { ok: "text-emerald-300", warn: "text-amber-300", wait: "text-neutral-400", info: "text-neutral-400" }[tone];
  return (
    <li className="flex gap-2 py-2">
      <span className={`w-4 shrink-0 text-center font-bold ${color}`} aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${tone === "warn" ? "text-amber-100" : "text-neutral-200"}`}>{title}</p>
        {children ? <div className="mt-1 text-xs text-neutral-400">{children}</div> : null}
      </div>
    </li>
  );
}

export function ModelReview({ model, glbUrl, photos, stickers, backHref, kind, savedRig, canCompare, lengthHint }: {
  model: { id: string; status: string; note: string; lengthCm: number | null; isColor: boolean; source?: string; rev: string };
  kind: RideKind;
  savedRig: ProductRig | null;
  glbUrl: string;
  photos: { id: string; label: string }[];
  stickers: { id: string; label: string }[];
  backHref: string;
  /** 填了看图检查（Gemini）Key：自动逐角度对照 */
  canCompare: boolean;
  /** 产品资料「尺寸」里读出来的车长 */
  lengthHint: number | null;
}) {
  const router = useRouter();
  const precision: Precision = model.isColor ? "color" : model.source === "fal" ? "approx" : "exact";
  const editable = model.status === "review";
  const withRig = !model.isColor;
  const api = useRef<Api | null>(null);
  const [view, setView] = useState("左前 45°");
  const [loaded, setLoaded] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  const lenSrc = model.lengthCm ? (model.source === "step" ? "工厂文件" : "上次填的") : lengthHint ? "产品资料" : "";
  const [length, setLength] = useState(String(model.lengthCm ?? lengthHint ?? ""));
  const [editLen, setEditLen] = useState(!model.lengthCm && !lengthHint);
  const lenNum = Number(length);
  const lenOk = lenNum > 5 && lenNum < 1000;

  const [rigS, setRigS] = useState<RigState | null>(savedRig ? { rig: savedRig, how: "saved" } : null);
  const [sel, setSel] = useState<RigKey | null>(null);

  const comparable = photos.filter((p) => VIEWS[p.label]).slice(0, 6);
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [orient, setOrient] = useState<Orient>({ state: "wait" });
  const [orientOk, setOrientOk] = useState(false);
  const [cmp, setCmp] = useState<Cmp | null>(null);
  const [cmpErr, setCmpErr] = useState("");
  const [cmpRun, setCmpRun] = useState(false);
  const [manual, setManual] = useState<Record<string, "ok" | "bad">>({});
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [extra, setExtra] = useState("");

  // 模型加载后：按每张照片的角度截图；比剪影判断车头朝向（免费）
  useEffect(() => {
    if (!loaded) return;
    const a = api.current;
    if (!a) return;
    const shots: Record<string, string> = {};
    for (const p of comparable) shots[p.label] = a.capture(p.label);
    setCaps(shots);
    if (!editable) return;
    const sides = comparable.filter((p) => !/顶|底/.test(p.label));
    if (!sides.length) return void setOrient({ state: "none" });
    let off = false;
    void Promise.all(sides.map((p) => loadMask(`/api/assets/${p.id}`))).then((masks) => {
      if (off || !api.current) return;
      const scores = { 0: [], 90: [], [-90]: [], 180: [] } as unknown as Record<Yaw, number[]>;
      sides.forEach((p, i) => {
        const pm = masks[i];
        if (!pm) return;
        for (const y of YAWS) {
          const mm = api.current!.silhouette(p.label, y);
          if (mm) scores[y].push(overlap(mm, pm));
        }
      });
      const b = bestYaw(scores);
      setOrient(b ? { state: "done", yaw: b.yaw, score: b.score } : { state: "none" });
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const orientBad = orient.state === "done" && orient.yaw !== 0 && !orientOk;
  const lying = model.source === "step" && orient.state === "done" && orient.score < 0.35 && !orientOk;
  const orientReady = orient.state !== "wait" && !orientBad && !lying;

  // 朝向没问题后自动逐角度对照（Gemini，几分钱）；结果按模型文件版本记在浏览器里，刷新不重复花钱
  const cacheKey = `pd-cmp:${model.id}:${model.rev}`;
  useEffect(() => {
    if (!editable || !canCompare || !orientReady || cmp || cmpErr || cmpRun || !comparable.every((p) => caps[p.label])) return;
    if (!comparable.length) return;
    try {
      const hit = localStorage.getItem(cacheKey);
      if (hit) return void setCmp(JSON.parse(hit) as Cmp);
    } catch {
      // 读不到缓存就重新对照
    }
    setCmpRun(true);
    void compareModelAction(model.id, comparable.map((p) => ({ photoId: p.id, label: p.label, dataUrl: caps[p.label] })))
      .then((r) => {
        if (r.error) setCmpErr(r.error);
        else {
          setCmp(r.result ?? []);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(r.result ?? []));
          } catch {
            // 存不下就算了
          }
        }
      })
      .catch(() => setCmpErr("对照请求失败"))
      .finally(() => setCmpRun(false));
  }, [editable, canCompare, orientReady, cmp, cmpErr, cmpRun, caps, comparable, cacheKey, model.id]);

  // 快捷键：Esc 取消选中的点
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const turn = (deg: Yaw) =>
    deg &&
    start(async () => {
      setErr("");
      const r = await turnModelAction(model.id, deg);
      if (r.error) setErr(r.error);
      else router.refresh();
    });
  const flipUp = () =>
    start(async () => {
      setErr("");
      const r = await flipStepUpAction(model.id);
      if (r.error) setErr(r.error);
      else router.refresh();
    });

  const issuesOf = (label: string) => cmp?.find((x) => x.label === label)?.issues ?? [];
  const autoOk = (label: string) => cmp !== null && !issuesOf(label).length;
  // 精确 / 颜色款：每一行要么自动对照通过，要么人确认；近似模型外形只供参考
  const shapeStrict = precision !== "approx";
  const rowsOpen = comparable.filter((p) => !autoOk(p.label) && !manual[p.label]);
  const markedBad = comparable.filter((p) => manual[p.label] === "bad");
  const rows = [...comparable].sort((a, b) => Number(issuesOf(b.label).length > 0) - Number(issuesOf(a.label).length > 0));

  const blockers = [
    loaded !== true ? "模型还没加载好" : "",
    editable && orient.state === "wait" && comparable.length ? "正在判断车头朝向" : "",
    orientBad || lying ? "先处理车头朝向" : "",
    withRig && !lenOk ? "填车长" : "",
    withRig && !rigS ? "接触点还没放好" : "",
    cmpRun ? "正在自动对照" : "",
    shapeStrict && rowsOpen.length ? `还有 ${rowsOpen.length} 个角度没确认` : "",
    markedBad.length ? "你标了不对的角度，请退回" : "",
  ].filter(Boolean);

  const shapeNote = () => {
    if (!comparable.length) return "外形：没有能对照的照片";
    const auto = cmp ? `自动对照 ${cmp.reduce((a, x) => a + x.issues.length, 0)} 处差异` : cmpErr ? `自动对照没做成（${cmpErr}）` : "没自动对照";
    const man = Object.keys(manual).length ? `，人工确认 ${Object.values(manual).filter((x) => x === "ok").length}/${comparable.length}` : "";
    return `外形：${auto}${man}${!shapeStrict && !man ? "（近似模型，只看位置）" : ""}`;
  };
  const submit = (ok: boolean) =>
    start(async () => {
      setErr("");
      const orientNote = orient.state === "done" ? (orientOk && orient.yaw !== 0 ? "朝向：人工确认" : "朝向：和照片一致") : "朝向：没照片，人工看";
      const note = ok
        ? [orientNote, shapeNote()].join("；")
        : [reasons.join("、"), markedBad.length ? `不对的角度：${markedBad.map((p) => p.label).join("、")}` : "", extra.trim()].filter(Boolean).join("；");
      const r = await reviewModelAction(model.id, ok, withRig && lenOk ? lenNum : null, note, withRig ? rigS?.rig ?? null : null);
      if (r.error) setErr(r.error);
      else router.push(backHref);
    });

  const REASONS = ["外形 / 结构不对", "比例不对", "车头朝向不对", ...(model.isColor ? ["颜色不对"] : []), ...(stickers.length ? ["贴纸 / Logo 不对"] : []), "文件传错了"];
  const p = PREC[precision];

  return (
    <div className="grid gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_26.25rem]">
      {/* 视窗 */}
      <div className="relative h-[62vh] min-h-[26.25rem] overflow-hidden rounded-xl border border-white/10 bg-[#d9d9d9] @4xl/main:sticky @4xl/main:top-4 @4xl/main:h-[calc(100vh-180px)]">
        <Viewer
          url={glbUrl}
          view={view}
          kind={kind}
          rig={rigS?.rig ?? null}
          onRig={setRigS}
          sel={sel}
          onPick={setSel}
          editRig={editable && withRig}
          withRig={withRig}
          apiRef={api}
          onLoaded={setLoaded}
        />
        <div className="absolute right-3 top-3">
          <ViewCube view={view} onView={setView} />
        </div>
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 text-[11px] text-white">
          红箭头 = 车头 · 拖动旋转 · 滚轮缩放{withRig && editable ? " · 点彩色点拖动接触点" : ""}
        </div>
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
          {editable ? (
            <button type="button" className="rounded-md bg-black/70 px-2.5 py-1 text-xs text-white hover:bg-black disabled:opacity-40" disabled={pending || loaded !== true} title="先把视图转到车头正对着你，再点" onClick={() => api.current && turn(api.current.frontYaw())}>
              把现在看到的这面设为车头
            </button>
          ) : null}
          {withRig ? (
            <span className="flex items-center gap-2 rounded-md bg-black/55 px-2 py-1 text-[11px] text-white">
              {[["#f59e0b", "座位"], ["#22d3ee", "握把"], ["#a3e635", "脚"]].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>

      {/* 检查 + 决定 */}
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={p.tone}>{p.tag}</Tag>
            <Tag tone={model.status === "approved" ? "emerald" : model.status === "review" ? "amber" : "rose"}>
              {model.status === "approved" ? "已通过，在用" : model.status === "review" ? "待审核" : model.status === "rejected" ? "已退回" : "已替换"}
            </Tag>
          </div>
          <p className="mt-2 text-xs text-neutral-400">{p.rule}</p>

          <ul className="mt-2 divide-y divide-white/5">
            {/* 朝向 */}
            {!editable ? null : orient.state === "wait" ? (
              <Finding tone="wait" title="正在按照片判断车头朝向…" />
            ) : orient.state === "none" ? (
              <Finding tone="info" title="没有侧面 / 正面照，判断不了朝向">看一眼红箭头是不是车头方向；不是就把视图转到车头，点视窗左下角的按钮。</Finding>
            ) : lying ? (
              <Finding tone="warn" title="模型和照片的轮廓对不上，车可能是躺着的">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn} disabled={pending} onClick={flipUp}>换朝上的方向</button>
                  <button type="button" className={btn} onClick={() => setOrientOk(true)}>没躺着</button>
                </div>
              </Finding>
            ) : orientBad ? (
              <Finding tone="warn" title={`车头好像朝${orient.yaw === 180 ? "后" : orient.yaw === 90 ? "右" : "左"}了，和照片对不上`}>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={primary.replace("px-4 py-2", "px-3 py-1")} disabled={pending} onClick={() => turn(orient.yaw)}>
                    {pending ? "转动中…" : "转正"}
                  </button>
                  <button type="button" className={btn} onClick={() => setOrientOk(true)}>朝向没问题</button>
                </div>
              </Finding>
            ) : (
              <Finding tone="ok" title={orientOk ? "朝向：你确认过了" : "车头朝向和照片一致"} />
            )}

            {/* 尺寸 */}
            {withRig ? (
              <Finding tone={lenOk ? "ok" : "warn"} title={lenOk && !editLen ? `车长 ${length} cm` : "车长（厘米，车头到车尾）"}>
                {editLen || !lenOk ? (
                  <span className="flex items-center gap-2">
                    <input autoFocus={editLen && !!lenSrc} aria-label="车长（厘米）" value={length} disabled={!editable} onChange={(e) => setLength(e.target.value.replace(/[^\d.]/g, ""))} onBlur={() => lenOk && setEditLen(false)} inputMode="decimal" placeholder="例如 85" className={`${field} w-24`} />
                    {!lenSrc ? <span>产品资料里没写尺寸</span> : null}
                  </span>
                ) : (
                  <span>
                    {lenSrc ? `来自${lenSrc}，` : ""}{precision === "approx" ? "通过时按它缩放模型" : "和工厂文件一致"}。
                    {editable ? (
                      <button type="button" className="ml-1 text-amber-300 underline" onClick={() => setEditLen(true)}>改</button>
                    ) : null}
                  </span>
                )}
              </Finding>
            ) : null}

            {/* 接触点 */}
            {withRig ? (
              <Finding tone={!rigS ? "wait" : rigS.how === "guess" ? "warn" : "ok"} title={!rigS ? "正在放接触点…" : rigS.how === "guess" ? "接触点是按比例估的，看一下位置" : rigS.how === "edit" ? "接触点已手动调整" : rigS.how === "saved" ? "接触点已保存" : "接触点已自动放好"}>
                {editable && rigS ? (
                  <span>
                    {sel ? `正在拖「${RIG_KEYS.find((r) => r.k === sel)?.label}」，按 Esc 取消。` : "不对就点模型上的彩色点拖到位置。"}
                    <button type="button" className="ml-1 text-amber-300 underline" onClick={() => api.current?.remeasure()}>重新自动放</button>
                  </span>
                ) : null}
              </Finding>
            ) : null}

            {/* 外形对照 */}
            {comparable.length ? (
              cmpRun ? (
                <Finding tone="wait" title="正在逐角度自动对照外形（几分钱）…" />
              ) : cmp ? (
                cmp.some((x) => x.issues.length) ? (
                  <Finding tone="warn" title={`自动对照：${cmp.reduce((a, x) => a + x.issues.length, 0)} 处和照片不一样`}>
                    {precision === "approx" ? "照片模型外形只作参考，差得多就退回重建。" : "下面标红的角度逐个确认：是透视 / 遮挡就点「没问题」。"}
                  </Finding>
                ) : (
                  <Finding tone="ok" title="自动对照：每个角度外形都对得上" />
                )
              ) : (
                <Finding tone={shapeStrict ? "warn" : "info"} title={cmpErr ? "自动对照没做成" : canCompare ? (editable ? "朝向确定后自动对照外形" : "外形对照") : "没填看图检查 Key，外形要自己看"}>
                  {cmpErr ? `${cmpErr}。` : ""}
                  {editable ? (shapeStrict ? "下面每个角度看一眼，点「对得上」或「不对」。" : "下面每个角度看一眼，差得多就退回。") : null}
                </Finding>
              )
            ) : null}
          </ul>
        </section>

        {/* 对照表 */}
        {comparable.length ? (
          <section className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
            <div className="mb-2 grid grid-cols-[1fr_1fr_1.2fr] gap-2 text-[11px] text-neutral-500">
              <span>实物照</span>
              <span>同角度模型</span>
              <span>哪里不一样</span>
            </div>
            <ul className="space-y-2">
              {rows.map((ph) => {
                const iss = issuesOf(ph.label);
                const m = manual[ph.label];
                return (
                  <li key={ph.id} className={`grid grid-cols-[1fr_1fr_1.2fr] items-start gap-2 rounded-lg border p-1.5 ${iss.length || m === "bad" ? "border-rose-400/50" : view === ph.label ? "border-amber-400/60" : "border-white/10"}`}>
                    <button type="button" className="contents" onClick={() => setView(ph.label)} title={`把模型转到「${ph.label}」`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/assets/${ph.id}`} alt={ph.label} className="aspect-square w-full cursor-pointer rounded bg-white object-contain" />
                      {caps[ph.label] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={caps[ph.label]} alt={`${ph.label} 模型`} className="aspect-square w-full cursor-pointer rounded object-cover" />
                      ) : (
                        <span className="grid aspect-square w-full place-items-center rounded bg-white/5 text-[11px] text-neutral-500">截图中…</span>
                      )}
                    </button>
                    <div className="min-w-0 text-xs">
                      <p className="font-medium text-neutral-200">{ph.label}</p>
                      {iss.length ? (
                        <ul className="mt-1 space-y-0.5 text-rose-200">
                          {iss.map((t) => (
                            <li key={t}>· {t}</li>
                          ))}
                        </ul>
                      ) : cmp ? (
                        <p className="mt-1 text-emerald-300">对得上</p>
                      ) : null}
                      {editable && (!autoOk(ph.label) || m) ? (
                        <div className="mt-1.5 flex gap-1">
                          <button type="button" aria-pressed={m === "ok"} className={`${btn} ${m === "ok" ? "border-emerald-400 text-emerald-200" : ""}`} onClick={() => setManual({ ...manual, [ph.label]: "ok" })}>
                            {iss.length ? "没问题" : "对得上"}
                          </button>
                          <button type="button" aria-pressed={m === "bad"} className={`${btn} ${m === "bad" ? "border-rose-400 text-rose-200" : ""}`} onClick={() => setManual({ ...manual, [ph.label]: "bad" })}>
                            不对
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {photos.length > comparable.length ? <p className="mt-2 text-[11px] text-neutral-500">没标角度的照片不参与对照。</p> : null}
          </section>
        ) : (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
            没有标了角度的{model.isColor ? "颜色款实物照" : "白底照"}，没法对照。到产品资料第 2 步传正面、侧面、背面照会更稳。
          </p>
        )}

        {stickers.length ? (
          <details className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
            <summary className="cursor-pointer text-sm text-neutral-200">车身贴纸 · {stickers.length} 张</summary>
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {stickers.map((s) => (
                <li key={s.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${s.id}`} alt={s.label} className="aspect-square w-full rounded-md border border-white/10 bg-neutral-800 object-contain" />
                  <p className="text-center text-[11px] text-neutral-400">{s.label}</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {/* 决定 */}
        <section className="sticky bottom-0 rounded-xl border border-white/10 bg-neutral-950/95 p-4 backdrop-blur">
          {editable ? (
            rejecting ? (
              <div className="space-y-3">
                <p className="text-sm text-white">哪里不对？（可多选）</p>
                <div className="flex flex-wrap gap-1.5">
                  {REASONS.map((r) => (
                    <button key={r} type="button" aria-pressed={reasons.includes(r)} className={`${btn} ${reasons.includes(r) ? "border-rose-400 text-rose-100" : ""}`} onClick={() => setReasons(reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons, r])}>
                      {r}
                    </button>
                  ))}
                </div>
                <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={200} placeholder="补充一句（可不填）" aria-label="补充说明" className={`${field} w-full`} />
                <div className="flex gap-2">
                  <button type="button" className="rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-40" disabled={pending || (!reasons.length && !markedBad.length && !extra.trim())} onClick={() => submit(false)}>
                    确认退回
                  </button>
                  <button type="button" className={btn} onClick={() => setRejecting(false)}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={primary} disabled={pending || blockers.length > 0} onClick={() => submit(true)}>
                    {pending ? "保存中…" : "通过，用这个模型"}
                  </button>
                  <button type="button" className={btn} disabled={pending} onClick={() => setRejecting(true)}>
                    退回
                  </button>
                  <span className="flex-1" />
                  <Link href={backHref} className="text-xs text-neutral-500 hover:text-neutral-300">
                    回产品资料
                  </Link>
                </div>
                {blockers.length ? <p className="text-xs text-neutral-400">还不能通过：{blockers.join("、")}</p> : null}
              </div>
            )
          ) : (
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{model.note ? `审核记录：${model.note}` : "这个模型已经审核过了，只能看。"}</span>
              <Link href={backHref} className="text-amber-300 underline">
                回产品资料
              </Link>
            </div>
          )}
          {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
        </section>
      </div>
    </div>
  );
}
