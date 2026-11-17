"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useState, useTransition } from "react";
import { deleteFamilyAction, saveFamilyAction } from "@/app/family-actions";
import { MEMBER_ROLES, memberKind, type Bi, type Family, type FamilyData, type FamilyMember } from "@/lib/families";
import { THEMES } from "@/lib/shorts-scenes";

const inp = "w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white";
const blank = (): FamilyData => ({ name: "", about: { zh: "", en: "" }, members: [], themeWear: {} });

function BiField({ label, v, onChange }: { label: string; v: Bi; onChange: (b: Bi) => void }) {
  return (
    <label className="block text-xs text-neutral-400">
      {label}
      <input className={inp} value={v.zh} placeholder="中文" onChange={(e) => onChange({ ...v, zh: e.target.value })} />
      <input className={`${inp} mt-1 text-neutral-300`} value={v.en} placeholder="英文（进提示词）" onChange={(e) => onChange({ ...v, en: e.target.value })} />
    </label>
  );
}

function FamilyCard({ f, onDone }: { f: Family | null; onDone?: () => void }) {
  const [d, setD] = useState<FamilyData>(f ? { name: f.name, about: f.about, members: f.members, themeWear: f.themeWear } : blank());
  const [open, setOpen] = useState(!f);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const set = (p: Partial<FamilyData>) => {
    setD((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  const setM = (i: number, p: Partial<FamilyMember>) => set({ members: d.members.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const save = () =>
    start(async () => {
      const r = await saveFamilyAction(f?.id ?? null, d);
      setMsg(r.error ? `⚠ ${r.error}` : "已保存");
      if (!r.error) {
        setDirty(false);
        onDone?.();
      }
    });
  const del = async () => {
    if (!f || !await askConfirm(`删除「${f.name}」？已经用这家人做的视频，提示词里会去掉这家人的描述。`)) return;
    start(async () => {
      const r = await deleteFamilyAction(f.id);
      if (r.error) setMsg(`⚠ ${r.error}`);
    });
  };
  const wearThemes = THEMES.filter((t) => t.id !== "none" && t.id !== "custom");
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="font-medium text-white">
          {d.name || "新家庭"} <span className="ml-2 text-xs text-neutral-400">{d.about.zh}</span>
        </span>
        <span className="text-xs text-neutral-400">
          {d.members.map((m) => `${m.name} ${m.age} 岁 ${(m.heightCm / 100).toFixed(2)} 米`).join(" · ")} {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-neutral-400">
              家庭名字
              <input className={inp} value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <BiField label="一句话介绍（族裔、住什么房子）" v={d.about} onChange={(about) => set({ about })} />
          </div>
          <div className="space-y-3">
            {d.members.map((m, i) => (
              <div key={m.id} className="grid gap-2 rounded-lg border border-white/10 p-3 md:grid-cols-[1fr_1fr_0.7fr_0.7fr_auto]">
                <label className="block text-xs text-neutral-400">
                  名字
                  <input className={inp} value={m.name} onChange={(e) => setM(i, { name: e.target.value })} />
                </label>
                <label className="block text-xs text-neutral-400">
                  角色
                  <select className={inp} value={m.role} onChange={(e) => setM(i, { role: e.target.value as FamilyMember["role"] })}>
                    {MEMBER_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-neutral-400">
                  年龄
                  <input type="number" step={0.5} className={inp} value={m.age} onChange={(e) => setM(i, { age: Number(e.target.value) })} />
                </label>
                <label className="block text-xs text-neutral-400">
                  身高（厘米）
                  <input type="number" className={inp} value={m.heightCm} onChange={(e) => setM(i, { heightCm: Number(e.target.value) })} />
                </label>
                <div className="flex items-end gap-2 text-xs">
                  <span className="text-neutral-500">3D：{memberKind(m) === "adult" ? "大人" : "小孩"}</span>
                  <button type="button" className="text-red-300" onClick={() => set({ members: d.members.filter((_, k) => k !== i) })}>
                    删
                  </button>
                </div>
                <div className="md:col-span-2">
                  <BiField label="长相" v={m.look} onChange={(look) => setM(i, { look })} />
                </div>
                <div className="md:col-span-3">
                  <BiField label="平时衣服（节日没写衣服时穿这个）" v={m.wear} onChange={(wear) => setM(i, { wear })} />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1 text-sm text-neutral-200"
              onClick={() => set({ members: [...d.members, { id: `m${Date.now().toString(36)}`, name: "", role: "son", age: 3, heightCm: 95, look: { zh: "", en: "" }, wear: { zh: "", en: "" } }] })}
            >
              ＋ 加成员
            </button>
          </div>
          <div>
            <p className="mb-2 text-xs text-neutral-400">节日衣服（整家同款；没写的节日穿各自的平时衣服）</p>
            <div className="grid gap-3 md:grid-cols-3">
              {wearThemes.map((t) => (
                <BiField key={t.id} label={t.label} v={d.themeWear[t.id] ?? { zh: "", en: "" }} onChange={(b) => set({ themeWear: { ...d.themeWear, [t.id]: b } })} />
              ))}
            </div>
          </div>
          <p className="text-xs text-neutral-500">定妆照：还没出（以后要出时每张先审批）。现在首帧只用上面的文字描述。</p>
          <div className="flex items-center gap-3">
            <button type="button" disabled={pending || !dirty} onClick={save} className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">
              保存
            </button>
            {f ? (
              <button type="button" disabled={pending} onClick={del} className="text-sm text-red-300">
                删除这家
              </button>
            ) : null}
            {msg ? <span className="text-sm text-neutral-300">{msg}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function FamilyLibrary({ families }: { families: Family[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {families.map((f) => (
        <FamilyCard key={f.id} f={f} />
      ))}
      {adding ? (
        <FamilyCard f={null} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200">
          ＋ 新家庭
        </button>
      )}
    </div>
  );
}
