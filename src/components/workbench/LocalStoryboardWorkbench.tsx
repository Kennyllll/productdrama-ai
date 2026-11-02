"use client";

import { useState, useTransition } from "react";
import { aiStoryboardAction } from "@/app/ai-actions";
import { saveStoryboardAction } from "@/app/storyboard-actions";
import { Card, LaterButton, PlaceholderFrame, Tag } from "@/components/ui";
import { AiButton, UsageNote } from "@/components/workbench/AiButton";
import { SaveBar } from "@/components/workbench/SaveBar";
import type { AiUsage } from "@/lib/ai/models";
import { VisualSpecCard } from "@/components/workbench/VisualSpecCard";
import {
  angles,
  blankShot,
  buildStoryboard,
  cameraMoves,
  checkStoryboardEpisode,
  lenses,
  presences,
  reindex,
  shotSizes,
  transitions,
} from "@/lib/storyboard";
import type {
  CameraAngle,
  CameraMove,
  EpisodeNumber,
  FilmStyle,
  FormState,
  LensMm,
  LocalCharacter,
  LocalScript,
  LocalShot,
  LocalStoryboard,
  ProductPresence,
  ReviewStatus,
  ShotSize,
  Transition,
  VisualSpec,
} from "@/lib/types";

const EPISODES: EpisodeNumber[] = [1, 2, 3, 4];
const field = "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none";
const reviewLabel: Record<ReviewStatus, { text: string; tone: "neutral" | "emerald" | "rose" }> = {
  pending: { text: "待审核", tone: "neutral" },
  approved: { text: "已通过", tone: "emerald" },
  needs_changes: { text: "需修改", tone: "rose" },
};
const sum = (shots: LocalShot[]) => shots.reduce((t, s) => t + s.seconds, 0);

