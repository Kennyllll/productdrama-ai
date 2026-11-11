"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineCue, TimelineData } from "@/lib/production-repo";

const LAYER: Record<TimelineCue["layer"], { label: string; color: string }> = {
  dialogue: { label: "对白", color: "bg-sky-400/40" },
  music: { label: "音乐", color: "bg-violet-400/40" },
  ambience: { label: "环境声", color: "bg-emerald-400/30" },
  sfx: { label: "音效", color: "bg-amber-400/40" },
};

/** 把有重叠的段落排成几条不重叠的轨道 */
function lanes<T extends { start: number; end: number }>(items: T[]): T[][] {
  const out: T[][] = [];
  for (const it of [...items].sort((a, b) => a.start - b.start)) {
    const lane = out.find((l) => l[l.length - 1].end <= it.start);
    if (lane) lane.push(it);
    else out.push([it]);
  }
  return out;
}

const fmt = (s: number) => s.toFixed(1);

export function TimelineView({
  projectId,
  data,
  cards,
  initialT,
}: {
  projectId: string;
  data: TimelineData;
  cards: Record<string, { title: string; purpose: string }>;
  initialT: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fileId, setFileId] = useState(data.deliverables[0]?.fileId ?? "");
  const [t, setT] = useState(initialT);
  const pct = (s: number) => `${(s / data.total) * 100}%`;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setT(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = s;
    void v.play().catch(() => {});
  };

  const cut = data.cuts.find((c) => t >= c.start && t < c.end) ?? data.cuts[data.cuts.length - 1];
  const sound = useMemo(() => (["music", "ambience", "sfx"] as const).map((layer) => ({ layer, rows: lanes(data.cues.filter((c) => c.layer === layer)) })), [data.cues]);
  const vertical = data.deliverables.find((d) => d.fileId === fileId)?.label.includes("竖");

  const Block = ({ start, end, label, color, active, title }: { start: number; end: number; label: string; color: string; active?: boolean; title: string }) => (
    <button
      type="button"
      title={title}
      onClick={() => seek(start)}
      style={{ left: pct(start), width: pct(end - start) }}
      className={`absolute top-0 h-full overflow-hidden whitespace-nowrap rounded-sm border px-1 text-left text-[10px] leading-6 text-white ${color} ${active ? "border-white" : "border-black/40"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {data.deliverables.map((d) => (
              <button
                key={d.fileId}
                type="button"
                onClick={() => setFileId(d.fileId)}
                className={`rounded-lg border px-3 py-1 text-xs ${d.fileId === fileId ? "border-amber-400/60 text-amber-200" : "border-white/10 text-neutral-400"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <video
            key={fileId}
            ref={videoRef}
            src={`/api/library/${fileId}`}
            controls
            preload="metadata"
            onLoadedMetadata={(e) => {
              if (initialT) e.currentTarget.currentTime = initialT;
            }}
            className={`rounded-lg border border-white/10 bg-black ${vertical ? "mx-auto max-h-[560px]" : "w-full"}`}
          />
        </div>
        <div className="rounded-xl border border-white/10 bg-neutral-900/70 p-4 text-sm">
          <p className="text-xs text-neutral-500">现在播到 {fmt(t)} 秒</p>
          {cut ? (
            <>
              <p className="mt-2 font-mono text-white">E2-{cut.code}</p>
              <p className="mt-1 text-neutral-200">{cards[cut.code]?.title}</p>
              {cards[cut.code]?.purpose ? <p className="mt-1 text-xs text-neutral-400">故事目的：{cards[cut.code].purpose}</p> : null}
              <p className="mt-1 text-xs text-neutral-500">
                {fmt(cut.start)}–{fmt(cut.end)} 秒
              </p>
              <Link href={`/projects/${projectId}/shots#shot-${cut.code}`} className="mt-2 inline-block text-xs text-amber-200 underline">
                打开这个镜头的镜头卡
              </Link>
            </>
          ) : null}
          <ul className="mt-4 space-y-1 text-[11px] text-neutral-500">
            {data.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-rose-400" style={{ left: `calc(5rem + (100% - 5rem) * ${t / data.total})` }} />
          <Row label="画面">
            {data.cuts.map((c) => (
              <Block key={c.code} start={c.start} end={c.end} label={c.code} color="bg-neutral-600" active={c === cut} title={`${c.code} · ${fmt(c.start)}–${fmt(c.end)} 秒 · ${cards[c.code]?.title ?? ""}`} />
            ))}
          </Row>
          {lanes(data.lines).map((row, i) => (
            <Row key={`l${i}`} label={i === 0 ? "字幕" : ""}>
              {row.map((l) => (
                <Block key={`${l.start}`} start={l.start} end={l.end} label={l.text} color={l.kind === "旁白" ? "bg-sky-500/40" : l.kind === "字卡" ? "bg-rose-400/40" : "bg-sky-300/30"} title={`${l.kind} · ${fmt(l.start)}–${fmt(l.end)} 秒 · ${l.text}`} />
              ))}
            </Row>
          ))}
          {sound.map(({ layer, rows }) =>
            rows.map((row, i) => (
              <Row key={`${layer}${i}`} label={i === 0 ? LAYER[layer].label : ""}>
                {row.map((c) => (
                  <Block key={`${c.label}${c.start}`} start={c.start} end={c.end} label={c.label} color={LAYER[layer].color} title={`${LAYER[layer].label} · ${fmt(c.start)}–${fmt(c.end)} 秒 · ${c.label}`} />
                ))}
              </Row>
            )),
          )}
          <div className="ml-20 flex justify-between pt-1 text-[10px] text-neutral-500">
            {Array.from({ length: Math.floor(data.total / 10) + 1 }, (_, i) => (
              <span key={i}>{i * 10}s</span>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">点任意一段跳到那里播放。这一版只能看，拖动入点和出点、调声音推子在下一轮做。</p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-6 items-stretch gap-0 py-px">
      <span className="w-20 shrink-0 pr-2 text-right text-[11px] leading-6 text-neutral-400">{label}</span>
      <div className="relative flex-1 rounded-sm bg-white/[0.03]">{children}</div>
    </div>
  );
}
