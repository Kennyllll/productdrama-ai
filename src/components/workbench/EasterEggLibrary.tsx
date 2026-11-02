"use client";

import { useActionState, useState, useTransition } from "react";
import { createEggAction, deleteEggAction, updateEggAction } from "@/app/cast-actions";
import { Card, Tag } from "@/components/ui";
import { PhotoStrip } from "@/components/workbench/PhotoStrip";
import type { EasterEgg, FormState } from "@/lib/types";

const field = "w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

export function EasterEggLibrary({ eggs }: { eggs: EasterEgg[] }) {
  const [state, formAction, creating] = useActionState(createEggAction, {} as FormState);
  return (
    <div className="space-y-6">
      <Card title="添加彩蛋角色">
        <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm text-neutral-300">
            名称
            <input name="name" required maxLength={40} placeholder="例如：团子" className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-neutral-300">
            类型
            <input name="species" maxLength={20} placeholder="猫 / 狗 / 吉祥物 / 玩偶" className={`${field} mt-1`} />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40"
          >
            添加
          </button>
        </form>
        {state.error || state.ok ? (
          <p role="status" className={`mt-2 text-sm ${state.error ? "text-rose-300" : "text-emerald-300"}`}>
            {state.error ?? state.ok}
          </p>
        ) : null}
      </Card>
      {eggs.length === 0 ? (
        <p className="text-sm text-neutral-500">还没有彩蛋角色。</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {eggs.map((e) => (
            <EggCard key={e.id} egg={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EggCard({ egg }: { egg: EasterEgg }) {
  const [v, setV] = useState({ name: egg.name, species: egg.species, notes: egg.notes });
  const [photos, setPhotos] = useState(egg.photos);
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const dirty = v.name !== egg.name || v.species !== egg.species || v.notes !== egg.notes;

  const save = () => startTransition(async () => setStatus(await updateEggAction(egg.id, v)));
  const remove = () => {
    if (!window.confirm(`删除彩蛋角色「${egg.name}」及其全部参考照？正在使用它的项目将改为不使用彩蛋。`)) return;
    startTransition(async () => {
      const res = await deleteEggAction(egg.id);
      if (res.error) setStatus(res);
    });
  };

  return (
    <Card title={egg.name} aside={photos.length ? <Tag tone="emerald">{photos.length} 张参考照</Tag> : <Tag tone="rose">缺参考照</Tag>}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-neutral-400">
          名称
          <input value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-neutral-400">
          类型
          <input value={v.species} maxLength={20} onChange={(e) => setV({ ...v, species: e.target.value })} className={`${field} mt-1`} />
        </label>
      </div>
      <label className="mt-2 block text-xs text-neutral-400">
        外形备注
        <textarea
          rows={2}
          maxLength={500}
          value={v.notes}
          placeholder="颜色花纹、体型、标志性动作，用于保持每集形象一致"
          onChange={(e) => setV({ ...v, notes: e.target.value })}
          className={`${field} mt-1`}
        />
      </label>
      <p className="mb-1 mt-3 text-xs text-neutral-500">参考照（多角度，最多 10 张）</p>
      <PhotoStrip owner="egg" ownerId={egg.id} photos={photos} onChange={setPhotos} />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40"
        >
          保存
        </button>
        <button type="button" onClick={remove} disabled={pending} className="text-sm text-neutral-400 hover:text-rose-300">
          删除角色
        </button>
        {status.error || status.ok ? (
          <span role="status" className={`text-xs ${status.error ? "text-rose-300" : "text-emerald-300"}`}>
            {status.error ?? status.ok}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
