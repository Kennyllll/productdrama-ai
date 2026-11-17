import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Tag } from "@/components/ui";
import { listEpisodesWithCards, listLedger, listLibrary, listSetLayouts, listShotCards, type LibraryFile, type LibraryKind, type ShotCard } from "@/lib/production-repo";
import { findLocalProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<LibraryKind, string> = {
  video: "视频",
  first_frame: "首帧",
  last_frame: "尾帧",
  comp: "构图",
  check: "检查图",
  audio: "声音",
  final: "成片",
};
const KIND_ORDER: LibraryKind[] = ["video", "first_frame", "last_frame", "comp", "check", "audio"];
const STATUS: Record<ShotCard["status"], { label: string; tone: "emerald" | "neutral" | "rose" }> = {
  final: { label: "定稿用上", tone: "emerald" },
  cut: { label: "剪掉了", tone: "neutral" },
  rejected: { label: "作废", tone: "rose" },
};
const fmt = (s: number) => s.toFixed(2).replace(/\.?0+$/, "");
const fileUrl = (id: string) => `/api/library/${id}`;

function MediaStrip({ files }: { files: LibraryFile[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {files.map((f) =>
        f.mime.startsWith("video/") ? (
          <figure key={f.id} className="w-64 shrink-0">
            <video src={fileUrl(f.id)} controls preload={f.status === "final" ? "metadata" : "none"} className="aspect-[2.33] w-full rounded border border-white/10 bg-black" />
            <figcaption className="mt-1 truncate text-[11px] text-neutral-500" title={f.label}>
              {f.status === "final" ? <span className="text-emerald-300">成片用的 · </span> : null}
              {f.status === "rejected" ? <span className="text-rose-300">作废 · </span> : null}
              {f.label}
            </figcaption>
          </figure>
        ) : f.mime.startsWith("image/") ? (
          <a key={f.id} href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="w-44 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(f.id)} alt={f.label} loading="lazy" className="h-24 w-full rounded border border-white/10 bg-black object-contain" />
            <span className="mt-1 block truncate text-[11px] text-neutral-500" title={f.label}>
              {f.label}
            </span>
          </a>
        ) : null,
      )}
    </div>
  );
}

export default async function ShotsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ep?: string; show?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!findLocalProject(id)) notFound();
  const episodes = listEpisodesWithCards(id);
  const ep = Number(sp.ep) || episodes[0] || 2;
  const show = sp.show === "final" || sp.show === "unused" ? sp.show : "all";
  const all = listShotCards(id, ep);
  const cards = all.filter((c) => (show === "final" ? c.status === "final" : show === "unused" ? c.status !== "final" : true));
  const library = listLibrary(id, ep);
  const ledger = listLedger(id).filter((l) => l.episode === ep && l.kind !== "usage_day");
  const layouts = new Set(listSetLayouts(id, ep).map((l) => l.code));
  const finalOrder = all.filter((c) => c.inFinal).sort((a, b) => a.inFinal!.start - b.inFinal!.start);

  const header = (
    <PageHeader
      title="镜头卡"
      description="每个镜头一张卡：故事目的、在成片里的位置、所有版本、返工原因、提示词和费用。E2 是导入的已完成项目，可以看每一镜是怎么调出来的。"
    />
  );
  if (all.length === 0) {
    return (
      <>
        {header}
        <Card title="还没有镜头卡">
          <p className="text-sm text-neutral-300">这个项目还没有导入或生成镜头卡。</p>
        </Card>
      </>
    );
  }

  const tab = (key: string, label: string) => (
    <Link href={`?ep=${ep}&show=${key}`} className={`rounded-lg px-3 py-1 text-sm ${show === key ? "bg-amber-400/15 text-amber-200" : "text-neutral-400 hover:bg-white/5"}`}>
      {label}
    </Link>
  );

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {episodes.map((e) => (
          <Link key={e} href={`?ep=${e}`} className={`rounded-lg border px-3 py-1 text-sm ${e === ep ? "border-amber-400/50 text-amber-200" : "border-white/10 text-neutral-400"}`}>
            第 {e} 集
          </Link>
        ))}
        <span className="mx-2 h-4 w-px bg-white/10" />
        {tab("all", `全部 ${all.length}`)}
        {tab("final", `定稿用上 ${finalOrder.length}`)}
        {tab("unused", `没用上 ${all.length - finalOrder.length}`)}
      </div>
      <div className="space-y-5">
        {cards.map((c) => {
          const files = library.filter((f) => f.shotCode === c.code);
          const jobs = ledger.filter((l) => l.shotCode === c.code);
          const spent = jobs.reduce((s, l) => s + l.usd, 0);
          const usedUsd = jobs.filter((l) => l.used).reduce((s, l) => s + l.usd, 0);
          const i = finalOrder.findIndex((x) => x.code === c.code);
          const prev = i > 0 ? finalOrder[i - 1] : null;
          const next = i >= 0 && i < finalOrder.length - 1 ? finalOrder[i + 1] : null;
          return (
            <article key={c.id} id={`shot-${c.code}`} className="scroll-mt-16 rounded-xl border border-white/10 bg-neutral-900/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-sm text-white">E{ep}-{c.code}</span>
                    <Tag tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Tag>
                    {c.inFinal ? (
                      <span className="text-xs text-neutral-400">
                        成片 {fmt(c.inFinal.start)}–{fmt(c.inFinal.end)} 秒 · 用素材 {fmt(c.inFinal.srcIn)}–{fmt(c.inFinal.srcOut)} 秒
                      </span>
                    ) : null}
                  </p>
                  <h2 className="mt-2 text-lg font-medium text-white">{c.title}</h2>
                  {c.purpose ? <p className="mt-1 text-sm text-neutral-300">故事目的：{c.purpose}</p> : null}
                  {c.camera ? <p className="text-sm text-neutral-400">机位：{c.camera}</p> : null}
                  {c.note ? <p className="text-sm text-neutral-400">{c.note}</p> : null}
                </div>
                <div className="text-right text-xs text-neutral-400">
                  <p>
                    生成任务 {jobs.length} 个 · 约 <span className="text-white">${spent.toFixed(2)}</span>
                  </p>
                  <p>用上的约 ${usedUsd.toFixed(2)}</p>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {c.inFinal ? (
                      <Link href={`/projects/${id}/timeline?t=${c.inFinal.start}&shot=${c.code}`} className="text-amber-200 underline">
                        在时间线里看
                      </Link>
                    ) : null}
                    {layouts.has(c.code) ? (
                      <Link href={`/projects/${id}/set?shot=${c.code}`} className="text-amber-200 underline">
                        在 3D 布景里看
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>

              {prev || next ? (
                <p className="mt-3 text-xs text-neutral-500">
                  衔接：{prev ? <a href={`#shot-${prev.code}`} className="underline">上一镜 {prev.code}</a> : "（开头）"} →{" "}
                  <span className="text-neutral-300">{c.code}</span> → {next ? <a href={`#shot-${next.code}`} className="underline">下一镜 {next.code}</a> : "（结尾）"}
                </p>
              ) : null}

              {c.issues.length ? (
                <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3">
                  <p className="mb-1 text-xs font-medium text-rose-200">返工记录</p>
                  <ul className="space-y-1 text-sm">
                    {c.issues.map((x) => (
                      <li key={x.title}>
                        <span className="text-rose-100">问题：{x.title}</span>
                        <span className="text-neutral-400"> → 改法：{x.fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {files.length ? (
              <details className="mt-4">
                <summary className="cursor-pointer select-none text-xs text-neutral-400">
                  素材和版本（{files.length}）
                </summary>
              {KIND_ORDER.map((k) => {
                const fs = files.filter((f) => f.kind === k).sort((a, b) => (b.status === "final" ? 1 : 0) - (a.status === "final" ? 1 : 0));
                if (!fs.length) return null;
                return (
                  <div key={k} className="mt-4">
                    <p className="mb-2 text-xs text-neutral-400">
                      {KIND_LABEL[k]}（{fs.length}）
                    </p>
                    <MediaStrip files={fs} />
                  </div>
                );
              })}
              </details>
              ) : null}

              {c.prompts.length ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-neutral-400">提示词（{c.prompts.length}）</summary>
                  <div className="mt-2 space-y-2">
                    {c.prompts.map((p, pi) => (
                      <div key={`${pi}-${p.label}`}>
                        <p className="text-[11px] text-neutral-500">{p.label}</p>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-neutral-300">{p.text}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}
