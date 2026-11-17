"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { saveProductRefAction } from "@/app/short-actions";
import { PRODUCT_REF_VIEWS } from "@/lib/shorts-set";

/** 在浏览器里用 3D 模型拍 3 张白底参考图（不用 Blender） */
async function renderRefs(modelUrl: string): Promise<{ name: string; png: string }[]> {
  const g = await new GLTFLoader().loadAsync(modelUrl);
  const obj = g.scene;
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -box.min.y, -c.z);
  const size = box.getSize(new THREE.Vector3());
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff");
  scene.add(obj, new THREE.HemisphereLight("#ffffff", "#8a8a8a", 1.8));
  const key = new THREE.DirectionalLight("#fff4e6", 1.6);
  key.position.set(-3, 4, 3);
  scene.add(key);
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(1200, 1200, false);
  const fov = 2 * Math.atan(18 / 50);
  const rad = size.length() / 2 || 1;
  const dist = (rad / Math.sin(fov / 2)) * 1.05;
  const tgt = new THREE.Vector3(0, size.y * 0.42, 0);
  const cam = new THREE.PerspectiveCamera((fov * 180) / Math.PI, 1, rad / 100, rad * 100);
  const out: { name: string; png: string }[] = [];
  for (const v of PRODUCT_REF_VIEWS) {
    const az = (v.azimuth_deg * Math.PI) / 180;
    const el = (v.elevation_deg * Math.PI) / 180;
    // Blender 约定（z 朝上）换成 glTF（y 朝上）：相机方向 = (cos el·sin az, sin el, cos el·cos az)
    cam.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(dist).add(tgt);
    cam.lookAt(tgt);
    r.render(scene, cam);
    out.push({ name: v.name, png: r.domElement.toDataURL("image/png") });
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}

/** 免费：用 3D 模型渲染产品参考图（没有产品照时，首帧用它保持外形 / 颜色 / Logo） */
export function ProductRefs({ projectId, modelUrl, urls }: { projectId: string; modelUrl: string | null; urls: string[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 space-y-2 text-xs text-neutral-400">
      <p>3D 模型：{modelUrl ? "已上传" : "还没有（到产品页上传 GLB）"} · 模型渲染参考图 {urls.length} 张</p>
      {urls.length ? (
        <div className="flex gap-1">
          {urls.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className="h-16 w-16 rounded border border-white/10 bg-white object-contain" />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        disabled={!modelUrl || pending}
        onClick={() =>
          start(async () => {
            if (!modelUrl) return;
            setMsg("正在浏览器里渲染…");
            try {
              const refs = await renderRefs(modelUrl);
              for (const x of refs) {
                const r = await saveProductRefAction(projectId, x.name, x.png);
                if (r.error) return setMsg(r.error);
              }
              setMsg(`已渲染 ${refs.length} 张`);
            } catch (e) {
              setMsg(`渲染失败：${e instanceof Error ? e.message : String(e)}`);
            }
            router.refresh();
          })
        }
        className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:opacity-40"
      >
        {urls.length ? "重新渲染参考图（免费）" : "用 3D 模型渲染参考图（免费）"}
      </button>
      {msg ? <p className="text-sky-200">{msg}</p> : null}
    </div>
  );
}
