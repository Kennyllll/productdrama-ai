"use client";

import type { Episode, EpisodeNumber } from "@/lib/types";

export function EpisodeTabs({
  episodes,
  value,
  onChange,
}: {
  episodes: Episode[];
  value: EpisodeNumber;
  onChange: (n: EpisodeNumber) => void;
}) {
  return (
    <div role="tablist" aria-label="集数" className="mb-5 flex flex-wrap gap-2">
      {episodes.map((ep) => (
        <button
          key={ep.number}
          role="tab"
          type="button"
          aria-selected={value === ep.number}
          onClick={() => onChange(ep.number)}
          className={`rounded-lg px-4 py-2 text-sm ${value === ep.number ? "bg-amber-400 text-black" : "bg-white/5 hover:bg-white/10"}`}
        >
          第 {ep.number} 集 · {ep.title}
        </button>
      ))}
    </div>
  );
}
