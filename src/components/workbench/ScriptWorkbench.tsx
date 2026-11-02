"use client";

import { useMemo, useState } from "react";
import { Card, LaterButton, Tag } from "@/components/ui";
import { EpisodeTabs } from "@/components/workbench/EpisodeTabs";
import { beatTypeLabel, demoCast, demoEpisodes, totalSeconds } from "@/lib/mock/demo";
import type { EpisodeNumber } from "@/lib/types";

const nameOf = (id: string | null) => (id ? demoCast.find((c) => c.id === id)?.name ?? id : "旁白 / 字幕");

export function ScriptWorkbench() {
  const [epNo, setEpNo] = useState<EpisodeNumber>(1);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const episode = demoEpisodes.find((e) => e.number === epNo)!;
  const silentShots = episode.shots.filter((s) => !s.dialogue.trim()).length;

  const changed = useMemo(() => {
    const lines = demoEpisodes.flatMap((ep) => ep.scenes.flatMap((s) => s.lines.map((l) => ({ ...l, ep: ep.number }))));
    return lines.filter((l) => edits[l.id] !== undefined && edits[l.id] !== l.text);
  }, [edits]);

  const affectedCharacters = [...new Set(changed.map((l) => nameOf(l.characterId)))];
  const earliestEp = changed.length ? Math.min(...changed.map((l) => l.ep)) : null;

  return (
    <>
      <EpisodeTabs episodes={demoEpisodes} value={epNo} onChange={setEpNo} />
      {changed.length > 0 && (
        <div role="status" className="mb-5 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          已修改 {changed.length} 句台词。受影响角色：{affectedCharacters.join("、")}。
          {earliestEp && earliestEp < 4 ? ` 建议检查第 ${earliestEp + 1}–4 集的连贯性及相关分镜。` : " 建议检查相关分镜。"}
          <button type="button" onClick={() => setEdits({})} className="ml-3 underline">
            撤销全部修改
          </button>
        </div>
      )}
      <Card title={`第 ${episode.number} 集节拍 · ${episode.targetSeconds} 秒`} className="mb-6">
        <div className="flex h-24 items-end gap-1" aria-label="情绪曲线">
          {episode.beats.map((b) => (
            <div key={b.type} style={{ flexGrow: b.endSec - b.startSec }} className="flex h-full basis-0 flex-col justify-end">
              <div
                style={{ height: `${b.intensity * 20}%` }}
                className="rounded-t bg-gradient-to-t from-amber-500/40 to-amber-300/80"
                title={`情绪强度 ${b.intensity}/5`}
              />
            </div>
          ))}
        </div>
        <ol className="mt-2 flex gap-1">
          {episode.beats.map((b) => (
            <li key={b.type} style={{ flexGrow: b.endSec - b.startSec }} className="basis-0 rounded-md bg-white/5 p-2 text-xs">
              <span className="text-amber-300">
                {beatTypeLabel[b.type]} · {b.startSec}–{b.endSec}s
              </span>
              <p className="mt-1 text-neutral-300">{b.description}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-neutral-400">
          画面叙事：本集 {episode.shots.length} 个镜头中 {silentShots} 个无台词
          {silentShots / episode.shots.length < 0.4 ? "，台词偏多，建议更多用画面表达" : "，以画面为主"}。
        </p>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {episode.scenes.map((scene, i) => (
            <Card key={scene.id} title={`场景 ${i + 1} · ${scene.heading}`}>
              <p className="mb-3 text-sm text-neutral-400">{scene.summary}</p>
              <ul className="space-y-2">
                {scene.lines.map((l) => {
                  const value = edits[l.id] ?? l.text;
                  const modified = value !== l.text;
                  return (
                    <li key={l.id} className="grid gap-2 sm:grid-cols-[7rem_1fr]">
                      <label htmlFor={l.id} className="pt-2 text-sm text-amber-200">
                        {nameOf(l.characterId)}
                      </label>
                      <div>
                        <textarea
                          id={l.id}
                          rows={1}
                          value={value}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          className={`w-full rounded-md border bg-black/40 px-3 py-2 text-sm focus:outline-none ${
                            modified ? "border-amber-400" : "border-white/10 focus:border-amber-400"
                          }`}
                        />
                        {modified ? <Tag tone="amber">已修改</Tag> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="本集概览">
            <p className="text-sm text-white">
              第 {episode.number} 集 · {episode.title}
            </p>
            <p className="mt-2 text-sm text-neutral-400">{episode.synopsis}</p>
            <p className="mt-3 text-sm">
              目标时长 <span className="text-amber-300">{episode.targetSeconds} 秒</span> · 分镜合计 {totalSeconds(episode.shots)} 秒 ·{" "}
              {episode.scenes.length} 个场景
            </p>
          </Card>
          <Card title="四集总览">
            <ul className="space-y-2 text-sm">
              {demoEpisodes.map((ep) => (
                <li key={ep.number} className={ep.number === epNo ? "text-amber-200" : "text-neutral-400"}>
                  第 {ep.number} 集 · {ep.title}（{totalSeconds(ep.shots)} 秒）
                </li>
              ))}
            </ul>
          </Card>
          <LaterButton task="TASK-003">AI 生成 / 改写剧本</LaterButton>
        </div>
      </div>
    </>
  );
}
