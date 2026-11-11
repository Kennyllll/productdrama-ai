"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { saveSetLayoutAction } from "@/app/production-actions";
import type { SetLayout, SetProp } from "@/lib/production-repo";

export interface SetShot {
  code: string;
  title: string;
  original: SetLayout;
  edited: SetLayout | null;
  refs: { label: string; fileId: string; video: boolean }[];
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
type Handle = "cam" | "target" | "bike";

export function Set3D({ projectId, episode, shots, mapProps, glbUrl, initialCode }: { projectId: string; episode: number; shots: SetShot[]; mapProps: SetProp[]; glbUrl: string | null; initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(shots.some((s) => s.code === initialCode) ? initialCode : shots[0]?.code ?? "");
  const shot = shots.find((s) => s.code === code) ?? shots[0];
  const [layout, setLayout] = useState<SetLayout>(shot.edited ?? shot.original);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const camCanvas = useRef<HTMLCanvasElement>(null);
  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef(layout);
  const viewRef = useRef({ cx: 0, cz: 0, span: 30 });
  const propsRef = useRef<THREE.Group | null>(null);
  const shotProps = useMemo(() => (shot.original.props?.length ? shot.original.props : mapProps), [shot, mapProps]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const recenter = (l: SetLayout) => {
    const c = toV(l.camPos);
    const t = toV(l.lookAt);
    const dist = Math.min(c.distanceTo(t), 40);
    viewRef.current = { cx: (c.x + t.x) / 2, cz: (c.z + t.z) / 2, span: Math.max(12, dist * 2.2) };
  };

  const pick = (s: SetShot) => {
    setCode(s.code);
    const l = s.edited ?? s.original;
    setLayout(l);
    setDirty(false);
    setMsg("");
    recenter(l);
    const url = new URL(window.location.href);
    url.searchParams.set("shot", s.code);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const update = (patch: Partial<SetLayout>) => {
    setLayout((l) => ({ ...l, ...patch }));
    setDirty(true);
  };

  useEffect(() => {
    recenter(layoutRef.current);
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
      });
    }
    const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.32, 4, 12), new THREE.MeshLambertMaterial({ color: "#d9a38a", transparent: true, opacity: 0.55 }));
    scene.add(figure);

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
    const mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    mapCam.layers.enable(MARKER_LAYER);
    mapCam.up.set(0, 0, -1);
    const camR = new THREE.WebGLRenderer({ canvas: camEl, antialias: true });
    const mapR = new THREE.WebGLRenderer({ canvas: mapEl, antialias: true });
    for (const r of [camR, mapR]) r.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const fit = (r: THREE.WebGLRenderer, el: HTMLCanvasElement) => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = r.getSize(new THREE.Vector2());
      if (w && h && (s.x !== w || s.y !== h)) r.setSize(w, h, false);
      return w / Math.max(h, 1);
    };

