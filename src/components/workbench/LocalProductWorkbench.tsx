"use client";

// 产品资料：一页 4 步（基本信息 → 照片 → 3D 模型 → 产品细节），做完的步骤默认收起；顶部列出还差什么。
import { askConfirm } from "@/components/ConfirmHost";
import Link from "next/link";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveProductAction } from "@/app/actions";
import { Tag } from "@/components/ui";
import { ColorKits, ModelBuilder, PhotoSlots, StickersBody } from "@/components/workbench/ProductKit";
import { WHITE_REQUIRED } from "@/lib/fal-catalog";
import { RIDE_KINDS, rideKindOf } from "@/lib/figures";
import type { KitData } from "@/lib/product-kit";
import type { AssetKind, FormState, LocalProduct } from "@/lib/types";

export interface AssetView {
  id: string;
  angle: string;
  originalName: string;
  size: number;
}

export interface TodoItem {
  step: 1 | 2 | 3 | 4;
  text: string;
}

const inputClass =
  "w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none";
const buttonClass =
  "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "rounded-md border border-white/15 px-2.5 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:opacity-40";
const FORM_ID = "product-form";

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);
const stepId = (n: number) => `step-${n}`;

function jump(n: number) {
  const el = document.getElementById(stepId(n)) as HTMLDetailsElement | null;
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Step({ n, title, done, summary, children }: { n: number; title: string; done: boolean; summary: string; children: ReactNode }) {
  return (
    <details id={stepId(n)} open={!done} className="group scroll-mt-4 rounded-xl border border-white/10 bg-neutral-900/70">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-400 text-black"}`}
        >
          {done ? "✓" : n}
        </span>
        <span className="shrink-0 text-base font-semibold text-white">{title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">{summary}</span>
        <span className="text-xs text-neutral-500 group-open:hidden">展开</span>
        <span className="hidden text-xs text-neutral-500 group-open:inline">收起</span>
      </summary>
      <div className="space-y-6 border-t border-white/5 p-5">{children}</div>
    </details>
  );
}

function Part({ title, hint, aside, children }: { title: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
        {aside}
      </div>
      {hint ? <p className="mb-2 text-xs text-neutral-500">{hint}</p> : null}
      {children}
    </section>
  );
}

function Thumbs({ items, busy, onRemove, label }: { items: AssetView[]; busy: boolean; onRemove: (id: string) => void; label?: (a: AssetView) => string }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
      {items.map((p) => (
        <li key={p.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/assets/${p.id}`} alt={p.originalName} className="aspect-square w-full rounded-md border border-white/10 bg-white object-contain" />
          <p className="mt-0.5 flex items-center justify-between gap-1 text-[11px] text-neutral-400">
            <span className="truncate" title={p.originalName}>
              {label ? label(p) : p.angle}
            </span>
            <button type="button" disabled={busy} onClick={() => onRemove(p.id)} className="shrink-0 text-rose-300 hover:text-rose-200" aria-label={`删除${p.originalName}`}>
              ×
            </button>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function LocalProductWorkbench({
  projectId,
  product,
  details,
  logo,
  packaging,
  model,
  kit,
  todo,
}: {
  projectId: string;
  product: LocalProduct;
  /** 细节照：产品照片里没放进角度格子的 */
  details: AssetView[];
  logo: AssetView | null;
  packaging: AssetView[];
  model: { id: string; originalName: string; size: number } | null;
  kit: KitData;
  todo: TodoItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const detailInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const packagingInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(saveProductAction, {});

  const kind = rideKindOf(product.rideKind, product.category);
  const unconfirmed = product.bible.filter((f) => f.needsConfirmation);
  const confirmed = product.bible.filter((f) => !f.needsConfirmation);
  const missingWhite = WHITE_REQUIRED.filter((a) => !kit.white.some((w) => w.angle === a));
  const reviewing = kit.models.filter((m) => m.colorId === null && m.status === "review");
  const detailIds = new Set(details.map((d) => d.id));

  const done1 = !!product.name.trim() && product.sellingPoints.length > 0;
  const done2 = !!logo && kit.white.length > 0 && (!!model || missingWhite.length === 0);
  const done3 = !!model && reviewing.length === 0;
  const done4 = unconfirmed.length === 0;

  async function upload(kind: AssetKind, input: HTMLInputElement | null) {
    const files = input?.files;
    if (!files || files.length === 0) {
      setNotice({ tone: "error", text: "请先选择文件" });
      return;
    }
    setBusy(true);
    setNotice(null);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("angle", kind === "logo" ? "Logo" : kind === "packaging_photo" ? "包装" : "细节");
    Array.from(files).forEach((f) => fd.append("file", f));
    try {
      const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: fd });
      const data = (await res.json()) as { added: number; errors: string[] };
      const parts: string[] = [];
      if (data.added) parts.push(`已保存 ${data.added} 个文件`);
      if (data.errors.length) parts.push(data.errors.join("；"));
      setNotice({ tone: res.ok && data.errors.length === 0 ? "ok" : "error", text: parts.join("。") });
      if (input) input.value = "";
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "上传失败：无法连接本地服务" });
    } finally {
      setBusy(false);
    }
  }

  async function uploadModel() {
    const f = modelInput.current?.files?.[0];
    if (!f) {
      setNotice({ tone: "error", text: "请先选择 GLB 文件" });
      return;
    }
    setBusy(true);
    setNotice(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch(`/api/projects/${projectId}/models`, { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; size?: number };
      setNotice(res.ok ? { tone: "ok", text: `3D 模型已保存（${formatSize(data.size ?? f.size)}）` } : { tone: "error", text: data.error ?? "上传失败" });
      if (modelInput.current) modelInput.current.value = "";
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "上传失败：无法连接本地服务" });
    } finally {
      setBusy(false);
    }
  }

  async function removeModel(id: string) {
    if (!await askConfirm("删除在用的 3D 模型？")) return;
    setBusy(true);
    const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
    setNotice(res.ok ? { tone: "ok", text: "已删除" } : { tone: "error", text: "删除失败" });
    router.refresh();
    setBusy(false);
  }

  async function remove(id: string) {
    if (!await askConfirm("删除这个文件？")) return;
    setBusy(true);
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    setNotice(res.ok ? { tone: "ok", text: "已删除" } : { tone: "error", text: "删除失败" });
    router.refresh();
    setBusy(false);
  }

  const saveRow = (
    <div className="flex items-center gap-3">
      <button type="submit" form={FORM_ID} disabled={saving} className={buttonClass}>
        {saving ? "保存中…" : "保存"}
      </button>
      {saveState.ok ? <span className="text-sm text-emerald-300">{saveState.ok}</span> : null}
      {saveState.error ? <span className="text-sm text-rose-300">{saveState.error}</span> : null}
    </div>
  );

  const bibleRow = (f: LocalProduct["bible"][number]) => (
    <li key={f.key} className="grid items-center gap-2 rounded-lg bg-white/5 p-2 sm:grid-cols-[6rem_1fr_auto]">
      <label htmlFor={`bible-${f.key}`} className="text-sm text-neutral-300">
        {f.label}
      </label>
      <input id={`bible-${f.key}`} form={FORM_ID} name={`bible.${f.key}.value`} defaultValue={f.value} maxLength={200} placeholder="待填写" className={inputClass} />
      <label className="flex items-center gap-1 text-xs text-neutral-300">
        <input type="checkbox" form={FORM_ID} name={`bible.${f.key}.confirmed`} defaultChecked={!f.needsConfirmation} />
        已确认
      </label>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 text-sm ${todo.length ? "border-amber-400/30 bg-amber-400/5" : "border-emerald-400/30 bg-emerald-400/5"}`}>
        {todo.length ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-amber-200">还差：</span>
            {todo.map((t, i) => (
              <span key={t.text} className="flex items-center gap-2">
                {i ? <span className="text-neutral-600">·</span> : null}
                <button type="button" onClick={() => jump(t.step)} className="text-neutral-100 underline decoration-amber-400/50 underline-offset-4 hover:text-amber-200">
                  {t.text}
                </button>
              </span>
            ))}
          </p>
        ) : (
          <p className="text-emerald-200">资料齐了，可以去做视频了。</p>
        )}
      </div>

      {notice ? (
        <p role="status" className={`rounded-lg px-4 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>
          {notice.text}
        </p>
      ) : null}

      <Step n={1} title="基本信息" done={done1} summary={`${product.name || "未命名"} · ${RIDE_KINDS.find((o) => o.k === kind)?.label ?? ""} · 卖点 ${product.sellingPoints.length} 条`}>
        <form id={FORM_ID} action={saveAction} className="grid gap-3 text-sm sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="block">
            <span className="text-xs text-neutral-400">产品名称</span>
            <input name="name" defaultValue={product.name} maxLength={80} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-400">品类</span>
            <input name="category" defaultValue={product.category} maxLength={80} placeholder="例如：儿童三轮车" className={`${inputClass} mt-1`} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-neutral-400">产品类型（决定人偶骑车时脚放哪）</span>
            <select name="rideKind" defaultValue={kind} className={`${inputClass} mt-1`}>
              {RIDE_KINDS.map((o) => (
                <option key={o.k} value={o.k}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-neutral-400">卖点（每行一条，最多 10 条）</span>
            <textarea name="sellingPoints" defaultValue={product.sellingPoints.join("\n")} rows={3} className={`${inputClass} mt-1`} />
          </label>
        </form>
        {saveRow}
      </Step>

      <Step
        n={2}
        title="照片"
        done={done2}
        summary={`角度照 ${kit.white.length}/10 · 细节照 ${details.length} · Logo ${logo ? "有" : "缺"} · 贴纸 ${kit.stickers.length}`}
      >
        <Part title="角度照" hint="白色背景，产品占满画面，不要手和阴影。建 3D 模型和出首帧都用这几张。点格子上传。">
          <PhotoSlots projectId={projectId} kind="white_photo" assets={kit.white} required={model ? [] : WHITE_REQUIRED} library={kit.library.filter((a) => detailIds.has(a.id))} />
        </Part>

        <Part title="细节照（可选）" hint="座椅、车轮、Logo 特写、使用场景等，出首帧时一起参考。">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={detailInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="text-xs text-neutral-300" aria-label="细节照" />
            <button type="button" disabled={busy} onClick={() => upload("product_photo", detailInput.current)} className={ghost}>
              {busy ? "处理中…" : "上传"}
            </button>
          </div>
          <Thumbs items={details} busy={busy} onRemove={remove} />
        </Part>

        <Part title="Logo" hint="成片里的 Logo 用原文件合成，不让 AI 重画。最好是透明背景的 PNG 或 SVG。" aside={<Tag tone={logo ? "emerald" : "amber"}>{logo ? "已上传" : "未上传"}</Tag>}>
          <div className="flex flex-wrap items-center gap-3">
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/assets/${logo.id}`}
                alt={`Logo · ${logo.originalName}`}
                className="h-16 w-16 rounded-md border border-white/10 bg-[repeating-conic-gradient(#2a2a2a_0_25%,#1a1a1a_0_50%)] bg-[length:16px_16px] object-contain p-1"
              />
            ) : null}
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-xs text-neutral-300" aria-label="Logo 文件" />
            <button type="button" disabled={busy} onClick={() => upload("logo", logoInput.current)} className={ghost}>
              {logo ? "替换" : "上传"}
            </button>
            {logo ? (
              <button type="button" disabled={busy} onClick={() => remove(logo.id)} className="text-xs text-rose-300 hover:text-rose-200">
                删除
              </button>
            ) : null}
          </div>
        </Part>

        <Part title="车身贴纸（可选）" hint="和 Logo 分开传，每张标好贴在哪。最好再传一张贴在车上的实拍。">
          <StickersBody kit={kit} />
        </Part>

        <details className="rounded-lg bg-white/5 p-3" open={packaging.length > 0}>
          <summary className="cursor-pointer text-sm text-neutral-300">包装照片（可选，只有开箱视频需要）· 已传 {packaging.length} 张</summary>
          <p className="mt-2 text-xs text-neutral-500">包装盒的正面、侧面、打开后的里面。</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={packagingInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="text-xs text-neutral-300" aria-label="包装照片" />
            <button type="button" disabled={busy} onClick={() => upload("packaging_photo", packagingInput.current)} className={ghost}>
              上传
            </button>
          </div>
          <Thumbs items={packaging} busy={busy} onRemove={remove} label={(p) => formatSize(p.size)} />
        </details>
      </Step>

      <Step
        n={3}
        title="3D 模型"
        done={done3}
        summary={model ? `在用：${model.originalName}${reviewing.length ? ` · ${reviewing.length} 个待审核` : ""}` : reviewing.length ? `${reviewing.length} 个待审核` : "还没有"}
      >
        <Part title="现在用的模型" hint="3D 页摆位置、定角度都用它；产品的颜色和 Logo 以照片为准。">
          {model ? (
            <p className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
              <Tag tone="emerald">在用</Tag>
              <span className="truncate" title={model.originalName}>
                {model.originalName} · {formatSize(model.size)}
              </span>
              <Link href={`/projects/${projectId}/product/models/${model.id}`} className="text-amber-300 underline">
                看 3D 和接触点
              </Link>
              <button type="button" disabled={busy} onClick={() => removeModel(model.id)} className="text-xs text-rose-300 hover:text-rose-200">
                删除
              </button>
            </p>
          ) : (
            <p className="text-sm text-amber-200">还没有。用下面两种方式之一加一个。</p>
          )}
        </Part>

        <details className="rounded-lg border border-white/10 p-3" open={!model || reviewing.length > 0}>
          <summary className="cursor-pointer text-sm text-neutral-200">{model ? "换一个模型" : "加模型"}</summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <Part title="A. 有工厂 GLB 文件" hint="带真实颜色和 Logo 的最好，最大 300 MB。免费。">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={modelInput} type="file" accept=".glb,model/gltf-binary" className="text-xs text-neutral-300" aria-label="GLB 文件" />
                <button type="button" disabled={busy} onClick={uploadModel} className={ghost}>
                  上传
                </button>
              </div>
            </Part>
            <Part title="B. 没有文件：用角度照建模" hint="用第 2 步的角度照，要花钱，提交前先显示价格。建好后先审核。">
              <ModelBuilder kit={kit} target="shape" />
            </Part>
          </div>
        </details>

        <Part title="颜色款（可选）" hint="同一款产品的其他颜色。每个颜色传这个颜色的实物照，出首帧时颜色、Logo 和贴纸都照它来。">
          <ColorKits kit={kit} hasBase={!!model} />
        </Part>
      </Step>

      <Step n={4} title="产品细节" done={done4} summary={`${confirmed.length}/${product.bible.length} 项已确认`}>
        <p className="text-xs text-neutral-500">照片看不准的信息，填好后勾「已确认」，AI 写脚本和出图时会照这些来。</p>
        {unconfirmed.length ? <ul className="space-y-2">{unconfirmed.map(bibleRow)}</ul> : <p className="text-sm text-emerald-200">全部确认了。</p>}
        {confirmed.length ? (
          <details className="rounded-lg bg-white/5 p-3">
            <summary className="cursor-pointer text-sm text-neutral-300">已确认的 {confirmed.length} 项（点开修改）</summary>
            <ul className="mt-2 space-y-2">{confirmed.map(bibleRow)}</ul>
          </details>
        ) : null}
        {saveRow}
      </Step>
    </div>
  );
}
