"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { estimateCadKeyframeAction, generateCadKeyframeAction, type CadKeyframeResult } from "@/app/cad-actions";
import { deleteKeyframeAction, estimateKeyframesAction, generateKeyframesAction, selectKeyframeAction } from "@/app/keyframe-actions";
import { PlaceholderFrame } from "@/components/ui";
import { CAD_KEYFRAME_MODEL, defaultCadParams, type CadParams } from "@/lib/cad-camera";
import { KEYFRAME_MODELS, type KeyframeModel } from "@/lib/keyframe-prompt";
import type { KeyframeView } from "@/lib/keyframe-repo";
import type { LocalShot } from "@/lib/types";

const field = "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none";
const smallBtn = "rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-40";
const numField = "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white focus:border-amber-400 focus:outline-none";

type Mode = "ai" | "cad";

const CAD_FIELDS: { key: keyof Omit<CadParams, "harmonize" | "protect" | "reusePlate" | "interaction" | "productFirst">; label: string; step: number }[] = [
  { key: "azimuthDeg", label: "相机方位角°（0 正前，负 左前）", step: 5 },
  { key: "elevationDeg", label: "相机仰角°（负 = 仰拍）", step: 2 },
  { key: "lensMm", label: "焦距 mm", step: 5 },
  { key: "rollDeg", label: "产品侧倾°（0 被扶 / 骑，14 靠物，82 倒地）", step: 2 },
  { key: "keyDirDeg", label: "主光方位角°", step: 10 },
  { key: "keyElevDeg", label: "主光高度°", step: 5 },
  { key: "keyKelvin", label: "主光色温 K", step: 200 },
  { key: "x", label: "产品中心 x（0–1）", step: 0.05 },
  { key: "y", label: "产品底部 y（0–1）", step: 0.02 },
  { key: "scale", label: "产品高度 / 画面高度", step: 0.05 },
  { key: "envStrength", label: "场景环境光强度", step: 0.1 },
  { key: "exposure", label: "产品曝光补偿 EV", step: 0.25 },
  { key: "reflection", label: "地面倒影强度（0–1）", step: 0.1 },
  { key: "floorRoughness", label: "倒影模糊（0.02–0.5）", step: 0.02 },
];

