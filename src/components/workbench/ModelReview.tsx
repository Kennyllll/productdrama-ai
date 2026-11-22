"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { flipStepUpAction, reviewModelAction, turnModelAction } from "@/app/model-actions";
import { Card, Tag } from "@/components/ui";
import { RIDE_KINDS, RIG_KEYS, rigFrom, rigLocal, type ProductRig, type RideKind, type RigKey } from "@/lib/figures";
import { measureRig } from "@/lib/rig-measure";

const btn = "rounded-md border border-white/15 px-2.5 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40";
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

type RigState = { rig: ProductRig; how: "auto" | "guess" | "edit" | "saved" };
type ViewerApi = { setView: (v: string) => void; setMarks: (g: ProductRig | null, sel: RigKey | null, edit: boolean) => void; remeasure: () => void };

function Viewer({ url, view, kind, rig, onRig, sel, editRig, withRig }: { url: string; view: string; kind: RideKind; rig: ProductRig | null; onRig: (r: RigState) => void; sel: RigKey | null; editRig: boolean; withRig: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ViewerApi | null>(null);
  const live = useRef({ rig, onRig, kind, sel, editRig });
  live.current = { rig, onRig, kind, sel, editRig };
  const [info, setInfo] = useState("加载模型中…");

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d9d9d9");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.001, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    let center = new THREE.Vector3();
    let radius = 1;
    const setView = (v: string) => {
      const d = new THREE.Vector3(...(VIEWS[v] ?? VIEWS["左前 45°"])).normalize();
      camera.position.copy(center).addScaledVector(d, radius * 3.2);
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
    api.current = { setView, setMarks, remeasure };
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    };
    loop();
    new GLTFLoader().load(
      url,
      (g) => {
        scene.add(g.scene);
        const box = new THREE.Box3().setFromObject(g.scene);
        const size = box.getSize(new THREE.Vector3());
        center = box.getCenter(new THREE.Vector3());
        radius = Math.max(size.x, size.y, size.z) / 2 || 1;
        // 地面在模型自己的 y = 0：车轮应该正好落在格子上
        const grid = new THREE.GridHelper(radius * 6, 12, 0x555555, 0x999999);
        scene.add(grid);
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(center.x, box.max.y + radius * 0.08, center.z), radius * 1.6, 0xe11d48);
        scene.add(arrow);
        camera.near = radius / 100;
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        setView(view);
        const f = (n: number) => n.toFixed(2);
        setInfo(`模型尺寸（模型单位）：长 ${f(size.x)} · 高 ${f(size.y)} · 宽 ${f(size.z)}；最低点 y = ${f(box.min.y)}`);
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
      },
      undefined,
      () => setInfo("模型加载失败"),
    );
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      pts = [];
      // three 0.169 的 TransformControls.dispose() 会调用不存在的 this.traverse，这里手动清理
      tc.detach();
      tc.disconnect();
      scene.remove(helper);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    api.current?.setView(view);
  }, [view]);

  useEffect(() => {
    api.current?.setMarks(rig, sel, editRig);
  }, [rig, sel, editRig]);

  useEffect(() => {
    const on = () => api.current?.remeasure();
    window.addEventListener("rig-remeasure", on);
    return () => window.removeEventListener("rig-remeasure", on);
  }, []);

  return (
    <div>
      <div ref={host} className="h-[480px] w-full overflow-hidden rounded-lg border border-white/10" />
      <p className="mt-1 text-xs text-neutral-400">{info}</p>
      <p className="text-xs text-neutral-500">红色箭头 = 车头应该朝的方向（3D 编辑器和 Blender 都按这个方向摆车）；灰格子 = 地面。拖动旋转，滚轮缩放。</p>
    </div>
  );
}

