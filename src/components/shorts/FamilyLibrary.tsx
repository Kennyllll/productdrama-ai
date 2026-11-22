"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useEffect, useState, useTransition } from "react";
import { acceptPortraitAction, deleteFamilyAction, discardPortraitAction, familyStateAction, quotePortraitAction, runPortraitAction, saveFamilyAction } from "@/app/family-actions";
import { NeedAdmin, useIsAdmin } from "@/components/admin/AdminContext";
import { DAILY, lookLabel, MEMBER_ROLES, memberKind, portraitState, WEAR_THEMES, type Bi, type Family, type FamilyData, type FamilyMember, type Portrait } from "@/lib/families";

const inp = "w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white";
const blank = (): FamilyData => ({ name: "", about: { zh: "", en: "" }, members: [] });
const textOf = (f: Family): FamilyData => ({ name: f.name, about: f.about, members: f.members });
const src = (fid: string, p: Portrait) => `/api/family-portraits/${fid}/${p.file}`;

function BiField({ label, v, onChange }: { label: string; v: Bi; onChange: (b: Bi) => void }) {
  return (
    <label className="block text-xs text-neutral-400">
      {label}
      <input className={inp} value={v.zh} placeholder="中文" onChange={(e) => onChange({ ...v, zh: e.target.value })} />
      <input className={`${inp} mt-1 text-neutral-300`} value={v.en} placeholder="英文（进提示词）" onChange={(e) => onChange({ ...v, en: e.target.value })} />
    </label>
  );
}

/** 一个造型的定妆照：采用的 / 等审批的 / 出图中 / 出图按钮。每张先报价审批 */
function PortraitSlot({ fid, m, look, block, big, onFamily }: { fid: string; m: FamilyMember | undefined; look: string; block: string; big?: boolean; onFamily: (f: Family) => void }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const size = big ? "h-40 w-24" : "h-24 w-14";
  const p = m?.portraits?.[look];
  const draft = m?.portraitDrafts?.[look];
  const job = m?.portraitJobs?.[look];
  const st = m ? portraitState(m, p, look) : "none";
  const call = async (fn: () => Promise<{ result?: Family; error?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.error) setMsg(`⚠ ${r.error}`);
    else if (r.result) {
      setMsg("");
      onFamily(r.result);
    }
  };
  const gen = async () => {
    if (!m) return;
    setBusy(true);
    const q = await quotePortraitAction(fid, m.id, look);
    setBusy(false);
    if (q.error || !q.result) return setMsg(`⚠ ${q.error}`);
    const ok = await askConfirm(`出 ${m.name} 的定妆照（${lookLabel(look)}）：$${q.result.usd.toFixed(2)}，失败不收费。${look === DAILY ? "全身、浅灰背景，出好了你看过再采用。" : "用平时那张认脸，只换成节日衣服。"}`);
    if (ok) await call(() => runPortraitAction(fid, m.id, look, q.result!.usd));
  };
  const img = (x: Portrait, dim?: boolean) => (
    <a href={src(fid, x)} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src(fid, x)} alt={`${m?.name} ${lookLabel(look)}`} className={`${size} rounded border border-white/10 object-cover ${dim ? "opacity-40" : ""}`} />
    </a>
  );
  return (
    <div className="flex flex-col items-start gap-1 text-[11px]">
      <div className="flex gap-1">
        {p ? img(p, st === "stale") : !draft && !job ? <div className={`${size} flex items-center justify-center rounded border border-dashed border-white/15 text-neutral-500`}>无照片</div> : null}
        {draft ? <div className="rounded ring-2 ring-amber-400">{img(draft)}</div> : null}
        {job && !job.error ? <div className={`${size} flex items-center justify-center rounded border border-white/10 text-neutral-400`}>出图中…</div> : null}
      </div>
      {p && st === "stale" ? <span className="text-red-300">长相改了，照片作废</span> : p && st === "wear" ? <span className="text-amber-300">衣服改了，只用来认脸</span> : null}
      {job?.error ? (
        <span className="text-red-300">
          {job.error}{" "}
          <button type="button" className="underline" onClick={() => call(() => discardPortraitAction(fid, m!.id, look))}>
            清掉
          </button>
        </span>
      ) : null}
      {draft ? (
        <span className="flex gap-2">
          <button type="button" disabled={busy} className="rounded bg-amber-400 px-2 py-0.5 font-medium text-black" onClick={() => call(() => acceptPortraitAction(fid, m!.id, look))}>
            采用
          </button>
          <button type="button" disabled={busy} className="text-neutral-300 underline" onClick={() => call(() => discardPortraitAction(fid, m!.id, look))}>
            不要
          </button>
        </span>
      ) : null}
      {!job || job.error ? (
        <button type="button" disabled={busy || !!block} title={block} onClick={gen} className="text-amber-300 underline disabled:text-neutral-500 disabled:no-underline">
          {p || draft ? "重出" : "出定妆照"}
        </button>
      ) : null}
      {block && (!job || job.error) ? <span className="max-w-[9rem] text-neutral-500">{block}</span> : null}
      {msg ? <span className="max-w-[10rem] text-red-300">{msg}</span> : null}
    </div>
  );
}

