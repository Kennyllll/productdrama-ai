"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useRef, useState } from "react";
import { MAX_PHOTOS_PER_OWNER } from "@/lib/cast";
import type { PhotoOwner, PhotoView } from "@/lib/types";

export function PhotoStrip({
  owner,
  ownerId,
  photos,
  onChange,
  disabledHint,
}: {
  owner: PhotoOwner;
  ownerId: string;
  photos: PhotoView[];
  onChange: (photos: PhotoView[]) => void;
  disabledHint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMsg("");
    const fd = new FormData();
    fd.append("owner", owner);
    fd.append("ownerId", ownerId);
    Array.from(files).forEach((f) => fd.append("file", f));
    try {
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data = (await res.json()) as { added: number; errors: string[]; photos?: PhotoView[] };
      if (data.photos) onChange(data.photos);
      setMsg([data.added ? `已上传 ${data.added} 张` : "", ...data.errors].filter(Boolean).join("；"));
    } catch {
      setMsg("上传失败，请重试");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (p: PhotoView) => {
    if (!await askConfirm(`删除参考照「${p.originalName}」？`)) return;
    const res = await fetch(`/api/photos/${p.id}`, { method: "DELETE" });
    if (res.ok) onChange(photos.filter((x) => x.id !== p.id));
    else setMsg("删除失败，请重试");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <figure key={p.id} className="group relative h-16 w-16 overflow-hidden rounded-md border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- 本地 API 动态图片 */}
            <img src={`/api/photos/${p.id}`} alt={p.originalName} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label={`删除 ${p.originalName}`}
              className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-xs text-white opacity-0 focus:opacity-100 group-hover:opacity-100"
            >
              ×
            </button>
          </figure>
        ))}
        {disabledHint ? (
          <p className="self-center text-xs text-neutral-500">{disabledHint}</p>
        ) : photos.length < MAX_PHOTOS_PER_OWNER ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-white/20 text-xs text-neutral-400 hover:border-amber-400 disabled:opacity-40"
          >
            {busy ? "上传中" : "+ 参考照"}
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        aria-label="上传参考照"
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      {msg ? (
        <p role="status" className="mt-1 text-xs text-amber-200">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