export function ModelReview({
  model,
  glbUrl,
  photos,
  stickers,
  backHref,
  kind,
  savedRig,
}: {
  model: { id: string; status: string; note: string; lengthCm: number | null; isColor: boolean; source?: string };
  kind: RideKind;
  savedRig: ProductRig | null;
  glbUrl: string;
  photos: { id: string; label: string }[];
  stickers: { id: string; label: string }[];
  backHref: string;
}) {
  const router = useRouter();
  const [view, setView] = useState("左前 45°");
  const [length, setLength] = useState(model.lengthCm ? String(model.lengthCm) : "");
  // 换朝上的轴后 STEP 长度会变，跟着服务器的值走
  const [seenLen, setSeenLen] = useState(model.lengthCm);
  if (seenLen !== model.lengthCm) {
    setSeenLen(model.lengthCm);
    setLength(model.lengthCm ? String(model.lengthCm) : "");
  }
  const [note, setNote] = useState(model.note);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [rigS, setRigS] = useState<RigState | null>(savedRig ? { rig: savedRig, how: "saved" } : null);
  const [sel, setSel] = useState<RigKey | null>(null);
  const items = [
    "外形和白底照一致（车把、车轮、座椅、车架弯度）",
    "车头朝红色箭头方向",
    "车轮落在灰格子上，没有歪、没有悬空",
    ...(model.isColor ? ["颜色和实物照一致（主色、辅色、轮胎、座椅）"] : []),
    ...(stickers.length ? ["贴纸 / Logo 的位置、大小、图案对得上"] : []),
    ...(!model.isColor ? [`接触点对上了：黄点在座面上，两个蓝点在车把两端，两个绿点${kind === "tricycle" ? "在脚踏上" : "在前轮后面的地上"}`] : []),
  ];
  const allChecked = items.every((i) => checks[i]);
  const missing = ["正面", "左侧", "右侧", "背面"].filter((a) => !photos.some((p) => p.label === a));
  const editable = model.status === "review";
  const [ver, setVer] = useState(0);
  const turn = (deg: number) =>
    start(async () => {
      setErr("");
      const r = await turnModelAction(model.id, deg);
      if (r.error) setErr(r.error);
      else setVer((x) => x + 1);
    });

  const flipUp = () =>
    start(async () => {
      setErr("");
      const r = await flipStepUpAction(model.id);
      if (r.error) setErr(r.error);
      else {
        setVer((x) => x + 1);
        router.refresh();
      }
    });

  const submit = (ok: boolean) =>
    start(async () => {
      setErr("");
      const r = await reviewModelAction(model.id, ok, length ? Number(length) : null, note, model.isColor ? null : rigS?.rig ?? null);
      if (r.error) setErr(r.error);
      else router.push(backHref);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-3">
        <Viewer
          url={ver ? `${glbUrl}${glbUrl.includes("?") ? "&" : "?"}v=${ver}` : glbUrl}
          view={view}
          kind={kind}
          rig={rigS?.rig ?? null}
          onRig={setRigS}
          sel={sel}
          editRig={editable && !model.isColor}
          withRig={!model.isColor}
        />
        {editable ? (
          <div className="flex flex-wrap items-center gap-1 text-xs text-neutral-400">
            车头没对准红色箭头？把整台车转一下（免费）：
            <button type="button" className={btn} disabled={pending} onClick={() => turn(90)}>↺ 左转 90°</button>
            <button type="button" className={btn} disabled={pending} onClick={() => turn(-90)}>↻ 右转 90°</button>
            <button type="button" className={btn} disabled={pending} onClick={() => turn(180)}>调头 180°</button>
            {model.source === "step" ? (
              <button type="button" className={btn} disabled={pending} onClick={flipUp} title="工厂 STEP 有的用 Z 轴朝上，有的用 Y 轴朝上">
                车躺着？换朝上的方向
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1">
          {Object.keys(VIEWS).map((v) => (
            <button key={v} type="button" className={`${btn} ${v === view ? "border-amber-400 text-amber-200" : ""}`} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Card title={model.isColor ? "这个颜色的实物照" : "白底照"}>
          {missing.length ? <p className="mb-2 text-xs text-amber-200">没有这几面的照片，模型是猜的，特别看一下：{missing.join("、")}</p> : null}
          <ul className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setView(p.label)} className={`w-full rounded-md border ${p.label === view ? "border-amber-400" : "border-white/10"}`} title="把模型转到这个角度">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${p.id}`} alt={p.label} className="aspect-square w-full rounded-md bg-white object-contain" />
                </button>
                <p className="text-center text-[11px] text-neutral-400">{p.label}</p>
              </li>
            ))}
          </ul>
        </Card>
        {!model.isColor ? (
          <Card title="接触点（人偶骑车时屁股、手、脚放哪）">
            <p className="text-xs text-neutral-300">
              产品类型：{RIDE_KINDS.find((o) => o.k === kind)?.label}
              <span className="text-neutral-500">（不对的话到产品资料「基本信息」里改，再回来点「重新自动量」）</span>
            </p>
            <p className={`mt-1 text-xs ${rigS?.how === "guess" ? "text-amber-200" : "text-neutral-400"}`}>
              {!rigS
                ? "模型加载后自动量…"
                : rigS.how === "auto"
                  ? "按模型外形自动量出来的，看一下 5 个点的位置对不对。"
                  : rigS.how === "guess"
                    ? "没量出来，先按这个类型的比例估了一版，请仔细看，不对就拖一下。"
                    : rigS.how === "edit"
                      ? "已手动调整，点「通过」时保存。"
                      : "已保存的接触点。以后要改，到短视频 3D 页「校正产品接触点」。"}
            </p>
            {editable ? (
              <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-neutral-400">
                选一个点拖动（左右会一起动）：
                {RIG_KEYS.map((r) => (
                  <button key={r.k} type="button" className={`${btn} ${sel === r.k ? "border-amber-400 text-amber-200" : ""}`} onClick={() => setSel(sel === r.k ? null : r.k)}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </button>
                ))}
                <button type="button" className={btn} onClick={() => window.dispatchEvent(new Event("rig-remeasure"))}>
                  重新自动量
                </button>
              </div>
            ) : null}
          </Card>
        ) : null}
        {stickers.length ? (
          <Card title="车身贴纸">
            <ul className="grid grid-cols-4 gap-2">
              {stickers.map((s) => (
                <li key={s.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${s.id}`} alt={s.label} className="aspect-square w-full rounded-md border border-white/10 bg-neutral-800 object-contain" />
                  <p className="text-center text-[11px] text-neutral-400">{s.label}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card title="审核" aside={<Tag tone={model.status === "approved" ? "emerald" : model.status === "review" ? "amber" : "rose"}>{model.status === "approved" ? "已通过，在用" : model.status === "review" ? "待审核" : model.status === "rejected" ? "不通过" : "已替换"}</Tag>}>
          <fieldset disabled={!editable || pending} className="space-y-3 text-sm">
            {!model.isColor ? (
              <label className="block text-xs text-neutral-400">
                产品真实长度（厘米，车头到车尾）
                <input value={length} onChange={(e) => setLength(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="例如 85" className={`${field} mt-1 block w-32`} />
              </label>
            ) : null}
            <ul className="space-y-1">
              {items.map((i) => (
                <li key={i}>
                  <label className="flex items-start gap-2 text-neutral-200">
                    <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks({ ...checks, [i]: e.target.checked })} className="mt-1" />
                    {i}
                  </label>
                </li>
              ))}
            </ul>
            <label className="block text-xs text-neutral-400">
              备注（不通过时必填：哪里不对）
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${field} mt-1 block w-full`} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={!allChecked} onClick={() => submit(true)} title={allChecked ? "" : "每一项都核对过才能通过"}>
                通过，以后都用它
              </button>
              <button type="button" className={btn} onClick={() => submit(false)}>
                不行
              </button>
            </div>
          </fieldset>
          {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
          {!editable ? <p className="mt-2 text-xs text-neutral-500">这个模型已经审核过了，只能看。</p> : null}
          <Link href={backHref} className="mt-3 inline-block text-xs text-amber-300 underline">
            回产品资料
          </Link>
        </Card>
      </div>
    </div>
  );
}