function FamilyCard({ f, onDone }: { f: Family | null; onDone?: () => void }) {
  const [d, setD] = useState<FamilyData>(f ? textOf(f) : blank());
  const [srv, setSrv] = useState<Family | null>(f);
  const [open, setOpen] = useState(!f);
  const [wearOpen, setWearOpen] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const admin = useIsAdmin();
  const set = (p: Partial<FamilyData>) => {
    setD((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  const setM = (i: number, p: Partial<FamilyMember>) => set({ members: d.members.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const running = srv?.members.some((m) => Object.values(m.portraitJobs ?? {}).some((j) => !j.error));
  useEffect(() => {
    if (!srv || !running) return;
    const t = setInterval(async () => {
      const x = await familyStateAction(srv.id);
      if (x) setSrv(x);
    }, 4000);
    return () => clearInterval(t);
  }, [srv, running]);
  const save = () =>
    start(async () => {
      const r = await saveFamilyAction(f?.id ?? null, d);
      setMsg(r.error ? `⚠ ${r.error}` : "已保存");
      if (!r.error) {
        setDirty(false);
        if (f) {
          const x = await familyStateAction(f.id);
          if (x) setSrv(x);
        }
        onDone?.();
      }
    });
  const del = async () => {
    if (!f || !(await askConfirm(`删除「${f.name}」？已经用这家人做的视频，提示词里会去掉这家人的描述。删掉后可以在页面下方「历史版本」里恢复。`))) return;
    start(async () => {
      const r = await deleteFamilyAction(f.id);
      if (r.error) setMsg(`⚠ ${r.error}`);
    });
  };
  const srvM = (id: string) => srv?.members.find((x) => x.id === id);
  const blockOf = (m: FamilyMember, look: string) =>
    !srv ? "先保存这个家庭" : dirty || !srvM(m.id) ? "先保存改动" : !m.look.en ? "先写长相（英文）" : look !== DAILY && !m.themeWear[look]?.en ? "先写这个节日的衣服（英文）" : look !== DAILY && !["ok", "wear"].includes(portraitState(m, srvM(m.id)?.portraits?.[DAILY], DAILY)) ? "先采用平时定妆照" : "";
  const spent = (srv?.members ?? []).reduce((a, m) => a + [...Object.values(m.portraits ?? {}), ...Object.values(m.portraitDrafts ?? {})].reduce((b, p) => b + p.usd, 0), 0);
  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 font-medium text-white">
          <span className="flex -space-x-2">
            {srv?.members.map((m) => {
              const p = m.portraits?.[DAILY];
              /* eslint-disable-next-line @next/next/no-img-element */
              return p ? <img key={m.id} src={src(srv.id, p)} alt={m.name} className="h-8 w-8 rounded-full border border-neutral-900 object-cover object-top" /> : null;
            })}
          </span>
          {d.name || "新家庭"} <span className="ml-1 text-xs text-neutral-400">{d.about.zh}</span>
        </span>
        <span className="text-xs text-neutral-400">
          {d.members.map((m) => `${m.name} ${m.age} 岁 ${(m.heightCm / 100).toFixed(2)} 米`).join(" · ")} {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <fieldset disabled={!admin} className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-neutral-400">
              家庭名字
              <input className={inp} value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <BiField label="一句话介绍（族裔、住什么房子）" v={d.about} onChange={(about) => set({ about })} />
          </div>
          <p className="text-xs text-neutral-500">
            定妆照：每人先出一张平时衣服的全身照，采用后首帧用它认脸；节日定妆照以平时那张为底，只换成这个人自己的节日衣服。每张出图前先报价审批。{spent > 0 ? ` 这家定妆照已花 $${spent.toFixed(2)}。` : ""}
          </p>
          <div className="space-y-3">
            {d.members.map((m, i) => {
              const sm = srvM(m.id);
              const filled = WEAR_THEMES.filter((t) => m.themeWear[t.id]?.en).length;
              const shots = WEAR_THEMES.filter((t) => sm?.portraits?.[t.id]).length;
              return (
                <div key={m.id} className="rounded-lg border border-white/10 p-3">
                  <div className="flex gap-3">
                    {srv ? <PortraitSlot fid={srv.id} m={sm} look={DAILY} block={blockOf(m, DAILY)} big onFamily={setSrv} /> : null}
                    <div className="grid flex-1 gap-2 md:grid-cols-[1fr_1fr_0.7fr_0.7fr_auto]">
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
                  </div>
                  <button type="button" onClick={() => setWearOpen({ ...wearOpen, [m.id]: !wearOpen[m.id] })} className="mt-2 text-xs text-neutral-300">
                    {wearOpen[m.id] ? "▾" : "▸"} {m.name || "这个人"}的节日衣服（已写 {filled}/{WEAR_THEMES.length}，定妆照 {shots} 张）
                  </button>
                  {wearOpen[m.id] ? (
                    <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {WEAR_THEMES.map((t) => (
                        <div key={t.id} className="flex gap-2">
                          <div className="flex-1">
                            <BiField label={t.label} v={m.themeWear[t.id] ?? { zh: "", en: "" }} onChange={(b) => setM(i, { themeWear: { ...m.themeWear, [t.id]: b } })} />
                          </div>
                          {srv ? <PortraitSlot fid={srv.id} m={sm} look={t.id} block={blockOf(m, t.id)} onFamily={setSrv} /> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1 text-sm text-neutral-200"
              onClick={() => set({ members: [...d.members, { id: `m${Date.now().toString(36)}`, name: "", role: "son", age: 3, heightCm: 95, look: { zh: "", en: "" }, wear: { zh: "", en: "" }, themeWear: {} }] })}
            >
              ＋ 加成员
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" disabled={pending || !dirty} onClick={save} className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">
              保存
            </button>
            {f ? (
              <button type="button" disabled={pending} onClick={del} className="text-sm text-red-300">
                删除这家
              </button>
            ) : null}
            <NeedAdmin />
            {msg ? <span className="text-sm text-neutral-300">{msg}</span> : null}
          </div>
        </fieldset>
      ) : null}
    </section>
  );
}

export function FamilyLibrary({ families }: { families: Family[] }) {
  const [adding, setAdding] = useState(false);
  const admin = useIsAdmin();
  return (
    <div className="space-y-3">
      {families.map((f) => (
        <FamilyCard key={f.id} f={f} />
      ))}
      {adding ? (
        <FamilyCard f={null} onDone={() => setAdding(false)} />
      ) : (
        <span className="flex items-center gap-2">
          <button type="button" disabled={!admin} onClick={() => setAdding(true)} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 disabled:opacity-40">
            ＋ 新家庭
          </button>
          <NeedAdmin />
        </span>
      )}
    </div>
  );
}
