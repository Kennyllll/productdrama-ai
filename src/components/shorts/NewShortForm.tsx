"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createFromTemplateAction, createShortVideoAction, deleteTemplateAction, setTemplateThemeAction } from "@/app/short-actions";
import { THEMES } from "@/lib/shorts-scenes";
import Link from "next/link";
import { gapsText, type ProductGap } from "@/lib/product-readiness";

const inputClass = "mt-1 w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60";

export interface SavedTemplate {
  id: string;
  name: string;
  v: number;
  theme: string;
  themeText?: string;
  shots: number;
  fromProduct: string;
  needsPackaging: boolean;
}

export function NewShortForm({
  projectId,
  templates,
  saved,
  hasPackaging,
  gaps = [],
  families = [],
}: {
  projectId: string;
  templates: { id: string; label: string; description: string; needsPackaging?: boolean }[];
  saved: SavedTemplate[];
  hasPackaging: boolean;
  gaps?: ProductGap[];
  families?: { id: string; name: string; who: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pick, setPick] = useState(templates[0]?.id ?? "");
  const [theme, setTheme] = useState("none");
  const [themeText, setThemeText] = useState("");
  const [fam, setFam] = useState(families[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const tp = pick.startsWith("tpl:") ? saved.find((x) => `tpl:${x.id}` === pick) : undefined;
  const t = tp ? undefined : templates.find((x) => x.id === pick);
  const needsPackaging = tp ? tp.needsPackaging : Boolean(t?.needsPackaging);
  const themeLabel = (id: string, text?: string) => `${THEMES.find((x) => x.id === id)?.label ?? id}${id === "custom" && text ? `（${text}）` : ""}`;
  const choose = (id: string) => {
    setPick(id);
    setError("");
    const s = saved.find((x) => `tpl:${x.id}` === id);
    if (s) {
      setTheme(s.theme);
      setThemeText(s.themeText ?? "");
    }
  };
  const themeDiff = tp && (tp.theme !== theme || (theme === "custom" && (tp.themeText ?? "") !== themeText.trim()));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fams = fam ? { 1: fam } : undefined;
        start(async () => {
          const r = tp ? await createFromTemplateAction(projectId, tp.id, title, theme, themeText, fams) : await createShortVideoAction(projectId, title, pick, theme, themeText, fams);
          if (r.error || !r.result) return setError(r.error ?? "创建失败");
          router.push(`/projects/${projectId}/shorts/${r.result}`);
        });
      }}
    >
      <label className="block text-sm">
        <span className="text-neutral-400">模板 / 风格</span>
        <select value={pick} onChange={(e) => choose(e.target.value)} className={inputClass}>
          <optgroup label="内置风格（AI 按创意出分镜）">
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </optgroup>
          {saved.length ? (
            <optgroup label="我的模板（直接复制分镜）">
              {saved.map((x) => (
                <option key={x.id} value={`tpl:${x.id}`}>
                  {x.name} · v{x.v}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
      {t ? <p className="text-xs text-neutral-500">{t.description}</p> : null}
      {tp ? (
        <p className="text-xs text-neutral-500">
          复制 {tp.shots} 个镜头{tp.fromProduct ? `（原来是 ${tp.fromProduct} 做的）` : ""}。场地会复制一份到这个产品下，摄影机和人偶按车的大小缩放；每镜都要重新打开 3D 看一眼、点保存。
        </p>
      ) : null}
      {needsPackaging && !hasPackaging ? <p className="text-xs text-amber-300">这个模板是开箱视频，要先在产品资料里上传真实包装照片。</p> : null}
      <label className="block text-sm">
        <span className="text-neutral-400">家庭（从家庭库选，所有产品共用）</span>
        <select value={fam} onChange={(e) => setFam(e.target.value)} className={inputClass}>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}（{f.who}）
            </option>
          ))}
          <option value="">不指定（人物只写大人 / 小孩）</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-neutral-400">{tp ? "节日（整套镜头一键换，不花钱）" : "节日"}</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value)} className={inputClass}>
          {THEMES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {theme === "custom" ? (
        <input value={themeText} onChange={(e) => setThemeText(e.target.value)} maxLength={300} placeholder="例如：中秋节，挂灯笼、桌上有月饼" className={inputClass} />
      ) : null}
      <p className="text-xs text-neutral-500">
        整条视频的装饰和衣服都按这个节日来。开始生成以后再改，会提示哪些镜头要重做。
        {tp ? ` 模板原来是「${themeLabel(tp.theme, tp.themeText)}」。` : ""}
      </p>
      {tp ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {themeDiff ? (
            <button
              type="button"
              disabled={pending}
              className="rounded border border-white/15 px-2 py-1 text-neutral-200 hover:border-amber-400/60 disabled:opacity-50"
              onClick={() =>
                start(async () => {
                  const r = await setTemplateThemeAction(tp.id, theme, themeText);
                  if (r.error) return setError(r.error);
                  setError("");
                  router.refresh();
                })
              }
            >
              把模板本身改成「{themeLabel(theme, themeText.trim())}」（存为 v{tp.v + 1}）
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            className="rounded border border-white/15 px-2 py-1 text-neutral-400 hover:border-rose-400/60 disabled:opacity-50"
            onClick={async () => {
              if (!await askConfirm(`删除模板「${tp.name}」？已经用它做的视频不受影响。`)) return;
              start(async () => {
                const r = await deleteTemplateAction(tp.id);
                if (r.error) return setError(r.error);
                setPick(templates[0]?.id ?? "");
                router.refresh();
              });
            }}
          >
            删除这个模板
          </button>
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="text-neutral-400">标题（可空）</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="例如：圣诞 · 爷爷奶奶送礼" className={inputClass} />
      </label>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending || gaps.length > 0} className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "创建中…" : "新建短视频"}
        </button>
        {gaps.length ? (
          <span className="text-xs text-amber-300">
            {gapsText(gaps)}。
            <Link href={`/projects/${projectId}/product`} className="underline underline-offset-4 hover:text-amber-200">
              去产品资料补 →
            </Link>
          </span>
        ) : null}
      </div>
    </form>
  );
}
