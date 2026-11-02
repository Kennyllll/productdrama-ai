"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { aiScriptAction } from "@/app/ai-actions";
import { saveScriptAction } from "@/app/creative-actions";
import { Card, Tag } from "@/components/ui";
import { AiButton, UsageNote } from "@/components/workbench/AiButton";
import { SaveBar } from "@/components/workbench/SaveBar";
import type { AiUsage } from "@/lib/ai/models";
import { buildSkeleton, checkEpisode, dialogueSeconds, emptyScene, EPISODE_SECONDS, newId } from "@/lib/creative";
import { beatTypeLabel } from "@/lib/mock/demo";
import type { Beat, EpisodeNumber, FormState, LocalProposal, LocalScene, LocalScript, ScriptEpisode } from "@/lib/types";

const field = "w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";
const smallBtn = "rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-30";

export function LocalScriptWorkbench({
  projectId,
  initial,
  proposal,
  aiReady,
}: {
  projectId: string;
  initial: LocalScript | null;
  proposal: LocalProposal | null;
  aiReady: boolean;
}) {
  const [script, setScript] = useState(initial);
  const [epNo, setEpNo] = useState<EpisodeNumber>(1);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [ai, setAi] = useState<{ script: LocalScript; usage: AiUsage } | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiPending, startAi] = useTransition();

  const persist = (s: LocalScript) =>
    startTransition(async () => {
      const res = await saveScriptAction(projectId, s);
      setStatus(res);
      if (res.ok) setDirty(false);
    });

  const generate = () => {
    if (!proposal) return;
    if (script && !window.confirm("重新生成会覆盖当前四集剧本（包括所有修改），继续吗？")) return;
    const s = buildSkeleton(proposal);
    setScript(s);
    setEpNo(1);
    persist(s);
  };

  const runAi = () => {
    setAiError("");
    setAi(null);
    startAi(async () => {
      const res = await aiScriptAction(projectId);
      if (res.error || !res.result) setAiError(res.error ?? "AI 没有返回剧本");
      else setAi({ script: res.result, usage: res.usage ?? { promptTokens: 0, completionTokens: 0 } });
    });
  };

  const acceptAi = () => {
    if (!ai) return;
    if (script && !window.confirm("用 AI 剧本覆盖当前四集剧本（包括所有修改），继续吗？")) return;
    setScript(ai.script);
    setEpNo(1);
    persist(ai.script);
    setAi(null);
  };

  const aiPanel = (
    <div className="space-y-2">
      <AiButton ready={aiReady} pending={aiPending} onClick={runAi}>
        AI 写四集剧本（英文台词 + 中文翻译）
      </AiButton>
      {aiPending ? <p className="text-xs text-amber-200">DeepSeek 正在写四集剧本，通常需要 1–3 分钟…</p> : null}
      {aiError ? <p className="text-xs text-rose-300">{aiError}</p> : null}
      {ai ? (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-sm">
          <p className="text-emerald-200">AI 剧本预览（尚未采用）</p>
          <ul className="mt-2 space-y-2">
            {ai.script.episodes.map((ep) => (
              <li key={ep.number}>
                <span className="text-xs text-amber-300">
                  第 {ep.number} 集 · {ep.title || "未命名"}
                </span>
                <p className="text-neutral-300">{ep.synopsis}</p>
                <p className="text-xs text-neutral-500">
                  {ep.beats.length} 个节拍 · {ep.scenes.length} 个场景 · 台词约 {dialogueSeconds(ep)} 秒
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={acceptAi} className="rounded-md bg-emerald-400 px-3 py-1 text-sm font-medium text-black hover:bg-emerald-300">
              采用 AI 剧本
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

  if (!script) {
    return proposal ? (
      <Card title="生成剧本骨架">
        <p className="text-sm text-neutral-300">
          基于选定提案「{proposal.title}」生成四集剧本骨架：每集 {EPISODE_SECONDS} 秒，含默认节拍（钩子 / 冲突 / 转折 / 悬念，第 4 集为收束）和一个空场景。这是本地模板，不是 AI 生成。
        </p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-4">
          {proposal.episodeArcs.map((arc, i) => (
            <li key={i} className="rounded-md border border-white/10 px-3 py-2 text-sm">
              <span className="text-xs text-amber-300">第 {i + 1} 集</span>
              <br />
              {arc}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40"
        >
          生成四集剧本骨架
        </button>
        <div className="mt-4 border-t border-white/10 pt-4">{aiPanel}</div>
        {status.error ? <p className="mt-2 text-sm text-rose-300">{status.error}</p> : null}
      </Card>
    ) : (
      <Card title="还没有选定提案">
        <p className="text-sm text-neutral-300">请先在创意页生成提案、选定一个并保存。</p>
        <Link href={`/projects/${projectId}/creative`} className="mt-3 inline-block text-sm text-amber-200 underline">
          去创意页 →
        </Link>
      </Card>
    );
  }

  const episode = script.episodes[epNo - 1];
  const warnings = checkEpisode(episode);
  const outdated = proposal !== null && script.proposalId !== proposal.id;

  const updateEp = (fn: (ep: ScriptEpisode) => ScriptEpisode) => {
    setScript((prev) => prev && { ...prev, episodes: prev.episodes.map((e) => (e.number === epNo ? fn(e) : e)) });
    setDirty(true);
    setStatus({});
  };
  const updateBeat = (i: number, patch: Partial<Beat>) =>
    updateEp((ep) => ({ ...ep, beats: ep.beats.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const updateScene = (id: string, fn: (s: LocalScene) => LocalScene) =>
    updateEp((ep) => ({ ...ep, scenes: ep.scenes.map((s) => (s.id === id ? fn(s) : s)) }));
  const moveScene = (i: number, d: -1 | 1) =>
    updateEp((ep) => {
      const scenes = [...ep.scenes];
      [scenes[i], scenes[i + d]] = [scenes[i + d], scenes[i]];
      return { ...ep, scenes };
    });
  const removeScene = (s: LocalScene) => {
    if ((s.lines.length || s.heading || s.summary) && !window.confirm("删除这个场景及其台词？")) return;
    updateEp((ep) => ({ ...ep, scenes: ep.scenes.filter((x) => x.id !== s.id) }));
  };

  return (
    <>
      {outdated && (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          当前剧本是按另一个提案生成的，选定提案「{proposal.title}」的修改不会自动同步。
          <button type="button" onClick={generate} className="underline">
            按当前提案重新生成
          </button>
        </div>
      )}
      <div role="tablist" aria-label="集数" className="mb-5 flex flex-wrap gap-2">
        {script.episodes.map((ep) => {
          const n = checkEpisode(ep).length;
          return (
            <button
              key={ep.number}
              type="button"
              role="tab"
              aria-selected={ep.number === epNo}
              onClick={() => setEpNo(ep.number)}
              className={`rounded-lg px-3 py-1.5 text-sm ${ep.number === epNo ? "bg-amber-400 text-black" : "bg-white/5 hover:bg-white/10"}`}
            >
              第 {ep.number} 集 · {ep.title || "未命名"}
              {n > 0 ? <span className="ml-1 text-xs opacity-70">（{n} 项提示）</span> : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`第 ${epNo} 集 · 基本信息`}>
            <label className="block text-sm text-neutral-300">
              分集标题
              <input value={episode.title} maxLength={100} onChange={(e) => updateEp((ep) => ({ ...ep, title: e.target.value }))} className={`${field} mt-1`} />
            </label>
            <label className="mt-3 block text-sm text-neutral-300">
              本集梗概
              <textarea
                rows={2}
                maxLength={1000}
                value={episode.synopsis}
                onChange={(e) => updateEp((ep) => ({ ...ep, synopsis: e.target.value }))}
                className={`${field} mt-1`}
              />
            </label>
          </Card>

          <Card title={`节拍与情绪曲线 · ${EPISODE_SECONDS} 秒`}>
            <div className="flex h-20 items-end gap-1" aria-label="情绪曲线">
              {episode.beats.map((b, i) => (
                <div key={i} style={{ flexGrow: Math.max(1, b.endSec - b.startSec) }} className="flex h-full basis-0 flex-col justify-end">
                  <div style={{ height: `${b.intensity * 20}%` }} className="rounded-t bg-gradient-to-t from-amber-500/40 to-amber-300/80" title={`情绪强度 ${b.intensity}/5`} />
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-3">
              {episode.beats.map((b, i) => (
                <li key={i} className="grid gap-2 rounded-lg bg-white/5 p-3 sm:grid-cols-[6rem_9rem_7rem_1fr] sm:items-center">
                  <span className="text-sm text-amber-300">{beatTypeLabel[b.type]}</span>
                  <span className="flex items-center gap-1 text-xs text-neutral-400">
                    <input
                      type="number"
                      min={0}
                      max={EPISODE_SECONDS}
                      value={b.startSec}
                      aria-label={`${beatTypeLabel[b.type]}开始秒数`}
                      onChange={(e) => updateBeat(i, { startSec: Number(e.target.value) })}
                      className={`${field} w-14 px-2 py-1`}
                    />
                    –
                    <input
                      type="number"
                      min={0}
                      max={EPISODE_SECONDS}
                      value={b.endSec}
                      aria-label={`${beatTypeLabel[b.type]}结束秒数`}
                      onChange={(e) => updateBeat(i, { endSec: Number(e.target.value) })}
                      className={`${field} w-14 px-2 py-1`}
                    />
                    s
                  </span>
                  <select
                    value={b.intensity}
                    aria-label={`${beatTypeLabel[b.type]}情绪强度`}
                    onChange={(e) => updateBeat(i, { intensity: Number(e.target.value) as Beat["intensity"] })}
                    className={`${field} px-2 py-1`}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        强度 {n}
                      </option>
                    ))}
                  </select>
                  <input
                    value={b.description}
                    maxLength={500}
                    placeholder="这一段发生什么（用画面描述）"
                    aria-label={`${beatTypeLabel[b.type]}描述`}
                    onChange={(e) => updateBeat(i, { description: e.target.value })}
                    className={field}
                  />
                </li>
              ))}
            </ul>
          </Card>

          {episode.scenes.map((scene, i) => (
            <Card
              key={scene.id}
              title={`场景 ${i + 1}`}
              aside={
                <span className="flex gap-1">
                  <button type="button" className={smallBtn} disabled={i === 0} onClick={() => moveScene(i, -1)} aria-label="上移场景">
                    上移
                  </button>
                  <button type="button" className={smallBtn} disabled={i === episode.scenes.length - 1} onClick={() => moveScene(i, 1)} aria-label="下移场景">
                    下移
                  </button>
                  <button type="button" className={smallBtn} onClick={() => removeScene(scene)}>
                    删除
                  </button>
                </span>
              }
            >
              <input
                value={scene.heading}
                maxLength={100}
                placeholder="场景标题，例如：外景 · 街道 · 黄昏"
                aria-label="场景标题"
                onChange={(e) => updateScene(scene.id, (s) => ({ ...s, heading: e.target.value }))}
                className={field}
              />
              <textarea
                rows={2}
                maxLength={1000}
                value={scene.summary}
                placeholder="场景摘要：人物、动作、产品如何出现"
                aria-label="场景摘要"
                onChange={(e) => updateScene(scene.id, (s) => ({ ...s, summary: e.target.value }))}
                className={`${field} mt-2`}
              />
              <ul className="mt-3 space-y-2">
                {scene.lines.map((l) => (
                  <li key={l.id} className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                    <input
                      value={l.speaker}
                      maxLength={40}
                      placeholder="旁白"
                      aria-label="说话人"
                      onChange={(e) =>
                        updateScene(scene.id, (s) => ({ ...s, lines: s.lines.map((x) => (x.id === l.id ? { ...x, speaker: e.target.value } : x)) }))
                      }
                      className={`${field} text-amber-200`}
                    />
                    <div className="space-y-1">
                    <textarea
                      rows={1}
                      maxLength={500}
                      value={l.text}
                      placeholder="台词（英文）/ 字幕"
                      aria-label="台词"
                      onChange={(e) =>
                        updateScene(scene.id, (s) => ({ ...s, lines: s.lines.map((x) => (x.id === l.id ? { ...x, text: e.target.value } : x)) }))
                      }
                      className={field}
                    />
                    <input
                      value={l.translation ?? ""}
                      maxLength={500}
                      placeholder="中文翻译（可选）"
                      aria-label="中文翻译"
                      onChange={(e) =>
                        updateScene(scene.id, (s) => ({ ...s, lines: s.lines.map((x) => (x.id === l.id ? { ...x, translation: e.target.value } : x)) }))
                      }
                      className={`${field} text-xs text-neutral-400`}
                    />
                    </div>
                    <button
                      type="button"
                      className={smallBtn}
                      onClick={() => updateScene(scene.id, (s) => ({ ...s, lines: s.lines.filter((x) => x.id !== l.id) }))}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`${smallBtn} mt-3`}
                onClick={() => updateScene(scene.id, (s) => ({ ...s, lines: [...s.lines, { id: newId(), speaker: "", text: "" }] }))}
              >
                + 添加台词
              </button>
            </Card>
          ))}
          <button
            type="button"
            onClick={() => updateEp((ep) => ({ ...ep, scenes: [...ep.scenes, emptyScene()] }))}
            className="w-full rounded-xl border border-dashed border-white/20 py-3 text-sm text-neutral-300 hover:border-amber-400"
          >
            + 添加场景
          </button>
        </div>

        <div className="space-y-4">
          <Card title="本地规则检查（非 AI）">
            <p className="text-sm text-neutral-300">
              台词约 <span className="text-amber-300">{dialogueSeconds(episode)} 秒</span> / {EPISODE_SECONDS} 秒（英文按 2.5 词 / 秒、中文按 4 字 / 秒估算）
            </p>
            {warnings.length === 0 ? (
              <p className="mt-2 text-sm text-emerald-300">本集没有问题</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="四集总览">
            <ul className="space-y-2 text-sm">
              {script.episodes.map((ep) => (
                <li key={ep.number} className={ep.number === epNo ? "text-amber-200" : "text-neutral-400"}>
                  第 {ep.number} 集 · {ep.title || "未命名"} · {ep.scenes.length} 个场景
                </li>
              ))}
            </ul>
            {proposal ? (
              <p className="mt-3 text-xs text-neutral-500">
                选定提案：<Tag>{proposal.title}</Tag>
              </p>
            ) : null}
          </Card>
          {proposal ? <Card title="AI 剧本">{aiPanel}</Card> : null}
        </div>
      </div>

      <div className="mt-6">
        <SaveBar dirty={dirty} pending={pending} status={status} onSave={() => persist(script)} />
      </div>
    </>
  );
}