export function LocalStoryboardWorkbench({
  projectId,
  script,
  style,
  cast,
  egg,
  initial,
  aiReady,
}: {
  projectId: string;
  script: LocalScript;
  style: FilmStyle;
  cast: LocalCharacter[];
  egg: { id: string; name: string } | null;
  initial: LocalStoryboard | null;
  aiReady: boolean;
}) {
  const [board, setBoard] = useState(initial);
  const [epNo, setEpNo] = useState<EpisodeNumber>(1);
  const [selectedId, setSelectedId] = useState(initial?.episodes[0]?.shots[0]?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [ai, setAi] = useState<{ board: LocalStoryboard; usage: AiUsage } | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiPending, startAi] = useTransition();

  const generate = () => {
    if (board && !window.confirm("按当前剧本重新生成分镜？会覆盖现有全部镜头和视觉规范的修改。")) return;
    const b = buildStoryboard(script, style, cast, !!egg);
    setBoard(b);
    setEpNo(1);
    setSelectedId(b.episodes[0]?.shots[0]?.id ?? "");
    setDirty(true);
    setStatus({});
  };

  const runAi = () => {
    setAiError("");
    setAi(null);
    startAi(async () => {
      const res = await aiStoryboardAction(projectId);
      if (res.error || !res.result) setAiError(res.error ?? "AI 没有返回分镜");
      else setAi({ board: res.result, usage: res.usage ?? { promptTokens: 0, completionTokens: 0 } });
    });
  };

  const acceptAi = () => {
    if (!ai) return;
    if (board && !window.confirm("用 AI 分镜覆盖现有全部镜头和视觉规范，继续吗？")) return;
    const b = ai.board;
    setBoard(b);
    setEpNo(1);
    setSelectedId(b.episodes[0]?.shots[0]?.id ?? "");
    setAi(null);
    startTransition(async () => {
      const res = await saveStoryboardAction(projectId, b);
      setStatus(res);
      setDirty(!res.ok);
    });
  };

  const aiPanel = (
    <div className="space-y-2">
      <AiButton ready={aiReady} pending={aiPending} onClick={runAi}>
        AI 设计分镜（按剧情和《{style.film}》）
      </AiButton>
      {aiPending ? <p className="text-xs text-amber-200">DeepSeek 正在设计四集分镜，通常需要 1–4 分钟…</p> : null}
      {aiError ? <p className="text-xs text-rose-300">{aiError}</p> : null}
      {ai ? (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-sm">
          <p className="text-emerald-200">AI 分镜预览（尚未采用）</p>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {ai.board.episodes.map((ep) => (
              <div key={ep.number} className="rounded-lg border border-white/10 p-2">
                <p className="text-xs text-amber-300">
                  第 {ep.number} 集 · {ep.shots.length} 个镜头 · {sum(ep.shots)} 秒
                </p>
                <ol className="mt-1 space-y-1 text-xs text-neutral-300">
                  {ep.shots.map((s) => (
                    <li key={s.id}>
                      <span className="text-neutral-500">
                        #{s.index} {s.size} · {s.angle} · {s.camera} · {s.lens}mm · {s.seconds}s{s.product === "主体" ? " · 产品主体" : ""}
                        {s.hasPetEasterEgg ? " · 彩蛋" : ""}
                      </span>{" "}
                      {s.description}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={acceptAi} className="rounded-md bg-emerald-400 px-3 py-1 text-sm font-medium text-black hover:bg-emerald-300">
              采用 AI 分镜
            </button>
            <button type="button" onClick={() => setAi(null)} className="rounded-md border border-white/15 px-3 py-1 text-sm text-neutral-300 hover:bg-white/10">
              放弃
            </button>
          </div>
          <div className="mt-2">
            <UsageNote usage={ai.usage} />
          </div>
        </div>
      ) : null}
    </div>
  );

  if (!board) {
    return (
      <Card title="生成分镜">
        <p className="text-sm text-neutral-300">
          按剧本每集的节拍生成模板分镜（非 AI），约每 7 秒一个镜头。光线、构图和产品拍法套用创意页选定的
          <span className="text-amber-200">《{style.film}》</span>，生成后可以逐镜修改并保存。
        </p>
        <button type="button" onClick={generate} className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300">
          按剧本生成分镜
        </button>
        <div className="mt-4 border-t border-white/10 pt-4">{aiPanel}</div>
      </Card>
    );
  }

  const shots = board.episodes.find((e) => e.number === epNo)?.shots ?? [];
  const selected = shots.find((s) => s.id === selectedId) ?? shots[0];
  const total = sum(shots);
  const warnings = checkStoryboardEpisode(shots, !!egg);
  const scriptEp = script.episodes.find((e) => e.number === epNo);
  const outdated = board.sourceProposalId !== script.proposalId;
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? "已删除角色";

  const touch = () => {
    setDirty(true);
    setStatus({});
  };
  const setShots = (fn: (list: LocalShot[]) => LocalShot[]) => {
    setBoard((b) => b && { ...b, episodes: b.episodes.map((e) => (e.number === epNo ? { ...e, shots: reindex(fn(e.shots)) } : e)) });
    touch();
  };
  const updateShot = (patch: Partial<LocalShot>) => {
    if (selected) setShots((list) => list.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
  };
  const addShot = () => {
    const s = blankShot(style);
    setShots((list) => {
      const i = selected ? list.findIndex((x) => x.id === selected.id) : list.length - 1;
      const next = [...list];
      next.splice(i + 1, 0, s);
      return next;
    });
    setSelectedId(s.id);
  };
  const removeShot = () => {
    if (!selected || !window.confirm(`删除镜头 ${selected.index}？`)) return;
    const i = shots.findIndex((x) => x.id === selected.id);
    setShots((list) => list.filter((x) => x.id !== selected.id));
    setSelectedId(shots[i + 1]?.id ?? shots[i - 1]?.id ?? "");
  };
  const moveShot = (d: -1 | 1) =>
    setShots((list) => {
      const i = list.findIndex((x) => x.id === selected?.id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggleCharacter = (id: string) =>
    selected && updateShot({ characterIds: selected.characterIds.includes(id) ? selected.characterIds.filter((x) => x !== id) : [...selected.characterIds, id] });
  const setSpec = (visualSpec: VisualSpec) => {
    setBoard((b) => b && { ...b, visualSpec });
    touch();
  };
  const changeEpisode = (n: EpisodeNumber) => {
    setEpNo(n);
    setSelectedId(board.episodes.find((e) => e.number === n)?.shots[0]?.id ?? "");
  };
  const save = () =>
    startTransition(async () => {
      const res = await saveStoryboardAction(projectId, board);
      setStatus(res);
      if (res.ok) setDirty(false);
    });

  return (
    <>
      {outdated ? (
        <p role="note" className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 text-sm text-amber-100">
          剧本已改为按另一个提案生成，当前分镜不会自动更新。需要时点「按剧本重新生成」。
        </p>
      ) : null}
      <Card title="AI 分镜" className="mb-4">
        {aiPanel}
      </Card>
      <VisualSpecCard value={board.visualSpec} onChange={setSpec} referenceNote="（默认取自创意页选定的参考作品，可修改）" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="分集" className="flex flex-wrap gap-2">
          {EPISODES.map((n) => {
            const ep = board.episodes.find((e) => e.number === n);
            const t = sum(ep?.shots ?? []);
            return (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={epNo === n}
                onClick={() => changeEpisode(n)}
                className={`rounded-lg border px-3 py-2 text-sm ${epNo === n ? "border-amber-400 bg-amber-400/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"}`}
              >
                第 {n} 集 · {script.episodes.find((e) => e.number === n)?.title || "未命名"}
                <span className={`ml-2 text-xs ${t === 45 ? "text-emerald-300" : "text-amber-300"}`}>{t}s</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={generate} className="ml-auto text-xs text-neutral-400 underline hover:text-white">
          按剧本重新生成
        </button>
      </div>

      <p className="mb-3 text-sm text-neutral-400">
        {scriptEp?.synopsis ? `本集梗概：${scriptEp.synopsis} · ` : ""}
        {shots.length} 个镜头 · 合计 <span className={total === 45 ? "text-emerald-300" : "text-amber-300"}>{total}</span> / 45 秒
      </p>
      <div
        role="status"
        className={`mb-5 rounded-lg border p-3 text-sm ${
          warnings.length ? "border-rose-400/40 bg-rose-400/5 text-rose-100" : "border-emerald-400/40 bg-emerald-400/5 text-emerald-100"
        }`}
      >
        <p className="font-medium">电影语言检查（本地规则，非 AI）：{warnings.length ? `${warnings.length} 条提示` : "本集未发现问题"}</p>
        {warnings.length ? (
          <ul className="mt-1 list-inside list-disc text-xs">
            {warnings.map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ol className="space-y-2" aria-label="镜头列表">
            {shots.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  aria-current={s.id === selected?.id}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    s.id === selected?.id ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white">
                      镜头 {s.index} · {s.seconds}s · {s.size} · {s.lens}mm · {s.camera}
                    </span>
                    <Tag tone={reviewLabel[s.review].tone}>{reviewLabel[s.review].text}</Tag>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{s.description || "（未填写画面描述）"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.product !== "无" ? <Tag tone="amber">产品：{s.product}</Tag> : null}
                    {s.hasPetEasterEgg ? <Tag tone="emerald">彩蛋{egg ? `：${egg.name}` : ""}</Tag> : null}
                    {s.characterIds.length >= 3 ? <Tag tone="rose">多人 · 高复杂度</Tag> : null}
                    {warnings.some((w) => w.shotIndex === s.index) ? <Tag tone="rose">电影感提示</Tag> : null}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">→ {s.transition}</p>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={addShot} className="rounded-lg border border-white/10 px-3 py-1.5 text-neutral-200 hover:border-amber-400">
              + 在后面插入镜头
            </button>
            <button type="button" onClick={() => moveShot(-1)} disabled={!selected} className="rounded-lg border border-white/10 px-3 py-1.5 text-neutral-300 disabled:opacity-40">
              上移
            </button>
            <button type="button" onClick={() => moveShot(1)} disabled={!selected} className="rounded-lg border border-white/10 px-3 py-1.5 text-neutral-300 disabled:opacity-40">
              下移
            </button>
            <button type="button" onClick={removeShot} disabled={!selected} className="rounded-lg px-3 py-1.5 text-neutral-400 hover:text-rose-300 disabled:opacity-40">
              删除镜头
            </button>
          </div>
        </div>

        {selected ? (
          <Card
            className="lg:col-span-3"
            title={`镜头 ${selected.index} 详情`}
            aside={<Tag tone={reviewLabel[selected.review].tone}>{reviewLabel[selected.review].text}</Tag>}
          >
            <PlaceholderFrame label={`关键帧 · 镜头 ${selected.index}（未生成）`} />
            <div className="mt-3 flex flex-wrap gap-2">
              <LaterButton>生成关键帧</LaterButton>
              <button
                type="button"
                onClick={() => updateShot({ review: "approved" })}
                className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/30"
              >
                标记通过
              </button>
              <button
                type="button"
                onClick={() => updateShot({ review: "needs_changes" })}
                className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-500/30"
              >
                标记需修改
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-neutral-400 sm:col-span-2">
                画面描述
                <textarea rows={2} maxLength={500} value={selected.description} onChange={(e) => updateShot({ description: e.target.value })} className={field} />
              </label>
              <label className="text-sm text-neutral-400">
                时长（秒）
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={selected.seconds}
                  onChange={(e) => updateShot({ seconds: Math.max(1, Math.min(15, Math.round(Number(e.target.value)) || 1)) })}
                  className={field}
                />
              </label>
              <label className="text-sm text-neutral-400">
                镜头运动
                <select value={selected.camera} onChange={(e) => updateShot({ camera: e.target.value as CameraMove })} className={field}>
                  {cameraMoves.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-400 sm:col-span-2">
                台词
                <input value={selected.dialogue} maxLength={500} onChange={(e) => updateShot({ dialogue: e.target.value })} placeholder="无台词" className={field} />
              </label>
              <label className="text-sm text-neutral-400">
                产品出场
                <select value={selected.product} onChange={(e) => updateShot({ product: e.target.value as ProductPresence })} className={field}>
                  {presences.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-400">
                产品出现方式
                <input
                  value={selected.productNote}
                  maxLength={500}
                  disabled={selected.product === "无"}
                  onChange={(e) => updateShot({ productNote: e.target.value })}
                  placeholder={selected.product === "无" ? "本镜不出现产品" : "角度、动作、与角色的互动"}
                  className={`${field} disabled:opacity-40`}
                />
              </label>
              <div className="text-sm text-neutral-400 sm:col-span-2">
                出场角色
                <div className="mt-2 flex flex-wrap gap-2">
                  {cast.length === 0 ? <span className="text-xs text-neutral-500">选角工作台还没有角色</span> : null}
                  {cast.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected.characterIds.includes(c.id)}
                      onClick={() => toggleCharacter(c.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        selected.characterIds.includes(c.id) ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-white/10 text-neutral-400"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {selected.characterIds
                    .filter((id) => !cast.some((c) => c.id === id))
                    .map((id) => (
                      <Tag key={id} tone="rose">
                        {nameOf(id)}
                      </Tag>
                    ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.hasPetEasterEgg}
                    disabled={!egg && !selected.hasPetEasterEgg}
                    onChange={(e) => updateShot({ hasPetEasterEgg: e.target.checked })}
                    className="accent-amber-400"
                  />
                  {egg ? `彩蛋：${egg.name}（本镜内可见 1–3 秒）` : "彩蛋（本项目未在选角页选用彩蛋角色）"}
                </label>
              </div>
            </div>

            <h3 className="mt-6 border-t border-white/10 pt-4 text-sm font-semibold text-amber-300/90">电影语言</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm text-neutral-400">
                景别
                <select value={selected.size} onChange={(e) => updateShot({ size: e.target.value as ShotSize })} className={field}>
                  {shotSizes.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-400">
                焦距
                <select value={selected.lens} onChange={(e) => updateShot({ lens: Number(e.target.value) as LensMm })} className={field}>
                  {lenses.map((v) => (
                    <option key={v} value={v}>
                      {v}mm
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-400">
                机位
                <select value={selected.angle} onChange={(e) => updateShot({ angle: e.target.value as CameraAngle })} className={field}>
                  {angles.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-400">
                转场（切到下一镜）
                <select value={selected.transition} onChange={(e) => updateShot({ transition: e.target.value as Transition })} className={field}>
                  {transitions.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-400 sm:col-span-2">
                构图
                <input value={selected.composition} maxLength={300} onChange={(e) => updateShot({ composition: e.target.value })} className={field} />
              </label>
              <label className="text-sm text-neutral-400 sm:col-span-2">
                光线（时段 / 主光方向 / 色温）
                <input value={selected.lighting} maxLength={300} onChange={(e) => updateShot({ lighting: e.target.value })} className={field} />
              </label>
              <label className="text-sm text-neutral-400 sm:col-span-2">
                声音设计
                <input value={selected.sound} maxLength={300} onChange={(e) => updateShot({ sound: e.target.value })} className={field} />
              </label>
              <label className="text-sm text-neutral-400 sm:col-span-2">
                连续性 / 轴线备注
                <input
                  value={selected.continuity}
                  maxLength={300}
                  onChange={(e) => updateShot({ continuity: e.target.value })}
                  placeholder="例如：运动方向左 → 右"
                  className={field}
                />
              </label>
            </div>
            {selected.product === "主体" ? (
              <p className="mt-4 rounded-md bg-amber-400/10 p-2 text-xs text-amber-200">
                产品为画面主体：后续生成时优先使用产品原图合成或可控动画，确保几何、颜色与 Logo 不被修改。
              </p>
            ) : null}
          </Card>
        ) : (
          <Card className="lg:col-span-3" title="本集还没有镜头">
            <p className="text-sm text-neutral-400">点「+ 在后面插入镜头」新增，或按剧本重新生成。</p>
          </Card>
        )}
      </div>
      <div className="mt-6">
        <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} />
      </div>
    </>
  );
}
