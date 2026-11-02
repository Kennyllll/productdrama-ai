"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProductAction } from "@/app/actions";
import { Card, Tag } from "@/components/ui";
import type { AssetKind, FormState, LocalProduct } from "@/lib/types";

export interface AssetView {
  id: string;
  angle: string;
  originalName: string;
  size: number;
}

const inputClass =
  "w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none";
const buttonClass =
  "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50";

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

export function LocalProductWorkbench({
  projectId,
  product,
  photos,
  logo,
  angles,
}: {
  projectId: string;
  product: LocalProduct;
  photos: AssetView[];
  logo: AssetView | null;
  angles: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [angle, setAngle] = useState(angles[0]);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(saveProductAction, {});

  const coveredAngles = new Set(photos.map((p) => p.angle));
  const missingAngles = angles.filter((a) => !coveredAngles.has(a));
  const pending = product.bible.filter((f) => f.needsConfirmation).length;

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
    fd.append("angle", kind === "logo" ? "Logo" : angle);
    Array.from(files).forEach((f) => fd.append("file", f));
    try {
      const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: fd });
      const data = (await res.json()) as { added: number; errors: string[] };
      const parts: string[] = [];
      if (data.added) parts.push(`已保存 ${data.added} 个文件到本机`);
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

  async function remove(id: string) {
    if (!window.confirm("删除这个文件？本机上的文件也会一并删除。")) return;
    setBusy(true);
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    setNotice(res.ok ? { tone: "ok", text: "已删除" } : { tone: "error", text: "删除失败" });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        {notice ? (
          <p
            role="status"
            className={`rounded-lg px-4 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}
          >
            {notice.text}
          </p>
        ) : null}

        <Card title="产品照片（建议 6–10 张，多角度）" aside={<Tag tone={photos.length ? "emerald" : "amber"}>已上传 {photos.length} 张</Tag>}>
          <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white/5 p-3">
            <label className="text-sm">
              <span className="block text-xs text-neutral-400">拍摄角度</span>
              <select value={angle} onChange={(e) => setAngle(e.target.value)} className={`${inputClass} mt-1`}>
                {angles.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-neutral-400">PNG / JPG / WebP，单张 ≤ 20 MB，可多选</span>
              <input ref={photoInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="mt-1 text-sm text-neutral-300" />
            </label>
            <button type="button" disabled={busy} onClick={() => upload("product_photo", photoInput.current)} className={buttonClass}>
              {busy ? "处理中…" : "上传照片"}
            </button>
          </div>
          {missingAngles.length ? (
            <p className="mt-3 text-xs text-neutral-400">
              未覆盖角度：{missingAngles.join("、")}
              {coveredAngles.has(angles[0]) ? null : <span className="ml-1 text-amber-300">（首张建议上传「{angles[0]}」）</span>}
            </p>
          ) : (
            <p className="mt-3 text-xs text-emerald-300">建议角度已全部覆盖</p>
          )}
          {photos.length ? (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p) => (
                <li key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${p.id}`}
                    alt={`${p.angle} · ${p.originalName}`}
                    className="aspect-square w-full rounded-lg border border-white/10 bg-black object-contain"
                  />
                  <p className="mt-1 flex items-center justify-between gap-2 text-xs text-neutral-400">
                    <span className="truncate" title={p.originalName}>
                      {p.angle} · {formatSize(p.size)}
                    </span>
                    <button type="button" disabled={busy} onClick={() => remove(p.id)} className="shrink-0 text-rose-300 hover:text-rose-200">
                      删除
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title="Logo" aside={<Tag tone={logo ? "emerald" : "amber"}>{logo ? "已上传" : "未上传"}</Tag>}>
          <div className="flex flex-wrap items-center gap-4">
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/assets/${logo.id}`}
                alt={`Logo · ${logo.originalName}`}
                className="aspect-square w-28 rounded-lg border border-white/10 bg-[repeating-conic-gradient(#2a2a2a_0_25%,#1a1a1a_0_50%)] bg-[length:16px_16px] object-contain p-2"
              />
            ) : null}
            <div className="space-y-2">
              <p className="text-sm text-neutral-400">成片中 Logo 只用原始文件合成，不交给 AI 重绘。建议透明背景 PNG / SVG；重新上传会替换。</p>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-sm text-neutral-300" />
                <button type="button" disabled={busy} onClick={() => upload("logo", logoInput.current)} className={buttonClass}>
                  上传 Logo
                </button>
                {logo ? (
                  <button type="button" disabled={busy} onClick={() => remove(logo.id)} className="text-sm text-rose-300 hover:text-rose-200">
                    删除
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <form action={saveAction} className="space-y-6 lg:col-span-2">
        <input type="hidden" name="projectId" value={projectId} />
        <Card title="基本信息">
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="text-xs text-neutral-400">产品名称</span>
              <input name="name" defaultValue={product.name} maxLength={80} className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-400">品类</span>
              <input name="category" defaultValue={product.category} maxLength={80} placeholder="例如：儿童出行 / 滑板车" className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-400">卖点（每行一条，最多 10 条）</span>
              <textarea name="sellingPoints" defaultValue={product.sellingPoints.join("\n")} rows={4} className={`${inputClass} mt-1`} />
            </label>
          </div>
        </Card>
        <Card title="Product Bible">
          <p className="mb-3 text-xs text-neutral-400">
            无法从照片准确推断的信息需要你确认。待确认：<span className="text-amber-300">{pending}</span> / {product.bible.length}（以上次保存为准）
          </p>
          <ul className="space-y-2">
            {product.bible.map((f) => (
              <li key={f.key} className="grid items-center gap-2 rounded-lg bg-white/5 p-3 sm:grid-cols-[5rem_1fr_auto]">
                <label htmlFor={`bible-${f.key}`} className="text-sm text-neutral-300">
                  {f.label}
                </label>
                <input id={`bible-${f.key}`} name={`bible.${f.key}.value`} defaultValue={f.value} maxLength={200} placeholder="待填写" className={inputClass} />
                <label className="flex items-center gap-1 text-xs text-neutral-300">
                  <input type="checkbox" name={`bible.${f.key}.confirmed`} defaultChecked={!f.needsConfirmation} />
                  已确认
                </label>
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving ? "保存中…" : "保存产品信息"}
          </button>
          {saveState.ok ? <span className="text-sm text-emerald-300">{saveState.ok}</span> : null}
          {saveState.error ? <span className="text-sm text-rose-300">{saveState.error}</span> : null}
        </div>
      </form>
    </div>
  );
}
