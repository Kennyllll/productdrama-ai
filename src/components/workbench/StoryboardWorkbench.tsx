"use client";

import { useState } from "react";
import { Card, LaterButton, PlaceholderFrame, Tag } from "@/components/ui";
import { EpisodeTabs } from "@/components/workbench/EpisodeTabs";
import { checkEpisodeShots } from "@/lib/cinematic";
import { demoCast, demoEpisodes } from "@/lib/mock/demo";
import type { CameraAngle, CameraMove, EpisodeNumber, LensMm, ProductPresence, ReviewStatus, Shot, ShotSize, Transition } from "@/lib/types";

const cameraMoves: CameraMove[] = ["固定", "推近", "拉远", "横摇", "跟拍", "环绕", "俯拍", "手持"];
const shotSizes: ShotSize[] = ["大远景", "远景", "全景", "中景", "近景", "特写", "大特写"];
const lenses: LensMm[] = [18, 24, 35, 50, 85, 100, 135];
const angles: CameraAngle[] = ["平视", "低机位", "高机位", "俯视", "过肩", "主观视角"];
const transitions: Transition[] = ["硬切", "匹配剪辑", "叠化", "J-Cut", "L-Cut", "甩镜", "淡出"];
const fieldClass = "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none";
const presences: ProductPresence[] = ["主体", "背景", "无"];
const reviewLabel: Record<ReviewStatus, { text: string; tone: "neutral" | "emerald" | "rose" }> = {
  pending: { text: "待审核", tone: "neutral" },
  approved: { text: "关键帧已通过", tone: "emerald" },
  needs_changes: { text: "需修改", tone: "rose" },
};

const nameOf = (id: string) => demoCast.find((c) => c.id === id)?.name ?? id;
const initialShots = Object.fromEntries(demoEpisodes.map((e) => [e.number, e.shots])) as Record<EpisodeNumber, Shot[]>;