export function KeyframePanel({
  projectId,
  shotId,
  shotIndex,
  defaultPrompt,
  keyframes,
  onChange,
  ready,
  dirty,
  shot,
  productName,
  productBible,
  cad,
}: {
  projectId: string;
  shotId: string;
  shotIndex: number;
  defaultPrompt: string;
  keyframes: KeyframeView[];
  onChange: (next: KeyframeView[]) => void;
  ready: boolean;
  dirty: boolean;
  shot: LocalShot;
  productName: string;
  productBible: { key: string; value: string }[];
  cad: { blender: boolean; model: boolean };
}) {
  const physicsRule = productBible.find((f) => f.key === "physics")?.value ?? "";
  const cadAvailable = cad.blender && cad.model && shot.product !== "无";
  const [mode, setMode] = useState<Mode>(cadAvailable ? "cad" : "ai");
  const [model, setModel] = useState<KeyframeModel>(KEYFRAME_MODELS[0].id);
  const [count, setCount] = useState(2);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [params, setParams] = useState<CadParams>(() => defaultCadParams(shot));
  const [last, setLast] = useState<CadKeyframeResult | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const mine = keyframes.filter((k) => k.shotId === shotId);
  const selected = mine.find((k) => k.selected);
  const text = prompt ?? defaultPrompt;

  const generate = () =>
    start(async () => {
      setMsg({});
      const est = await estimateKeyframesAction(projectId, shotId, model, count);
      if (est.error) return setMsg({ error: est.error });
      const usd = est.result?.usd;
      if (!window.confirm(`生成 ${count} 张关键帧候选，参考图 ${est.result?.refs ?? 0} 张，预估${Number.isFinite(usd) ? `约 $${usd!.toFixed(3)}` : `：按用量计费。${est.result?.note ?? ""}`}。参考图会上传到 Higgsfield，结果下载后删除远端数据。继续吗？`)) return;
      const res = await generateKeyframesAction(projectId, shotId, model, count, text);
      if (res.error) setMsg({ error: res.error });
      else {
        onChange([...keyframes, ...(res.result ?? [])]);
        setMsg({ ok: `已生成 ${res.result?.length ?? 0} 张候选` });
      }
    });

  const generateCad = () =>
    start(async () => {
      setMsg({});
      setLast(null);
      const est = await estimateCadKeyframeAction(projectId, params.harmonize);
      if (est.error) return setMsg({ error: est.error });
      const usd = est.result?.usd;
      if (
        !window.confirm(
          `CAD 保护合成：${params.reusePlate ? "复用上次空场景" : "Flare 生成空场景"} → Blender 用场景当环境光渲染产品（本机，约 1–3 分钟）${params.harmonize ? " → Flare 融合阴影 / 倒影 / 色温 → 贴回产品形状" : ""}。预估${Number.isFinite(usd) ? `约 $${usd!.toFixed(3)}` : `：按用量计费。${est.result?.note ?? ""}`}。${params.harmonize ? "合成图会上传到 Higgsfield，用后删除远端数据。" : ""}继续吗？`,
        )
      )
        return;
      const res = await generateCadKeyframeAction(projectId, shotId, params, text);
      if (res.error || !res.result) return setMsg({ error: res.error ?? "生成失败" });
      onChange([...keyframes, res.result.keyframe]);
      setLast(res.result);
      const r = res.result;
      if (r.qa?.length) return setMsg({ error: `已生成但自检不合格：${r.qa.join("；")}。建议重跑或调整镜头描述` });
      setMsg({
        ok: r.fit
          ? `已生成（接触镜头）：产品渲染 ${r.renderSeconds} 秒；CAD 与 AI 画的产品对齐 IoU ${r.fit.iou}，覆盖 ${Math.round(r.fit.coverage * 100)}%。IoU 低于 0.6 说明 AI 画的角度和渲染不一致，请改相机方位 / 仰角重试`
          : `已生成：产品渲染 ${r.renderSeconds} 秒${r.aiDrift !== null ? `，AI 融合试图改动产品像素平均 ${r.aiDrift}/255（已全部贴回，产品零变形）` : "，未做 AI 融合"}`,
      });
    });

  const select = (id: string) =>
    start(async () => {
      const res = await selectKeyframeAction(id);
      if (res.error) return setMsg({ error: res.error });
      onChange(keyframes.map((k) => (k.shotId === shotId ? { ...k, selected: k.id === id } : k)));
      setMsg({ ok: "已选定关键帧，并同步为视频页该镜头素材" });
    });

  const remove = (id: string) =>
    start(async () => {
      if (!window.confirm("删除这张候选？")) return;
      const res = await deleteKeyframeAction(id);
      if (res.error) return setMsg({ error: res.error });
      onChange(keyframes.filter((k) => k.id !== id));
    });

  const setNum = (key: keyof CadParams, v: string) => setParams((p) => ({ ...p, [key]: Number(v) }));

  return (
    <div className="space-y-3" data-keyframes={shotId}>
      {selected ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/keyframes/${selected.id}`} alt={`镜头 ${shotIndex} 关键帧`} className="w-full rounded-lg" />
      ) : (
        <PlaceholderFrame label={`关键帧 · 镜头 ${shotIndex}（未选定）`} />
      )}
      {mine.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {mine.map((k) => (
            <li key={k.id} className={`rounded-md border p-1 ${k.selected ? "border-emerald-400" : "border-white/10"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/keyframes/${k.id}`} alt="关键帧候选" className="aspect-video w-full rounded object-cover" />
              <div className="mt-1 flex items-center gap-1">
                <button type="button" className={smallBtn} disabled={pending || k.selected} onClick={() => select(k.id)}>
                  {k.selected ? "已选定" : "选定"}
                </button>
                <button type="button" className={smallBtn} disabled={pending} onClick={() => remove(k.id)}>
                  删除
                </button>
                {k.model === CAD_KEYFRAME_MODEL ? <span className="ml-auto text-[10px] text-emerald-300">CAD</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!ready ? (
        <Link href="/settings" className="inline-block rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-sm text-neutral-400 hover:border-amber-400">
          生成关键帧 · 先配置 Higgsfield →
        </Link>
      ) : (
        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="text-xs text-neutral-400">
            生成方式
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="关键帧生成方式" className={field}>
              <option value="cad" disabled={!cadAvailable}>
                CAD 保护合成（产品零变形：Blender 渲染 + AI 空场景）
              </option>
              <option value="ai">AI 直接生成（产品可能变形，仅供参考）</option>
            </select>
          </label>
          {!cadAvailable && shot.product !== "无" ? (
            <p className="text-xs text-neutral-500">
              {!cad.model ? "CAD 模式需要先在产品页上传带材质的 GLB 模型。" : !cad.blender ? "未找到 Blender，请安装 Blender 4.2 到 /Applications。" : ""}
            </p>
          ) : null}
          {mode === "ai" ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
              <label className="text-xs text-neutral-400">
                图像模型
                <select value={model} onChange={(e) => setModel(e.target.value as KeyframeModel)} aria-label="关键帧模型" className={field}>
                  {KEYFRAME_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-neutral-400">
                候选数量
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="候选数量" className={field}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} 张
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {CAD_FIELDS.map((f) => (
                  <label key={f.key} className="text-[11px] text-neutral-400">
                    {f.label}
                    <input type="number" step={f.step} value={params[f.key]} onChange={(e) => setNum(f.key, e.target.value)} aria-label={f.label} className={numField} />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input type="checkbox" checked={params.interaction} onChange={(e) => setParams((p) => ({ ...p, interaction: e.target.checked }))} aria-label="产品与人物或场景有接触" />
                产品与人物 / 场景有接触（骑、推、扶、靠）：AI 出完整画面 → 绿色遮罩定位 → CAD 对齐替换
              </label>
              <label className={`flex items-center gap-2 text-xs text-neutral-300 ${params.interaction ? "" : "opacity-40"}`}>
                <input type="checkbox" disabled={!params.interaction} checked={params.productFirst} onChange={(e) => setParams((p) => ({ ...p, productFirst: e.target.checked }))} aria-label="产品先行" />
                产品先行（推荐）：先把真车按机位放进画面，AI 围绕这辆车画场景和人；不勾选则 AI 先画车再替换
              </label>
              {physicsRule ? <p className="text-[11px] text-amber-200/80">物理规则：{physicsRule}</p> : null}
              <label className={`flex items-center gap-2 text-xs text-neutral-300 ${params.interaction && !params.productFirst ? "opacity-40" : ""}`}>
                <input type="checkbox" disabled={params.interaction && !params.productFirst} checked={params.reusePlate} onChange={(e) => setParams((p) => ({ ...p, reusePlate: e.target.checked }))} aria-label="复用上次空场景" />
                复用该镜头上次的空场景（只调产品光线 / 位置时省一次 Flare）
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input type="checkbox" checked={params.harmonize} onChange={(e) => setParams((p) => ({ ...p, harmonize: e.target.checked }))} />
                AI 融合阴影 / 色温 / 反光（之后按遮罩贴回{productName || "产品"}的像素，产品不变）
              </label>
              {params.harmonize ? (
                <label className="text-xs text-neutral-400">
                  贴回方式
                  <select value={params.protect} onChange={(e) => setParams((p) => ({ ...p, protect: e.target.value as CadParams["protect"] }))} aria-label="产品贴回方式" className={field}>
                    <option value="grade">CAD 像素原样 + 整车统一曝光 / 色温（推荐）</option>
                    <option value="pixel">CAD 像素原样，不调光线</option>
                    <option value="tone">明暗取 AI 画面（会把背景颜色混进产品，不推荐）</option>
                  </select>
                </label>
              ) : null}
              <button type="button" className={smallBtn} onClick={() => setParams(defaultCadParams(shot))}>
                按分镜恢复默认参数
              </button>
            </div>
          )}
          <button type="button" className={smallBtn} onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? "收起提示词" : "查看 / 修改提示词"}
          </button>
          {showPrompt ? (
            <textarea rows={8} value={text} onChange={(e) => setPrompt(e.target.value)} aria-label="关键帧提示词" className={`${field} font-mono text-xs`} />
          ) : null}
          {dirty ? <p className="text-xs text-amber-200">分镜有未保存的修改，请先保存再生成。</p> : null}
          <button
            type="button"
            onClick={mode === "cad" ? generateCad : generate}
            disabled={pending || dirty || (mode === "cad" && !cadAvailable)}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40"
          >
            {pending ? (mode === "cad" ? "处理中…（渲染 + 场景约 2–5 分钟）" : "处理中…（生成每张约 30–120 秒）") : mode === "cad" ? "估价并生成（CAD 保护合成）" : "估价并生成关键帧"}
          </button>
        </div>
      )}
      {last ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="CAD 合成中间结果">
          {last.files.map(([label, url]) => (
              <figure key={label} className="text-[10px] text-neutral-400">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={label} className="aspect-video w-full rounded border border-white/10 bg-black object-contain" />
                <figcaption className="mt-0.5">{label}</figcaption>
              </figure>
            ))}
        </div>
      ) : null}
      {msg.ok ? <p className="text-xs text-emerald-300">{msg.ok}</p> : null}
      {msg.error ? <p className="text-xs text-rose-300">{msg.error}</p> : null}
    </div>
  );
}
