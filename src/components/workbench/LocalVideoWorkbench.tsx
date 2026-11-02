"use client";

import { useRef, useState, useTransition } from "react";
import { renderEpisodeAction, renderFullAction } from "@/app/video-actions";
import { Card, Tag } from "@/components/ui";
import type { ShotMediaView } from "@/lib/media-repo";
import type { RenderInfo } from "@/lib/render";
import type { FormState } from "@/lib/types";

export interface VideoShot {
  id: string;
  index: number;
  seconds: number;
  description: string;
  size: string;
  camera: string;
  hasDialogue: boolean;
}

export interface VideoEpisode {
  number: number;
  title: string;
  shots: VideoShot[];
}

const smallBtn = "rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-white/10 disabled:opacity-40";
const mainBtn = "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40";

function ShotTile({
  shot,
  media,
  uploading,
  onPick,
  onDelete,
}: {
  shot: VideoShot;
  media: ShotMediaView | undefined;
  uploading: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-lg border border-white/10 bg-black/30 p-2" data-shot={shot.id}>
      <div className="aspect-video overflow-hidden rounded bg-neutral-900">
        {media?.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/shot-media/${media.id}`} alt={`镜头 ${shot.index} 素材`} className="h-full w-full object-cover" />
        ) : media?.kind === "video" ? (
          <video src={`/api/shot-media/${media.id}`} muted preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-neutral-500" title={shot.description}>
            占位画面
            <br />
            {shot.size} · {shot.camera}
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-neutral-300">
        #{shot.index} · {shot.seconds}s{shot.hasDialogue ? " · 台词" : ""}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <button type="button" onClick={onPick} disabled={uploading} className={smallBtn}>
          {uploading ? "上传中…" : media ? "替换" : "上传素材"}
        </button>
        {media ? (
          <button type="button" onClick={onDelete} disabled={uploading} className={smallBtn}>
            删除
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Player({ projectId, render, label }: { projectId: string; render: RenderInfo; label: string }) {
  const src = `/api/projects/${projectId}/renders/${render.name}?v=${encodeURIComponent(render.updatedAt)}`;
  return (
    <div className="mt-3">
      <video key={src} src={src} controls preload="metadata" className="w-full rounded-lg bg-black" aria-label={label} />
      <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span>
          合成于 {new Date(render.updatedAt).toLocaleString("zh-CN")} · {(render.size / 1024 / 1024).toFixed(1)} MB
        </span>
        <a href={`${src}&download=1`} className="text-amber-200 underline">
          下载 {render.name}
        </a>
      </p>
    </div>
  );
}

export function LocalVideoWorkbench({
  projectId,
  episodes,
  initialMedia,
  initialRenders,
  spec,
}: {
  projectId: string;
  episodes: VideoEpisode[];
  initialMedia: ShotMediaView[];
  initialRenders: RenderInfo[];
  spec: { aspectRatio: string; fps: number; width: number; height: number };
}) {
  const [media, setMedia] = useState(initialMedia);
  const [renders, setRenders] = useState(initialRenders);
  const [subtitles, setSubtitles] = useState(true);
  const [status, setStatus] = useState<FormState>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const targetShot = useRef<string | null>(null);

  const allShotIds = new Set(episodes.flatMap((e) => e.shots.map((s) => s.id)));
  const orphans = media.filter((m) => !allShotIds.has(m.shotId)).length;
  const renderOf = (name: string) => renders.find((r) => r.name === name);

  const pick = (shotId: string) => {
    targetShot.current = shotId;
    fileRef.current?.click();
  };

  const upload = async (file: File) => {
    const shotId = targetShot.current;
    if (!shotId) return;
    setUploadingShot(shotId);
    setStatus({});
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}/media`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { media?: ShotMediaView; error?: string };
      if (!res.ok || !body.media) setStatus({ error: body.error ?? "上传失败" });
      else {
        const m = body.media;
        setMedia((prev) => [...prev.filter((x) => x.shotId !== shotId), m]);
        setStatus({ ok: `已上传：${m.originalName}` });
      }
    } catch {
      setStatus({ error: "上传失败，请检查网络或文件大小" });
    } finally {
      setUploadingShot(null);
    }
  };

  const remove = async (m: ShotMediaView) => {
    if (!window.confirm(`删除素材「${m.originalName}」？`)) return;
    const res = await fetch(`/api/shot-media/${m.id}`, { method: "DELETE" });
    if (res.ok) setMedia((prev) => prev.filter((x) => x.id !== m.id));
    else setStatus({ error: "删除失败" });
  };

  const renderEp = (n: number) => {
    setBusy(`ep${n}`);
    setStatus({});
    startTransition(async () => {
      const res = await renderEpisodeAction(projectId, n, subtitles);
      setStatus(res);
      if (res.renders) setRenders(res.renders);
      setBusy(null);
    });
  };

  const renderAll = () => {
    setBusy("full");
    setStatus({});
    startTransition(async () => {
      const res = await renderFullAction(projectId);
      setStatus(res);
      if (res.renders) setRenders(res.renders);
      setBusy(null);
    });
  };

  const epDone = [1, 2, 3, 4].every((n) => renderOf(`ep${n}.mp4`));
  const full = renderOf("full.mp4");

  return (
    <div className="space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="上传镜头素材"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />

      <Card title="合成设置">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-neutral-300">
            画幅 {spec.aspectRatio}（{spec.width}×{spec.height}）· {spec.fps}fps
          </span>
          <label className="flex items-center gap-2 text-neutral-300">
            <input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />
            烧录英文台词字幕
          </label>
          <span className="text-xs text-neutral-500">画幅和帧率取自分镜页的视觉规范；转场「淡出」做淡出，其余暂按硬切。声音页上传的分轨会自动混音（对白出现时压低音乐，响度 -14 LUFS）。</span>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          每个镜头可上传 1 个视频（MP4 / MOV / WebM）或图片（PNG / JPG / WebP），最大 300 MB；未上传的镜头用占位画面。素材和成片只保存在本机 uploads/。
        </p>
        {orphans > 0 ? (
          <p className="mt-2 text-xs text-amber-200">有 {orphans} 个素材对应的镜头已不在当前分镜中（重新生成分镜后镜头会变），不会用于合成。</p>
        ) : null}
        <p role="status" className="mt-2 min-h-5 text-sm">
          {busy ? <span className="text-amber-200">FFmpeg 正在合成，每集约需 10–60 秒…</span> : null}
          {!busy && status.ok ? <span className="text-emerald-300">{status.ok}</span> : null}
          {!busy && status.error ? <span className="text-rose-300">{status.error}</span> : null}
        </p>
      </Card>

      {episodes.map((ep) => {
        const r = renderOf(`ep${ep.number}.mp4`);
        const total = ep.shots.reduce((t, s) => t + s.seconds, 0);
        const uploaded = ep.shots.filter((s) => media.some((m) => m.shotId === s.id)).length;
        return (
          <Card
            key={ep.number}
            title={`第 ${ep.number} 集 · ${ep.title || "未命名"}`}
            aside={
              <button type="button" onClick={() => renderEp(ep.number)} disabled={pending} className={mainBtn}>
                {busy === `ep${ep.number}` ? "合成中…" : r ? "重新合成本集" : "合成本集"}
              </button>
            }
          >
            <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              {ep.shots.length} 个镜头 · 合计 {total} 秒 · 已上传素材 {uploaded} / {ep.shots.length}
              {r ? <Tag tone="emerald">已合成</Tag> : <Tag>未合成</Tag>}
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {ep.shots.map((s) => (
                <ShotTile
                  key={s.id}
                  shot={s}
                  media={media.find((m) => m.shotId === s.id)}
                  uploading={uploadingShot === s.id}
                  onPick={() => pick(s.id)}
                  onDelete={() => {
                    const m = media.find((x) => x.shotId === s.id);
                    if (m) void remove(m);
                  }}
                />
              ))}
            </ul>
            {r ? <Player projectId={projectId} render={r} label={`第 ${ep.number} 集成片`} /> : null}
          </Card>
        );
      })}

      <Card
        title="四集总片"
        aside={
          <button type="button" onClick={renderAll} disabled={pending || !epDone} className={mainBtn}>
            {busy === "full" ? "合成中…" : full ? "重新合成总片" : "合成四集总片"}
          </button>
        }
      >
        <p className="text-xs text-neutral-500">{epDone ? "四集都已合成，可以拼成总片。" : "四集都合成后才能拼总片。"}</p>
        {full ? <Player projectId={projectId} render={full} label="四集总片" /> : null}
      </Card>
    </div>
  );
}