export function StoryboardWorkbench() {
  const [epNo, setEpNo] = useState<EpisodeNumber>(1);
  const [shotsByEp, setShotsByEp] = useState(initialShots);
  const [selectedId, setSelectedId] = useState("e1-s1");
  const [review, setReview] = useState<Record<string, ReviewStatus>>({});

  const episode = demoEpisodes.find((e) => e.number === epNo)!;
  const shots = shotsByEp[epNo];
  const selected = shots.find((s) => s.id === selectedId) ?? shots[0];
  const total = shots.reduce((sum, s) => sum + s.seconds, 0);
  const allShots = Object.values(shotsByEp).flat();
  const approvedCount = allShots.filter((s) => review[s.id] === "approved").length;
  const warnings = checkEpisodeShots(shots, episode.targetSeconds);

  const changeEpisode = (n: EpisodeNumber) => {
    setEpNo(n);
    setSelectedId(shotsByEp[n][0].id);
  };

  const updateShot = (patch: Partial<Shot>) =>
    setShotsByEp((prev) => ({ ...prev, [epNo]: prev[epNo].map((s) => (s.id === selected.id ? { ...s, ...patch } : s)) }));

  const status = review[selected.id] ?? "pending";

  return (
    <>
      <EpisodeTabs episodes={demoEpisodes} value={epNo} onChange={changeEpisode} />
      <p className="mb-4 text-sm text-neutral-400">
        本集 {shots.length} 个镜头 · 合计{" "}
        <span className={total === episode.targetSeconds ? "text-emerald-300" : "text-amber-300"}>{total}</span> / {episode.targetSeconds} 秒 ·
        全部 {allShots.length} 个镜头 · 关键帧已通过 {approvedCount}
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
        <ol className="space-y-2 lg:col-span-2" aria-label="镜头列表">
          {shots.map((s) => {
            const r = review[s.id] ?? "pending";
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  aria-current={s.id === selected.id}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    s.id === selected.id ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white">
                      镜头 {s.index} · {s.seconds}s · {s.size} · {s.lens}mm · {s.camera}
                    </span>
                    <Tag tone={reviewLabel[r].tone}>{reviewLabel[r].text}</Tag>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{s.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.product !== "无" ? <Tag tone="amber">产品：{s.product}</Tag> : null}
                    {s.hasPetEasterEgg ? <Tag tone="emerald">彩蛋</Tag> : null}
                    {s.characterIds.length >= 3 ? <Tag tone="rose">多人 · 高复杂度</Tag> : null}
                    {warnings.some((w) => w.shotIndex === s.index) ? <Tag tone="rose">电影感提示</Tag> : null}
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">→ {s.transition}</p>
                </button>
              </li>
            );
          })}
        </ol>

        <Card className="lg:col-span-3" title={`镜头 ${selected.index} 详情`} aside={<Tag tone={reviewLabel[status].tone}>{reviewLabel[status].text}</Tag>}>
          <PlaceholderFrame label={`关键帧 · ${selected.id}`} />
          <div className="mt-3 flex flex-wrap gap-2">
            <LaterButton task="TASK-006">生成关键帧</LaterButton>
            <button type="button" onClick={() => setReview((p) => ({ ...p, [selected.id]: "approved" }))} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/30">
              标记通过
            </button>
            <button type="button" onClick={() => setReview((p) => ({ ...p, [selected.id]: "needs_changes" }))} className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-500/30">
              标记需修改
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">审核状态仅为本地标记；关键帧审核通过后转视频的功能还没开放。</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-neutral-400 sm:col-span-2">
              画面描述
              <textarea
                rows={2}
                value={selected.description}
                onChange={(e) => updateShot({ description: e.target.value })}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="text-sm text-neutral-400">
              时长（秒）
              <input
                type="number"
                min={1}
                max={15}
                value={selected.seconds}
                onChange={(e) => updateShot({ seconds: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-sm text-neutral-400">
              镜头运动
              <select
                value={selected.camera}
                onChange={(e) => updateShot({ camera: e.target.value as CameraMove })}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              >
                {cameraMoves.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-neutral-400 sm:col-span-2">
              台词
              <input
                value={selected.dialogue}
                onChange={(e) => updateShot({ dialogue: e.target.value })}
                placeholder="无台词"
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-sm text-neutral-400">
              产品出场
              <select
                value={selected.product}
                onChange={(e) => updateShot({ product: e.target.value as ProductPresence })}
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              >
                {presences.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <div className="text-sm text-neutral-400 sm:col-span-2">
              出场角色
              <div className="mt-2 flex flex-wrap gap-1">
                {selected.characterIds.length ? selected.characterIds.map((id) => <Tag key={id}>{nameOf(id)}</Tag>) : <span className="text-neutral-500">无</span>}
                {selected.hasPetEasterEgg ? <Tag tone="emerald">猫咪彩蛋</Tag> : null}
              </div>
            </div>
          </div>
          <h3 className="mt-6 border-t border-white/10 pt-4 text-sm font-semibold text-amber-300/90">电影语言</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-neutral-400">
              景别
              <select value={selected.size} onChange={(e) => updateShot({ size: e.target.value as ShotSize })} className={fieldClass}>
                {shotSizes.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-neutral-400">
              焦距
              <select value={selected.lens} onChange={(e) => updateShot({ lens: Number(e.target.value) as LensMm })} className={fieldClass}>
                {lenses.map((v) => (
                  <option key={v} value={v}>
                    {v}mm
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-neutral-400">
              机位
              <select value={selected.angle} onChange={(e) => updateShot({ angle: e.target.value as CameraAngle })} className={fieldClass}>
                {angles.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-neutral-400">
              转场（切到下一镜）
              <select value={selected.transition} onChange={(e) => updateShot({ transition: e.target.value as Transition })} className={fieldClass}>
                {transitions.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-neutral-400 sm:col-span-2">
              构图
              <input value={selected.composition} onChange={(e) => updateShot({ composition: e.target.value })} className={fieldClass} />
            </label>
            <label className="text-sm text-neutral-400 sm:col-span-2">
              光线（时段 / 主光方向 / 色温）
              <input value={selected.lighting} onChange={(e) => updateShot({ lighting: e.target.value })} className={fieldClass} />
            </label>
            <label className="text-sm text-neutral-400 sm:col-span-2">
              声音设计
              <input value={selected.sound} onChange={(e) => updateShot({ sound: e.target.value })} className={fieldClass} />
            </label>
            <label className="text-sm text-neutral-400 sm:col-span-2">
              连续性 / 轴线备注
              <input value={selected.continuity} onChange={(e) => updateShot({ continuity: e.target.value })} placeholder="例如：运动方向左 → 右" className={fieldClass} />
            </label>
          </div>
          {selected.product === "主体" ? (
            <p className="mt-4 rounded-md bg-amber-400/10 p-2 text-xs text-amber-200">
              产品为画面主体：建议优先使用产品原图合成或可控动画，确保几何、颜色与 Logo 不被修改。
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}
