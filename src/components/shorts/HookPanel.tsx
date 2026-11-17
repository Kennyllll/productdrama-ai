"use client";

import { askConfirm, askPrompt } from "@/components/ConfirmHost";
import { useState, useTransition } from "react";
import { adoptHookAction, deleteHookShotAction, draftHookAction, saveHookAsLibAction, setHookSelfieAction, setHookValuesAction } from "@/app/short-actions";
import { HookCases } from "@/components/shorts/HookCases";
import { effectDef } from "@/lib/hook-effects";
import { cleanHookValues, HOOK_ENTRIES, type HookDef } from "@/lib/hooks";
import { VIEW_LABEL, type HookPerson } from "@/lib/hook-stage";
import type { ShortShot } from "@/lib/shorts";

type Done = (r: Awaited<ReturnType<typeof deleteHookShotAction>>, ok?: string) => void;
const inp = "w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white disabled:opacity-50";
const sel = "rounded border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white disabled:opacity-50";
const btn = "rounded border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:opacity-50";

/** 从 Hook 库做开头（shot 为空 = 新建；有 shot = 改这个开头的属性 / 重写剧本 / 另存为新 Hook） */
export function HookPanel({ videoId, lib, shot, targetId, setHref, onDone, onClose, themePicker }: { themePicker?: React.ReactNode; videoId: string; lib: HookDef[]; shot?: ShortShot; targetId?: string; setHref: (shotId: string) => string; onDone: Done; onClose: () => void }) {
  const h = shot?.hook;
  const [libId, setLibId] = useState(h?.libId ?? lib[0]?.id ?? "");
  const def = lib.find((x) => x.id === libId);
  const [values, setValues] = useState<Record<string, string>>(h?.values ?? (def ? cleanHookValues(def, undefined) : {}));
  const [entry, setEntry] = useState(h?.entry ?? def?.entry ?? "assembled");
  type Part = { draft: Record<string, string>; people: HookPerson[]; who: string[] };
  const [draft, setDraft] = useState<(Part & { caption: string; notes: string[]; second?: Part; selfieName?: string }) | null>(null);
  const [msg, setMsg] = useState("");
  const [selfie, setSelfie] = useState(h ? Boolean(h.selfie) : Boolean(def?.selfie));
  const [line, setLine] = useState(h?.line ?? "");
  const fx = effectDef(def?.effect ?? h?.effect);
  const [pending, start] = useTransition();
  const fields = def?.fields ?? Object.keys(values).map((k) => ({ key: k, label: k, example: "", visual: Boolean(h?.visualKeys?.includes(k)) }));
  const pick = (id: string) => {
    const d = lib.find((x) => x.id === id);
    setLibId(id);
    setDraft(null);
    if (d) {
      setValues(cleanHookValues(d, undefined));
      setEntry(d.entry);
      setSelfie(Boolean(d.selfie));
    }
  };
  const gen = async () => {
    if (!await askConfirm("用 DeepSeek 写这个开头的剧本（文字调用 1 次，约 $0.01，不出图）。只出草稿，你点“采用”才会改视频。继续？")) return;
    setMsg("");
    start(async () => {
      const r = await draftHookAction(videoId, libId, values, entry, selfie);
      if (r.error) setMsg(`⚠ ${r.error}`);
      else setDraft(r.result ?? null);
    });
  };
  const adopt = () =>
    start(async () => {
      if (!draft) return;
      const r = await adoptHookAction(videoId, libId, values, entry, draft.draft, shot?.id ?? targetId, draft.people, { selfie, line, second: draft.second ? { draft: draft.second.draft, people: draft.second.people } : undefined });
      const fixed = r.result?.fixed ?? [];
      onDone(r, fixed.length ? `已换好开头。AI 写的动作有 ${fixed.length} 处 3D 做不到，程序已改好：${fixed.join("；")}。点「打开 3D」看构图` : r.result?.secondId ? "已换好开头（两段）：正在打开 3D，先自动保存切镜后的第二段，再停在第一段" : "已换好开头：正在打开 3D，按 Hook 摆好的构图会自动保存");
      if (!r.error && r.result && !fixed.length) window.location.href = r.result.secondId ? `${setHref(r.result.secondId)}&next=${r.result.shotId}` : setHref(r.result.shotId);
    });
  // 自拍：勾上就保存（已有开头：3D 跟着重摆，文字要重写）；草稿是按旧设置写的，作废
  const toggleSelfie = (on: boolean) => {
    setSelfie(on);
    setDraft(null);
    if (!shot) return;
    start(async () => {
      const r = await setHookSelfieAction(videoId, shot.id, on, line);
      if (r.error) {
        setSelfie(!on);
        return onDone(r);
      }
      onDone(r, on ? "已改成自拍：3D 已把拿手机的人摆到镜头前。文字还是旧的，点「重写剧本」（约 $0.01）" : "已取消自拍：3D 已去掉自拍的人。文字还是旧的，点「重写剧本」（约 $0.01）");
      setMsg("改了自拍：文字还是按旧设置写的，点「重写剧本」");
    });
  };
  const saveLine = () => {
    if (!shot || !selfie || line === (h?.line ?? "")) return;
    start(async () => onDone(await setHookSelfieAction(videoId, shot.id, true, line), "台词已保存（免费）"));
  };
  const saveValues = () =>
    start(async () => {
      if (!shot) return;
      let r = await setHookValuesAction(videoId, shot.id, values);
      if (r.result?.confirm) {
        if (!await askConfirm(r.result.confirm)) return;
        r = await setHookValuesAction(videoId, shot.id, values, true);
      }
      onDone({ error: r.error, result: r.result?.state }, r.result?.rewrite ? "已保存属性。改了影响画面的属性：点下面“重写剧本”" : "已保存属性，字幕已更新（免费）");
      if (r.result?.rewrite) setMsg("改了影响画面的属性：点“重写剧本”，再去 3D 保存构图");
    });
  const saveAs = async () => {
    if (!shot) return;
    const name = await askPrompt("另存为新 Hook，名字：", `${def?.name ?? h?.name ?? "开头"} · 新版`);
    if (!name) return;
    start(async () => {
      const r = await saveHookAsLibAction(videoId, shot.id, name);
      setMsg(r.error ? `⚠ ${r.error}` : `已存进 Hook 库：「${name}」`);
    });
  };
  return (
    <div className="space-y-2 rounded-lg border border-amber-400/30 bg-neutral-900 p-3 text-xs text-neutral-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-white">{shot ? `开头「${h?.name}」的 Hook 属性` : targetId ? "把开头换成 Hook 库里的套路" : "从 Hook 库做一个开头"}</span>
        <select className={sel} value={libId} disabled={pending || !!shot} onChange={(e) => pick(e.target.value)}>
          {lib.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          {!def && h?.libName ? <option value={libId}>{h.libName}（已从库里删掉）</option> : null}
        </select>
        <select className={sel} value={entry} disabled={pending || !!shot} onChange={(e) => (setEntry(e.target.value), setDraft(null))}>
          {HOOK_ENTRIES.map((x) => (
            <option key={x.id} value={x.id}>
              产品：{x.label}
            </option>
          ))}
        </select>
        <button className="ml-auto text-neutral-500" onClick={onClose}>
          关闭
        </button>
      </div>
      {def ? <p className="text-neutral-500">{def.about}</p> : null}
      {fx ? (
        <div className="flex flex-wrap items-center gap-2 text-amber-200">
          出片效果：{fx.look}
          {fx.tip ? `（${fx.tip}）` : ""}
          <HookCases effect={fx.id} name={def?.name ?? h?.name} />
        </div>
      ) : null}
      {def?.second ? (
        <p className="text-sky-200">
          切镜头（照案例）：第 {def.seconds} 秒切到第二段（{def.second.seconds} 秒）：{def.second.about}。两段各有自己的 3D、首帧和视频，第二段多一张首帧和一段 4 秒视频（720p 约多 $1.16，生成前照样审批）；字幕跨两段连着放。
        </p>
      ) : def ? (
        <p className="text-neutral-500">一镜到底，不切镜头（照案例）。</p>
      ) : null}
      <label className="flex flex-wrap items-center gap-2">
        <input type="checkbox" checked={selfie} disabled={pending} onChange={(e) => toggleSelfie(e.target.checked)} />
        自拍镜头：拿手机的人入镜，对着前置摄像头说一句台词
        <span className="text-amber-300">选了自拍，这一镜强制开声音（台词人声 + 环境音），价格不变</span>
      </label>
      {selfie ? <p className="text-neutral-500">自拍的人 = 视频设定里的「拿手机的人」，没设就用家里第一个大人；要换人在视频设定里改，或在 3D 里改这个人偶「是谁」。</p> : null}
      {selfie ? <input className={inp} value={line} placeholder="台词（英文）；不填 = 说字幕那句" disabled={pending} onChange={(e) => setLine(e.target.value)} onBlur={saveLine} /> : null}
      {themePicker ? <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">这条视频的节日（开头和正文都跟着它，换了会先提示哪些镜头要重做）：{themePicker}</div> : null}
      {def?.stage ? (
        <p className="text-sky-200">
          {selfie ? "3D 会自动摆成自拍：拿手机的人在镜头前约 0.6 米、脸朝镜头在画面右边，产品在他身后左边；摄影机在手机高度。" : `3D 会自动摆成：产品${VIEW_LABEL[def.stage.view]}；摄影机约 ${def.stage.dist} 米、高 ${def.stage.camH} 米。`}画面里放谁、做什么，生成剧本时 AI 按这条视频的剧情定。采用后会打开 3D 自动保存构图，你只要微调。
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            {f.label}
            <span className="ml-1 text-neutral-500">{f.visual ? "· 影响画面" : "· 只进字幕"}</span>
            <input className={inp} value={values[f.key] ?? ""} placeholder={f.example} disabled={pending} onChange={(e) => (setValues((v) => ({ ...v, [f.key]: e.target.value })), f.visual && setDraft(null))} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {shot ? (
          <>
            <button className={btn} disabled={pending} onClick={saveValues}>
              保存属性
            </button>
            <button className={btn} disabled={pending || !def || shot.stage !== "draft"} title={shot.stage !== "draft" ? "先退回构图" : ""} onClick={gen}>
              重写剧本（DeepSeek，约 $0.01）
            </button>
            <button className={btn} disabled={pending || !def} onClick={saveAs}>
              另存为新 Hook
            </button>
          </>
        ) : (
          <button className={btn} disabled={pending || !def} onClick={gen}>
            生成剧本（DeepSeek，约 $0.01）
          </button>
        )}
        <span>{pending ? "处理中…" : msg}</span>
      </div>
      {draft ? (
        <div className="space-y-1 rounded border border-white/10 p-2">
          <p className="font-medium text-white">剧本草稿（还没改视频）</p>
          <p>
            出镜：{selfie ? `${draft.selfieName ?? "拿手机的人"}自拍入镜` : ""}
            {selfie && draft.who.length ? "；" : ""}
            {draft.who.length ? draft.who.join("；") : selfie ? "" : "不放人，只拍产品"}（采用后 3D 按这个摆{selfie ? "，自拍的人不进 3D" : ""}）
          </p>
          <p>画面：{draft.draft.description}</p>
          <p>机位：{draft.draft.camera}</p>
          <p>产品：{draft.draft.productNote}</p>
          <p>字幕：{draft.caption}</p>
          {draft.second ? (
            <div className="mt-1 space-y-1 border-t border-white/10 pt-1">
              <p className="font-medium text-white">切镜后的第二段</p>
              <p>出镜：{draft.second.who.length ? draft.second.who.join("；") : "不放人，只拍产品"}</p>
              <p>画面：{draft.second.draft.description}</p>
              <p>机位：{draft.second.draft.camera}</p>
            </div>
          ) : null}
          {draft.notes.map((n, i) => (
            <p key={i} className="text-amber-300">
              提醒：{n}
            </p>
          ))}
          <details>
            <summary className="cursor-pointer text-neutral-500">英文提示词</summary>
            <p>{draft.draft.framePrompt}</p>
            <p className="mt-1">{draft.draft.motionPrompt}</p>
            {draft.second ? <p className="mt-1">第二段：{draft.second.draft.framePrompt}</p> : null}
          </details>
          <button className="rounded bg-amber-400 px-3 py-1 text-sm font-medium text-black disabled:opacity-50" disabled={pending} onClick={adopt}>
            采用
          </button>
        </div>
      ) : null}
    </div>
  );
}
