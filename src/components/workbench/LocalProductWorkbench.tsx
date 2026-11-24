"use client";

// 产品资料：一页 4 步（基本信息 → 照片 → 3D 模型 → 产品细节），做完的步骤默认收起；顶部列出还差什么。
import { askConfirm } from "@/components/ConfirmHost";
import Link from "next/link";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveProductAction } from "@/app/actions";
import { DrawingCalibrate } from "@/components/workbench/DrawingCalibrate";
import type { ModelCad } from "@/lib/model-repo";
import { Tag } from "@/components/ui";
import { BibleRow } from "@/components/workbench/BibleRow";
import { ColorKits, ModelBuilder, PhotoSlots, StickersBody } from "@/components/workbench/ProductKit";
import { PROVIDERS, WHITE_REQUIRED } from "@/lib/fal-catalog";
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
const choice = "block cursor-pointer rounded-xl border border-white/15 bg-white/5 p-4 hover:border-amber-400/60";
const PRECISION = { exact: "精确 · 工厂文件", calibrated: "校准 · 照片模型 + 图纸尺寸", approx: "近似 · 照片建的" } as const;

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

function Thumbs({ items, busy, onRemove, label, warnings = {} }: { items: AssetView[]; busy: boolean; onRemove: (id: string) => void; label?: (a: AssetView) => string; warnings?: Record<string, string[]> }) {
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
          {warnings[p.id]?.map((w) => (
            <p key={w} className="text-[11px] leading-tight text-amber-300">
              {w}
            </p>
          ))}
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
  photoWarnings = {},
}: {
  projectId: string;
  product: LocalProduct;
  /** 细节照：产品照片里没放进角度格子的 */
  details: AssetView[];
  logo: AssetView | null;
  packaging: AssetView[];
  model: { id: string; originalName: string; size: number; source?: string; cad?: ModelCad | null } | null;
  kit: KitData;
  todo: TodoItem[];
  /** 照片 id → 太小 / 太暗 / 太糊 */
  photoWarnings?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const detailInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const packagingInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  // 第 3 步：没模型时问「有工厂 3D 文件吗」；有文件直接传，GLB 看不出来源才问一句
  const [path3, setPath3] = useState<"" | "file" | "photo">("");
  const [askOrigin, setAskOrigin] = useState<File | null>(null);
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
  const precision3: "exact" | "calibrated" | "approx" = !model ? "approx" : model.source !== "fal" ? "exact" : model.cad?.ok ? "calibrated" : "approx";
  const shapeJobBusy = kit.jobs.some((j) => j.target === "shape" && j.colorId === null && ["submitting", "submitted", "unknown"].includes(j.status));
  const asking = (!model && !reviewing.length) || path3 !== "" || shapeJobBusy;
  const photoOpen = path3 === "photo" || shapeJobBusy;
  const shapeUsd = PROVIDERS.filter((p) => p.target === "shape").map((p) => p.usd);
  const shapePrice = shapeUsd.length ? `$${Math.min(...shapeUsd).toFixed(2)}–${Math.max(...shapeUsd).toFixed(2)}` : "几毛钱";

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

  async function uploadModel(f: File, origin?: "factory" | "ai") {
    setBusy(true);
    setAskOrigin(null);
    setNotice({ tone: "ok", text: /\.(step|stp)$/i.test(f.name) ? "上传中，服务器在转换工厂文件（大文件要 1–2 分钟）…" : "上传中…" });
    const fd = new FormData();
    fd.append("file", f);
    if (origin) fd.append("origin", origin);
    try {
      const res = await fetch(`/api/projects/${projectId}/models`, { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; size?: number; needOrigin?: boolean; reviewUrl?: string };
      if (data.needOrigin) {
        setNotice(null);
        setAskOrigin(f);
        return;
      }
      if (res.ok && data.reviewUrl) {
        router.push(data.reviewUrl);
        return;
      }
      setNotice(res.ok ? { tone: "ok", text: `工厂模型已保存，直接在用（${formatSize(data.size ?? f.size)}）` } : { tone: "error", text: data.error ?? "上传失败" });
      if (res.ok) setPath3("");
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "上传失败，检查网络后再试" });
    } finally {
      setBusy(false);
      if (modelInput.current) modelInput.current.value = "";
    }
  }

  async function removeModel(id: string) {
    if (!await askConfirm("删除在用的 3D 模型？删了以后 3D 页和出图都没有模型可用，要重新上传或建模。")) return;
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

  const bibleRow = (f: LocalProduct["bible"][number]) => <BibleRow key={f.key} f={f} form={FORM_ID} />;

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
        <Part title="角度照" hint="至少 4 张：正面、左侧、背面、右侧。白底、产品占满画面、不要手，用手机原图。">
          <PhotoSlots projectId={projectId} kind="white_photo" assets={kit.white} required={model ? [] : WHITE_REQUIRED} library={kit.library.filter((a) => detailIds.has(a.id))} warnings={photoWarnings} />
        </Part>

        <Part title="细节照（建议 2–4 张）" hint="座椅、车轮、把手、Logo 的特写。">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={detailInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="text-xs text-neutral-300" aria-label="细节照" />
            <button type="button" disabled={busy} onClick={() => upload("product_photo", detailInput.current)} className={ghost}>
              {busy ? "处理中…" : "上传"}
            </button>
          </div>
          <Thumbs items={details} busy={busy} onRemove={remove} warnings={photoWarnings} />
        </Part>

        <Part title="Logo" hint="最好是透明背景的 PNG 或 SVG。" aside={<Tag tone={logo ? "emerald" : "amber"}>{logo ? "已上传" : "未上传"}</Tag>}>
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
        summary={model ? `${PRECISION[precision3]} · ${model.originalName}${reviewing.length ? ` · ${reviewing.length} 个待审核` : ""}` : reviewing.length ? `${reviewing.length} 个待审核` : "还没有"}
      >
        {model ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-300">
            <Tag tone={precision3 === "approx" ? "amber" : "emerald"}>{PRECISION[precision3]}</Tag>
            <span className="min-w-0 truncate" title={model.originalName}>
              {model.originalName}
            </span>
            <Link href={`/projects/${projectId}/product/models/${model.id}`} className="text-amber-300 underline">
              查看
            </Link>
            <span className="flex-1" />
            {!asking ? (
              <button type="button" className={ghost} onClick={() => setPath3("file")}>
                换一个模型
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => removeModel(model.id)} className="text-xs text-neutral-500 hover:text-rose-300">
              删除
            </button>
          </div>
        ) : null}
        {model && precision3 === "approx" ? <p className="-mt-3 text-xs text-amber-200/80">照片建的模型只用来摆位置和定角度，车的样子出图时照实物照画。拿到工厂文件后点「换一个模型」。</p> : null}

        {reviewing.length && !photoOpen ? (
          <ul className="space-y-1 text-sm">
            {reviewing.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3">
                <Tag tone="amber">待审核</Tag>
                <span className="text-neutral-300">{m.name}</span>
                <Link href={`/projects/${projectId}/product/models/${m.id}`} className={buttonClass}>
                  去审核
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {asking ? (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-white">有工厂的 3D 文件吗？</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${choice} ${busy ? "pointer-events-none opacity-50" : ""}`}>
                <input
                  ref={modelInput}
                  type="file"
                  accept=".step,.stp,.glb,model/gltf-binary"
                  className="sr-only"
                  aria-label="上传工厂 3D 文件"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadModel(f);
                  }}
                />
                <span className="text-base font-semibold text-white">{busy ? "上传中…" : "有，上传文件"}</span>
                <span className="mt-1 block text-xs text-neutral-400">STEP 或 GLB，最大 300 MB，免费。尺寸和零件最准。</span>
              </label>
              <button type="button" className={`${choice} text-left ${path3 === "photo" ? "border-amber-400" : ""}`} onClick={() => setPath3("photo")}>
                <span className="text-base font-semibold text-white">没有，用照片建</span>
                <span className="mt-1 block text-xs text-neutral-400">用第 2 步的角度照，约 {shapePrice}，先看价格再付。是近似模型。</span>
              </button>
            </div>
            {askOrigin ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 text-sm">
                <span className="text-amber-100">「{askOrigin.name}」是哪来的？</span>
                <button type="button" className={buttonClass} disabled={busy} onClick={() => uploadModel(askOrigin, "factory")}>
                  工厂给的
                </button>
                <button type="button" className={ghost} disabled={busy} onClick={() => uploadModel(askOrigin, "ai")}>
                  照片 / AI 建的
                </button>
              </div>
            ) : null}
            {model ? (
              <button type="button" className="text-xs text-neutral-500 hover:text-neutral-300" onClick={() => setPath3("")}>
                不换了
              </button>
            ) : null}
          </section>
        ) : null}

        {photoOpen ? <ModelBuilder kit={kit} target="shape" /> : null}

        {model && model.source === "fal" ? (
          <details className="rounded-lg border border-white/10 p-3">
            <summary className="cursor-pointer text-sm text-neutral-200">有工厂 2D 图纸？传上来让尺寸更准{model.cad?.ok ? "（已校准）" : ""}</summary>
            <div className="mt-3">
              <DrawingCalibrate projectId={projectId} hasModel cad={model.cad ?? null} source={model.source} />
            </div>
          </details>
        ) : null}

        {model ? (
          <details className="rounded-lg border border-white/10 p-3">
            <summary className="cursor-pointer text-sm text-neutral-200">其他颜色款（可选）{kit.colors.length ? ` · ${kit.colors.length} 个` : ""}</summary>
            <p className="mt-2 text-xs text-neutral-500">每个颜色传这个颜色的实物照，出首帧时颜色、Logo 和贴纸照它来。</p>
            <div className="mt-2">
              <ColorKits kit={kit} hasBase />
            </div>
          </details>
        ) : null}
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