    let raf = 0;
    const frame = () => {
      const l = layoutRef.current;
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
        bike.position.set(l.bike[0], 0, -l.bike[1]);
        // KB002 模型车头朝 +x；当时数据里朝向 0° 表示车头朝南（对着北向的机位）
        bike.rotation.y = (((l.bikeYaw ?? 0) - 90) * Math.PI) / 180;
        bikeMark.position.set(l.bike[0], 0.02, -l.bike[1]);
      }
      figure.visible = hasBike && Boolean(l.figure);
      if (l.bike) figure.position.set(l.bike[0], 0.72, -l.bike[1]);

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
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      viewRef.current.span = Math.min(400, Math.max(3, viewRef.current.span * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));
    };
    mapEl.addEventListener("pointerdown", down);
    mapEl.addEventListener("pointermove", move);
    mapEl.addEventListener("pointerup", up);
    mapEl.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      mapEl.removeEventListener("pointerdown", down);
      mapEl.removeEventListener("pointermove", move);
      mapEl.removeEventListener("pointerup", up);
      mapEl.removeEventListener("wheel", wheel);
      camR.dispose();
      mapR.dispose();
      propsRef.current = null;
    };
  }, [glbUrl]);

  useEffect(() => {
    const g = propsRef.current;
    if (!g) return;
    g.clear();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (const p of shotProps) {
      const lo = toV(p.lo);
      const hi = toV(p.hi);
      const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(p.rgb?.[0] ?? 0.5, p.rgb?.[1] ?? 0.5, p.rgb?.[2] ?? 0.5) }));
      m.scale.set(Math.max(Math.abs(hi.x - lo.x), 0.01), Math.max(Math.abs(hi.y - lo.y), 0.01), Math.max(Math.abs(hi.z - lo.z), 0.01));
      m.position.set((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2);
      g.add(m);
    }
  }, [shotProps]);

  const idx = shots.findIndex((s) => s.code === code);
  const prev = idx > 0 ? shots[idx - 1] : null;
  const diff = prev ? angleDiff(heading(layout), heading(prev.edited ?? prev.original)) : null;
  const camHeight = layout.camPos[2];
  const dist = Math.hypot(layout.lookAt[0] - layout.camPos[0], layout.lookAt[1] - layout.camPos[1]);

  const save = (data: SetLayout | null) =>
    start(async () => {
      const r = await saveSetLayoutAction(projectId, episode, code, data);
      if (r.error) return setMsg(r.error);
      setMsg(data ? "已保存为你的修改（原始数据保留着）" : "已恢复成当时的数据");
      if (!data) setLayout(shot.original);
      setDirty(false);
      router.refresh();
    });

  const Slider = ({ label, value, min, max, step, onChange, unit }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit: string }) => (
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {shots.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => pick(s)}
            className={`rounded-lg border px-3 py-1 text-sm ${s.code === code ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-white/10 text-neutral-400 hover:bg-white/5"}`}
          >
            E2-{s.code}
            {s.edited ? <span className="ml-1 text-[10px] text-sky-300">已改</span> : null}
          </button>
        ))}
      </div>
      <p className="text-sm text-neutral-300">{shot.title}</p>

      <div className="grid gap-4 xl:grid-cols-2">
        <figure>
          <figcaption className="mb-1 text-xs text-neutral-400">摄影机画面（按当时的机位、焦段实时算）</figcaption>
          <canvas ref={camCanvas} className="w-full rounded-lg border border-white/10 bg-black" style={{ aspectRatio: String(layout.aspect) }} />
        </figure>
        <figure>
          <figcaption className="mb-1 text-xs text-neutral-400">
            俯视地图：拖<span className="text-amber-300">黄点</span>挪机位，拖<span className="text-sky-300">蓝点</span>改看向哪里
            {layout.bike ? <>，拖<span className="text-rose-300">红点</span>挪车</> : null}；拖空白处平移，滚轮缩放。上方是北
          </figcaption>
          <canvas ref={mapCanvas} className="aspect-[2.33] w-full cursor-crosshair touch-none rounded-lg border border-white/10 bg-black" />
        </figure>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3 rounded-xl border border-white/10 bg-neutral-900/70 p-4">
          <Slider label="焦段" value={layout.lens} min={12} max={200} step={1} unit="mm" onChange={(v) => update({ lens: v })} />
          <Slider label="机位高度" value={camHeight} min={0.05} max={12} step={0.05} unit="米" onChange={(v) => update({ camPos: [layout.camPos[0], layout.camPos[1], v] })} />
          <Slider label="看向点高度" value={layout.lookAt[2]} min={-2} max={20} step={0.05} unit="米" onChange={(v) => update({ lookAt: [layout.lookAt[0], layout.lookAt[1], v] })} />
          {layout.bike ? <Slider label="车的朝向" value={layout.bikeYaw ?? 0} min={-180} max={180} step={1} unit="°" onChange={(v) => update({ bikeYaw: v })} /> : null}
          <div className="space-y-1 border-t border-white/10 pt-3 text-xs">
            <p className="text-neutral-400">
              镜头朝向 <span className="text-white">{heading(layout).toFixed(0)}°</span>（北 0°，东 90°） · 到看向点 {dist.toFixed(1)} 米
            </p>
            {diff !== null && prev ? (
              <p className={diff >= 30 ? "text-emerald-300" : "text-amber-300"}>
                和上一镜 E2-{prev.code} 的角度差 {diff.toFixed(0)}°{diff >= 30 ? "，够了" : "：不到 30°，直接切会像跳帧（除非景别差 2 倍以上）"}
              </p>
            ) : null}
            <p className="text-neutral-500">数据来源：{shot.original.source}</p>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
            <button type="button" disabled={!dirty || pending} onClick={() => save(layout)} className="rounded-lg bg-amber-400 px-3 py-1 text-sm font-medium text-black disabled:opacity-40">
              保存我的修改
            </button>
            <button type="button" disabled={pending || (!shot.edited && !dirty)} onClick={() => save(null)} className="rounded-lg border border-white/15 px-3 py-1 text-sm text-neutral-300 disabled:opacity-40">
              恢复当时的数据
            </button>
          </div>
          {msg ? <p className="text-xs text-sky-200">{msg}</p> : null}
          <p className="text-[11px] leading-relaxed text-neutral-500">在这里怎么改都不花钱。改完不会自动重新出图：按新布景出 Blender 构图和首帧，下一轮接进来，出图前会先问你。</p>
        </div>
        <div>
          <p className="mb-2 text-xs text-neutral-400">当时按这个布景出来的结果（对照看 3D 数据怎么变成画面）</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {shot.refs.map((r) =>
              r.video ? (
                <figure key={r.fileId} className="w-80 shrink-0">
                  <video src={`/api/library/${r.fileId}`} controls preload="metadata" className="w-full rounded border border-white/10 bg-black" />
                  <figcaption className="mt-1 truncate text-[11px] text-neutral-500">{r.label}</figcaption>
                </figure>
              ) : (
                <a key={r.fileId} href={`/api/library/${r.fileId}`} target="_blank" rel="noreferrer" className="w-80 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/library/${r.fileId}`} alt={r.label} className="w-full rounded border border-white/10 bg-black" />
                  <span className="mt-1 block truncate text-[11px] text-neutral-500">{r.label}</span>
                </a>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
