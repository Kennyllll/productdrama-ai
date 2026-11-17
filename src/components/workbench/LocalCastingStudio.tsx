"use client";

import { askConfirm } from "@/components/ConfirmHost";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveCastAction, setProjectEggAction } from "@/app/cast-actions";
import { Card, LaterButton, Tag } from "@/components/ui";
import { PhotoStrip } from "@/components/workbench/PhotoStrip";
import { SaveBar } from "@/components/workbench/SaveBar";
import { EGG_RULES, needsConsent } from "@/lib/cast";
import { newId } from "@/lib/creative";
import { characterKindLabel, characterRoleLabel } from "@/lib/mock/demo";
import type { CharacterKind, CharacterRole, EasterEgg, EpisodeNumber, FormState, LocalCharacter, PhotoView } from "@/lib/types";

const EPISODES: EpisodeNumber[] = [1, 2, 3, 4];
const field = "rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";
const kinds = Object.keys(characterKindLabel) as CharacterKind[];
const roles = Object.keys(characterRoleLabel) as CharacterRole[];

export function LocalCastingStudio({
  projectId,
  initialCast,
  eggs,
  initialEggId,
}: {
  projectId: string;
  initialCast: LocalCharacter[];
  eggs: EasterEgg[];
  initialEggId: string | null;
}) {
  const [cast, setCast] = useState(initialCast);
  const [savedIds, setSavedIds] = useState(() => new Set(initialCast.map((c) => c.id)));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CharacterKind>("child");
  const [role, setRole] = useState<CharacterRole>("lead");
  const [eggId, setEggId] = useState(initialEggId);
  const [eggStatus, setEggStatus] = useState<FormState>({});

  const change = (fn: (prev: LocalCharacter[]) => LocalCharacter[]) => {
    setCast(fn);
    setDirty(true);
    setStatus({});
  };
  const update = (id: string, patch: Partial<LocalCharacter>) => change((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setPhotos = (id: string, photos: PhotoView[]) => setCast((prev) => prev.map((c) => (c.id === id ? { ...c, photos } : c)));

  const add = () => {
    const n = name.trim();
    if (!n) return;
    change((prev) => [...prev, { id: newId(), name: n, kind, role, description: "", episodes: [], consentConfirmed: false, photos: [] }]);
    setName("");
  };
  const remove = async (c: LocalCharacter) => {
    if ((c.photos.length || c.description) && !await askConfirm(`删除角色「${c.name}」？${c.photos.length ? "保存后其参考照也会删除。" : ""}`)) return;
    change((prev) => prev.filter((x) => x.id !== c.id));
  };
  const toggleEpisode = (c: LocalCharacter, ep: EpisodeNumber) =>
    update(c.id, { episodes: c.episodes.includes(ep) ? c.episodes.filter((e) => e !== ep) : [...c.episodes, ep].sort() });

  const save = () =>
    startTransition(async () => {
      const res = await saveCastAction(projectId, cast);
      setStatus(res);
      if (res.ok) {
        setDirty(false);
        setSavedIds(new Set(cast.map((c) => c.id)));
      }
    });

  const chooseEgg = (id: string | null) => {
    setEggId(id);
    setEggStatus({});
    startTransition(async () => setEggStatus(await setProjectEggAction(projectId, id)));
  };

  const perEpisode = EPISODES.map((ep) => cast.filter((c) => c.episodes.includes(ep)).length);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={`角色阵容（${cast.length} 位，不设上限）`} aside={<LaterButton>AI 推荐阵容</LaterButton>}>
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <input
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="角色名称"
                aria-label="新角色名称"
                className={`${field} w-40`}
              />
              <select value={kind} onChange={(e) => setKind(e.target.value as CharacterKind)} aria-label="新角色类型" className={field}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {characterKindLabel[k]}
                  </option>
                ))}
              </select>
              <select value={role} onChange={(e) => setRole(e.target.value as CharacterRole)} aria-label="新角色定位" className={field}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {characterRoleLabel[r]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={add} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black hover:bg-amber-300">
                添加角色
              </button>
            </div>
            {cast.length === 0 ? <p className="text-sm text-neutral-500">还没有角色，先添加主角。</p> : null}
            <ul className="space-y-3">
              {cast.map((c) => (
                <li key={c.id} className="rounded-lg border border-white/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={c.name}
                      maxLength={40}
                      aria-label="角色名称"
                      onChange={(e) => update(c.id, { name: e.target.value })}
                      className={`${field} w-36 font-medium text-white`}
                    />
                    <select value={c.kind} aria-label="角色类型" onChange={(e) => update(c.id, { kind: e.target.value as CharacterKind })} className={field}>
                      {kinds.map((k) => (
                        <option key={k} value={k}>
                          {characterKindLabel[k]}
                        </option>
                      ))}
                    </select>
                    <select value={c.role} aria-label="角色定位" onChange={(e) => update(c.id, { role: e.target.value as CharacterRole })} className={field}>
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {characterRoleLabel[r]}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => remove(c)} className="ml-auto text-xs text-neutral-400 hover:text-rose-300">
                      删除
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={c.description}
                    aria-label="角色档案"
                    placeholder="角色档案：年龄、外形、服装、性格、与产品的关系"
                    onChange={(e) => update(c.id, { description: e.target.value })}
                    className={`${field} mt-2 w-full`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-300">
                    出场：
                    {EPISODES.map((ep) => (
                      <label key={ep} className="flex items-center gap-1">
                        <input type="checkbox" checked={c.episodes.includes(ep)} onChange={() => toggleEpisode(c, ep)} className="accent-amber-400" />第 {ep} 集
                      </label>
                    ))}
                    {needsConsent(c.kind) ? (
                      <label className="ml-auto flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={c.consentConfirmed}
                          onChange={(e) => update(c.id, { consentConfirmed: e.target.checked })}
                          className="accent-amber-400"
                        />
                        真人肖像已获授权{c.kind === "child" ? "（含监护人同意）" : ""}
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-neutral-500">
                      参考照 {needsConsent(c.kind) && c.photos.length > 0 && !c.consentConfirmed ? <Tag tone="rose">需确认授权</Tag> : null}
                    </p>
                    <PhotoStrip
                      owner="character"
                      ownerId={c.id}
                      photos={c.photos}
                      onChange={(p) => setPhotos(c.id, p)}
                      disabledHint={savedIds.has(c.id) ? undefined : "保存后可上传参考照"}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="四集出场人数">
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              {perEpisode.map((n, i) => (
                <div key={i} className="rounded-md bg-white/5 py-2">
                  第 {i + 1} 集：{n} 人 {n >= 4 ? <Tag tone="rose">高复杂度</Tag> : null}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">多人同框镜头生成难度和成本更高，制作前会再次提示。</p>
          </Card>
        </div>

        <Card
          title="彩蛋角色（可选）"
          aside={
            <Link href="/easter-eggs" className="text-xs text-amber-200 underline">
              管理彩蛋角色库 →
            </Link>
          }
        >
          <div role="radiogroup" aria-label="彩蛋角色" className="space-y-2">
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm ${eggId === null ? "border-amber-400 bg-amber-400/10" : "border-white/10"}`}>
              <input type="radio" name="egg" checked={eggId === null} onChange={() => chooseEgg(null)} className="accent-amber-400" />
              不使用彩蛋
            </label>
            {eggs.map((e) => (
              <label
                key={e.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm ${eggId === e.id ? "border-amber-400 bg-amber-400/10" : "border-white/10"}`}
              >
                <input type="radio" name="egg" checked={eggId === e.id} onChange={() => chooseEgg(e.id)} className="accent-amber-400" />
                {e.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 本地 API 动态图片
                  <img src={`/api/photos/${e.photos[0].id}`} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <span className="h-10 w-10 rounded bg-white/5" aria-hidden />
                )}
                <span className="flex-1">
                  <span className="text-white">{e.name}</span>
                  <span className="block text-xs text-neutral-500">
                    {e.species || "未填类型"} · {e.photos.length} 张参考照
                  </span>
                </span>
                {e.photos.length === 0 ? <Tag tone="rose">缺参考照</Tag> : null}
              </label>
            ))}
          </div>
          {eggs.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-400">
              彩蛋角色库还是空的，<Link href="/easter-eggs" className="underline">先去添加</Link>。
            </p>
          ) : null}
          {eggStatus.ok || eggStatus.error ? (
            <p role="status" className={`mt-2 text-xs ${eggStatus.error ? "text-rose-300" : "text-emerald-300"}`}>
              {eggStatus.error ?? eggStatus.ok}
            </p>
          ) : null}
          <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-neutral-300">
            {EGG_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="mt-6">
        <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} />
      </div>
    </>
  );
}
