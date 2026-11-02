"use client";

import { useState } from "react";
import { Card, LaterButton, PlaceholderFrame, Tag } from "@/components/ui";
import { EpisodeTabs } from "@/components/workbench/EpisodeTabs";
import { demoCast, demoEpisodes } from "@/lib/mock/demo";
import type { CameraMove, EpisodeNumber, ProductPresence, ReviewStatus, Shot } from "@/lib/types";

const cameraMoves: CameraMove[] = ["固定", "推近", "拉远", "横摇", "跟拍", "环绕", "俯拍", "手持"];
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
                      镜头 {s.index} · {s.seconds}s · {s.camera}
                    </span>
                    <Tag tone={reviewLabel[r].tone}>{reviewLabel[r].text}</Tag>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{s.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.product !== "无" ? <Tag tone="amber">产品：{s.product}</Tag> : null}
                    {s.hasPetEasterEgg ? <Tag tone="emerald">猫咪彩蛋</Tag> : null}
                    {s.characterIds.length >= 3 ? <Tag tone="rose">多人 · 高复杂度</Tag> : null}
                  </div>
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
          <p className="mt-2 text-xs text-neutral-500">审核状态仅为本地标记；关键帧需先审核通过再转视频（后续实现）。</p>

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
            <div className="text-sm text-neutral-400">
              出场角色
              <div className="mt-2 flex flex-wrap gap-1">
                {selected.characterIds.length ? selected.characterIds.map((id) => <Tag key={id}>{nameOf(id)}</Tag>) : <span className="text-neutral-500">无</span>}
                {selected.hasPetEasterEgg ? <Tag tone="emerald">猫咪彩蛋</Tag> : null}
              </div>
            </div>
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
