"use client";

import { useState } from "react";
import { Card, LaterButton, MockBadge, PlaceholderFrame, Tag } from "@/components/ui";
import { characterKindLabel, characterRoleLabel, demoCast, petEasterEgg } from "@/lib/mock/demo";
import type { Character, CharacterKind, CharacterRole, EpisodeNumber } from "@/lib/types";

const EPISODES: EpisodeNumber[] = [1, 2, 3, 4];

export function CastingStudio() {
  const [cast, setCast] = useState<Character[]>(demoCast);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CharacterKind>("child");
  const [role, setRole] = useState<CharacterRole>("supporting");

  const addCharacter = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCast((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name: trimmed,
        kind,
        role,
        description: "新增角色（待完善角色档案）",
        episodes: [],
        requiresConsent: false,
      },
    ]);
    setName("");
  };

  const removeCharacter = (id: string) => setCast((prev) => prev.filter((c) => c.id !== id));

  const toggleEpisode = (id: string, ep: EpisodeNumber) =>
    setCast((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, episodes: c.episodes.includes(ep) ? c.episodes.filter((e) => e !== ep) : [...c.episodes, ep].sort() }
          : c,
      ),
    );

  const perEpisode = EPISODES.map((ep) => cast.filter((c) => c.episodes.includes(ep)).length);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card title={`角色阵容（${cast.length} 位，不设上限）`} aside={<LaterButton task="TASK-004">AI 推荐阵容</LaterButton>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {cast.map((c) => (
              <article key={c.id} className="flex gap-3 rounded-lg border border-white/10 p-3">
                <PlaceholderFrame label="定妆图" className="aspect-square w-20 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white">{c.name}</p>
                    <button
                      type="button"
                      onClick={() => removeCharacter(c.id)}
                      className="text-xs text-neutral-500 hover:text-rose-300"
                      aria-label={`删除角色 ${c.name}`}
                    >
                      删除
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Tag tone={c.role === "lead" ? "amber" : "neutral"}>{characterRoleLabel[c.role]}</Tag>
                    <Tag>{characterKindLabel[c.kind]}</Tag>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">{c.description}</p>
                </div>
              </article>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addCharacter();
            }}
            className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-white/5 p-3"
          >
            <label className="text-xs text-neutral-400">
              角色名
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：邻居奶奶"
                className="mt-1 block rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
              />
            </label>
            <label className="text-xs text-neutral-400">
              类型
              <select value={kind} onChange={(e) => setKind(e.target.value as CharacterKind)} className="mt-1 block rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white">
                {Object.entries(characterKindLabel).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-400">
              定位
              <select value={role} onChange={(e) => setRole(e.target.value as CharacterRole)} className="mt-1 block rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white">
                {Object.entries(characterRoleLabel).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={!name.trim()} className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40">
              新增角色
            </button>
          </form>
          <p className="mt-3 text-xs text-neutral-500">真实儿童与真人形象须有合法授权；示例角色均为虚构。</p>
        </Card>

        <Card title="四集出场安排">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="py-2 pr-4 font-normal">角色</th>
                  {EPISODES.map((ep) => (
                    <th key={ep} className="px-2 py-2 text-center font-normal">第 {ep} 集</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cast.map((c) => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-white">{c.name}</td>
                    {EPISODES.map((ep) => (
                      <td key={ep} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={c.episodes.includes(ep)}
                          onChange={() => toggleEpisode(c.id, ep)}
                          aria-label={`${c.name} 第 ${ep} 集出场`}
                          className="accent-amber-400"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-white/10 text-xs text-neutral-400">
                  <td className="py-2 pr-4">出场人数</td>
                  {perEpisode.map((n, i) => (
                    <td key={i} className="px-2 py-2 text-center">
                      {n} {n >= 4 ? <Tag tone="rose">高复杂度</Tag> : null}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-500">多人同框镜头生成难度和成本更高，后续会在制作前提示。</p>
        </Card>
      </div>

      <Card title="猫咪彩蛋（可选）" aside={<MockBadge>固定隐藏彩蛋</MockBadge>}>
        <PlaceholderFrame label="猫咪多角度参考照（待上传）" />
        <p className="mt-3 text-sm text-white">{petEasterEgg.name}</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-300">
          {petEasterEgg.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <h3 className="mt-4 text-xs font-semibold text-neutral-400">每集出现安排</h3>
        <ul className="mt-2 space-y-2">
          {petEasterEgg.appearances.map((a) => (
            <li key={a.episode} className="rounded-md bg-white/5 px-3 py-2 text-xs">
              <span className="text-amber-300">第 {a.episode} 集</span> · 镜头 {a.shotId} · {a.seconds} 秒 · {a.action}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <LaterButton task="TASK-004">上传猫咪参考照</LaterButton>
        </div>
      </Card>
    </div>
  );
}
