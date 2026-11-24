"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { calibrateModelAction } from "@/app/model-actions";
import type { ModelCad } from "@/lib/model-repo";

const ghost = "rounded-md border border-white/15 px-2.5 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40";
const field = "w-20 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none";

type Drawing = { id: string; name: string; png: string; dims: { kind: string; valueMm: number; text: string }[]; suggest: { lengthMm: number | null; heightMm: number | null } };
const KIND: Record<string, string> = { horizontal: "横向", vertical: "竖向", linear: "斜向", aligned: "对齐", diameter: "直径", radius: "半径" };
const cm = (mm: number | null) => (mm ? String(Math.round(mm) / 10) : "");
const num = (s: string) => (s.trim() ? Number(s) : null);

/** 工厂 2D 图纸（DXF）：读尺寸 → 人确认长宽高 → 校准在用的照片模型 */
export function DrawingCalibrate({ projectId, hasModel, cad, source }: { projectId: string; hasModel: boolean; cad: ModelCad | null; source?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [d, setD] = useState<Drawing | null>(null);
  const [len, setLen] = useState("");
  const [wid, setWid] = useState("");
  const [hei, setHei] = useState("");
  const [res, setRes] = useState<ModelCad | null>(cad);

  async function upload() {
    const f = input.current?.files?.[0];
    if (!f) return setMsg({ tone: "error", text: "先选 DXF 图纸" });
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await fetch(`/api/projects/${projectId}/drawings`, { method: "POST", body: fd });
      const data = (await r.json()) as Drawing & { error?: string };
      if (!r.ok) return setMsg({ tone: "error", text: data.error ?? "读取失败" });
      setD(data);
      setLen(cm(data.suggest.lengthMm));
      setHei(cm(data.suggest.heightMm));
      setWid("");
      setMsg({ tone: "ok", text: data.dims.length ? `读到 ${data.dims.length} 个尺寸标注。对照图纸确认下面的长宽高（厘米）` : "图纸里没有尺寸标注：请照图纸手填长宽高" });
    } catch {
      setMsg({ tone: "error", text: "上传失败，检查网络后再试" });
    } finally {
      setBusy(false);
    }
  }

  async function calibrate() {
    setBusy(true);
    const r = await calibrateModelAction(projectId, { file: d?.name ?? "", lengthCm: Number(len), widthCm: num(wid), heightCm: num(hei) });
    setBusy(false);
    if (r.error || !r.result) return setMsg({ tone: "error", text: r.error ?? "校准失败" });
    setRes(r.result);
    setMsg(null);
    router.refresh();
  }

  return (
    <div className="space-y-2 text-xs text-neutral-300">
      {!hasModel ? <p className="text-amber-200">先有一个审核通过的模型，再用图纸校准。</p> : null}
      {source && source !== "fal" ? <p className="text-neutral-500">现在用的是工厂文件，本来就精确；图纸可以用来再核对一次尺寸。</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".dxf,.dwg" className="text-xs text-neutral-300" aria-label="DXF 图纸" />
        <button type="button" className={ghost} disabled={busy || !hasModel} onClick={upload}>
          {busy ? "处理中…" : "读图纸"}
        </button>
      </div>
      {msg ? <p className={msg.tone === "error" ? "text-rose-300" : "text-emerald-300"}>{msg.text}</p> : null}
      {d ? (
        <div className="space-y-2 rounded-md border border-white/10 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.png} alt={`图纸 ${d.name}`} className="max-h-72 w-full rounded bg-white object-contain" />
          {d.dims.length ? (
            <p className="text-neutral-400">
              图纸上的标注（毫米）：{d.dims.slice(0, 30).map((x) => `${KIND[x.kind] ?? x.kind} ${x.valueMm}`).join("、")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label>
              总长 <input className={field} value={len} onChange={(e) => setLen(e.target.value)} inputMode="decimal" /> cm
            </label>
            <label>
              总宽 <input className={field} value={wid} onChange={(e) => setWid(e.target.value)} inputMode="decimal" /> cm
            </label>
            <label>
              总高 <input className={field} value={hei} onChange={(e) => setHei(e.target.value)} inputMode="decimal" /> cm
            </label>
            <button type="button" className={ghost} disabled={busy || !len} onClick={calibrate}>
              校准模型
            </button>
          </div>
          <p className="text-neutral-500">自动填的是图纸上最长的横向、竖向标注，可能不是总长总高，请对着图纸改对。</p>
        </div>
      ) : null}
      {res ? (
        <div className={`rounded-md border p-2 ${res.ok ? "border-emerald-400/40 text-emerald-200" : "border-rose-400/50 text-rose-200"}`}>
          <p className="font-medium">
            {res.ok ? `已校准：长 ${res.lengthCm} cm，比例差 ${res.devPct}%（5% 以内）` : `比例差 ${res.devPct}%，超过 5%：这个照片模型形状不对，仍按「近似」处理，建议重建或要工厂 STEP`}
          </p>
          {res.lines.map((l) => (
            <p key={l}>· {l}</p>
          ))}
          <p className="text-neutral-400">图纸：{res.file || "手填"}</p>
        </div>
      ) : null}
    </div>
  );
}
