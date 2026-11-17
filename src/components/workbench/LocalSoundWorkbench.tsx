"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useRef, useState, useTransition } from "react";
import { aiSoundPlanAction, saveSoundPlanAction } from "@/app/sound-actions";
import { Card, Tag } from "@/components/ui";
import { AiButton, UsageNote } from "@/components/workbench/AiButton";
import { SaveBar } from "@/components/workbench/SaveBar";
import type { AiUsage } from "@/lib/ai/models";
import { beatTypeLabel } from "@/lib/mock/demo";
import { blankCue, checkSoundEpisode, layerLabel, SOUND_LAYERS, STEM_LAYERS } from "@/lib/sound";
import type { StemView } from "@/lib/sound-repo";
import type { Beat, EpisodeNumber, FormState, SoundCue, SoundLayer, SoundPlan, StemLayer } from "@/lib/types";

export interface SoundEpisodeInfo {
  number: EpisodeNumber;
  title: string;
  total: number;
  beats: Beat[];
  shots: { index: number; start: number; seconds: number; description: string; sound: string; dialogue: boolean }[];
}

const field = "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none";
const smallBtn = "rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-40";
const emptyPlan = (proposalId: string): SoundPlan => ({
  sourceProposalId: proposalId,
  motif: "",
  productSignature: "",
  mixNote: "",
  episodes: ([1, 2, 3, 4] as EpisodeNumber[]).map((number) => ({ number, direction: "", cues: [] })),
});
const pct = (s: number, total: number) => `${(Math.max(0, Math.min(total, s)) / total) * 100}%`;

function Timeline({ info, cues, selectedId, onSelect }: { info: SoundEpisodeInfo; cues: SoundCue[]; selectedId: string; onSelect: (id: string) => void }) {
  const total = Math.max(1, info.total);
  return (
    <div className="space-y-1 text-[10px]" aria-label="声音时间线">
      <div className="relative h-8 rounded bg-white/5">
        {info.beats.map((b, i) => (
          <div
            key={i}
            title={`${beatTypeLabel[b.type]} ${b.startSec}–${b.endSec}s · 强度 ${b.intensity}`}
            className="absolute bottom-0 border-r border-black/40 bg-rose-400/50"
            style={{ left: pct(b.startSec, total), width: pct(b.endSec - b.startSec, total), height: `${b.intensity * 20}%` }}
          />
        ))}
        <span className="absolute left-1 top-0.5 text-neutral-300">情绪</span>
      </div>
      <div className="relative h-5 rounded bg-white/5">
        {info.shots.map((s) => (
          <div
            key={s.index}
            title={`镜头 ${s.index}：${s.description}${s.sound ? `\n声音：${s.sound}` : ""}`}
            className="absolute inset-y-0 border-r border-black/50 bg-white/10 px-0.5 text-neutral-400"
            style={{ left: pct(s.start, total), width: pct(s.seconds, total) }}
          >
            {s.index}
            {s.dialogue ? "💬" : ""}
          </div>
        ))}
      </div>
      {SOUND_LAYERS.map((l) => (
        <div key={l.key} className="relative h-6 rounded bg-white/5">
          <span className="absolute left-1 top-1 z-0 text-neutral-500">{l.label}</span>
          {cues
            .filter((c) => c.layer === l.key)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.description}
                onClick={() => onSelect(c.id)}
                className={`absolute inset-y-0.5 z-10 truncate rounded px-1 text-left text-black ${l.color} ${c.id === selectedId ? "ring-2 ring-white" : ""}`}
                style={{ left: pct(c.startSec, total), width: pct(Math.max(0.5, c.endSec - c.startSec), total) }}
              >
                {c.description || l.label}
              </button>
            ))}
        </div>
      ))}
      <div className="flex justify-between text-neutral-500">
        <span>0s</span>
        <span>{total}s</span>
      </div>
    </div>
  );
}

function StemRow({
  projectId,
  episode,
  layer,
  stem,
  onChange,
}: {
  projectId: string;
  episode: EpisodeNumber;
  layer: (typeof STEM_LAYERS)[number];
  stem: StemView | undefined;
  onChange: (next: StemView | null, error?: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [vol, setVol] = useState(stem?.volumeDb ?? 0);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("episode", String(episode));
      form.append("layer", layer.key);
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/stems`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { stem?: StemView; error?: string };
      if (body.stem) {
        setVol(body.stem.volumeDb);
        onChange(body.stem);
      } else onChange(stem ?? null, body.error ?? "上传失败");
    } catch {
      onChange(stem ?? null, "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const saveVolume = async (v: number) => {
    if (!stem) return;
    const res = await fetch(`/api/stems/${stem.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ volumeDb: v }) });
    const body = (await res.json().catch(() => ({}))) as { stem?: StemView };
    if (body.stem) onChange(body.stem);
  };

  const remove = async () => {
    if (!stem || !await askConfirm(`删除分轨「${stem.originalName}」？`)) return;
    const res = await fetch(`/api/stems/${stem.id}`, { method: "DELETE" });
    if (res.ok) onChange(null);
  };

  return (
    <li className="grid items-center gap-2 rounded-lg border border-white/10 p-2 text-sm sm:grid-cols-[9rem_1fr_auto]" data-stem={layer.key}>
      <div>
        <p className="text-white">{layer.label}</p>
        <p className="text-[11px] text-neutral-500">{layer.hint}</p>
      </div>
      <div className="min-w-0">
        {stem ? (
          <>
            <audio src={`/api/stems/${stem.id}`} controls preload="none" className="h-8 w-full" />
            <label className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
              音量
              <input
                type="range"
                min={-30}
                max={12}
                step={0.5}
                value={vol}
                aria-label={`${layer.label}音量`}
                onChange={(e) => setVol(Number(e.target.value))}
                onPointerUp={() => void saveVolume(vol)}
                onKeyUp={() => void saveVolume(vol)}
                className="flex-1"
              />
              <span className="w-14 text-right">{vol > 0 ? `+${vol}` : vol} dB</span>
            </label>
            <p className="truncate text-[11px] text-neutral-500">{stem.originalName}</p>
          </>
        ) : (
          <p className="text-xs text-neutral-500">未上传</p>
        )}
      </div>
      <div className="flex gap-1">
        <input
          ref={ref}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.aiff,.aif,.flac"
          className="hidden"
          aria-label={`上传${layer.label}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        <button type="button" className={smallBtn} disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? "上传中…" : stem ? "替换" : "上传"}
        </button>
        {stem ? (
          <button type="button" className={smallBtn} onClick={() => void remove()}>
            删除
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function LocalSoundWorkbench({
  projectId,
  initial,
  proposalId,
  episodes,
  initialStems,
  aiReady,
}: {
  projectId: string;
  initial: SoundPlan | null;
  proposalId: string;
  episodes: SoundEpisodeInfo[];
  initialStems: StemView[];
  aiReady: boolean;
}) {
  const [plan, setPlan] = useState<SoundPlan>(initial ?? emptyPlan(proposalId));
  const [epNo, setEpNo] = useState<EpisodeNumber>(1);
  const [selectedId, setSelectedId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [stems, setStems] = useState(initialStems);
  const [stemError, setStemError] = useState("");
  const [ai, setAi] = useState<{ plan: SoundPlan; usage: AiUsage } | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiPending, startAi] = useTransition();

  const info = episodes.find((e) => e.number === epNo) ?? episodes[0];
  const ep = plan.episodes.find((e) => e.number === epNo) ?? plan.episodes[0];
  const selected = ep.cues.find((c) => c.id === selectedId);
  const warnings = checkSoundEpisode(ep.cues, info?.beats ?? [], info?.total ?? 45);
  const outdated = initial !== null && plan.sourceProposalId !== proposalId;

  const touch = () => {
    setDirty(true);
    setStatus({});
  };
  const update = (patch: Partial<SoundPlan>) => {
    setPlan((p) => ({ ...p, ...patch }));
    touch();
  };
  const updateEp = (fn: (cues: SoundCue[]) => SoundCue[], direction?: string) => {
    setPlan((p) => ({
      ...p,
      episodes: p.episodes.map((e) => (e.number === epNo ? { ...e, direction: direction ?? e.direction, cues: fn(e.cues).sort((a, b) => a.startSec - b.startSec) } : e)),
    }));
    touch();
  };
  const updateCue = (patch: Partial<SoundCue>) => updateEp((cues) => cues.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));

  const persist = (p: SoundPlan) =>
    startTransition(async () => {
      const res = await saveSoundPlanAction(projectId, p);
      setStatus(res);
      if (res.ok) setDirty(false);
    });

  const runAi = () => {
    setAiError("");
    setAi(null);
    startAi(async () => {
      const res = await aiSoundPlanAction(projectId);
      if (res.error || !res.result) setAiError(res.error ?? "AI 没有返回声音设计");
      else setAi({ plan: res.result, usage: res.usage ?? { promptTokens: 0, completionTokens: 0 } });
    });
  };

  const acceptAi = async () => {
    if (!ai) return;
    if (plan.episodes.some((e) => e.cues.length) && !await askConfirm("用 AI 声音设计覆盖现有内容，继续吗？")) return;
    setPlan(ai.plan);
    setSelectedId("");
    setAi(null);
    persist(ai.plan);
  };

  const stemFor = (layer: StemLayer) => stems.find((s) => s.episode === epNo && s.layer === layer);

  return (
    <div className="space-y-6">
      {outdated ? (
        <p role="note" className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 text-sm text-amber-100">
          剧本已改为按另一个提案生成，当前声音设计不会自动更新。需要时重新 AI 生成。
        </p>
      ) : null}

      <Card
        title="全片声音：母题与混音"
        aside={
          <AiButton ready={aiReady} pending={aiPending} onClick={runAi}>
            AI 生成声音设计
          </AiButton>
        }
      >
        <p className="mb-3 text-xs text-neutral-400">
          声音跟着情绪曲线走：钩子靠细节音，冲突收紧节奏，转折或最低谷让音乐抽空，悬念停在未解决的音上。给主角一个旋律母题，四集逐渐展开，第 4 集完整回收。
        </p>
        {aiPending ? <p className="mb-3 text-sm text-amber-200">声音导演正在设计四集声音，通常需要 1–4 分钟…</p> : null}
        {aiError ? <p className="mb-3 text-sm text-rose-300">{aiError}</p> : null}
        {ai ? (
          <div className="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-sm">
            <p className="text-emerald-200">AI 声音设计预览（尚未采用）</p>
            <p className="mt-2 text-neutral-300">母题：{ai.plan.motif}</p>
            <p className="mt-1 text-neutral-300">产品声音：{ai.plan.productSignature}</p>
            <ul className="mt-2 space-y-1 text-xs text-neutral-400">
              {ai.plan.episodes.map((e) => (
                <li key={e.number}>
                  第 {e.number} 集 · {e.cues.length} 条提示 · {e.direction}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={acceptAi} className="rounded-md bg-emerald-400 px-3 py-1 text-sm font-medium text-black hover:bg-emerald-300">
                采用 AI 声音设计
              </button>
              <button type="button" onClick={() => setAi(null)} className="rounded-md border border-white/15 px-3 py-1 text-sm text-neutral-300 hover:bg-white/10">
                放弃
              </button>
            </div>
            <div className="mt-2">
              <UsageNote usage={ai.usage} />
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm text-neutral-300">
            声音母题（主角旋律）
            <textarea rows={3} maxLength={800} value={plan.motif} onChange={(e) => update({ motif: e.target.value })} aria-label="声音母题" className={field} />
          </label>
          <label className="block text-sm text-neutral-300">
            产品声音标志
            <textarea rows={3} maxLength={500} value={plan.productSignature} onChange={(e) => update({ productSignature: e.target.value })} aria-label="产品声音标志" className={field} />
          </label>
          <label className="block text-sm text-neutral-300">
            混音说明
            <textarea rows={3} maxLength={800} value={plan.mixNote} onChange={(e) => update({ mixNote: e.target.value })} aria-label="混音说明" className={field} />
          </label>
        </div>
      </Card>

      <div role="tablist" aria-label="分集" className="flex flex-wrap gap-2">
        {episodes.map((e) => (
          <button
            key={e.number}
            type="button"
            role="tab"
            aria-selected={epNo === e.number}
            onClick={() => {
              setEpNo(e.number);
              setSelectedId("");
            }}
            className={`rounded-lg border px-3 py-2 text-sm ${epNo === e.number ? "border-amber-400 bg-amber-400/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"}`}
          >
            第 {e.number} 集 · {e.title || "未命名"}
            <span className="ml-2 text-xs text-neutral-400">{plan.episodes.find((p) => p.number === e.number)?.cues.length ?? 0} 条</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card title={`第 ${epNo} 集 · 声音设计`}>
          <label className="block text-sm text-neutral-300">
            本集声音方向
            <textarea
              rows={2}
              maxLength={600}
              value={ep.direction}
              onChange={(e) => updateEp((c) => c, e.target.value)}
              aria-label="本集声音方向"
              className={field}
            />
          </label>
          <div className="mt-4">{info ? <Timeline info={info} cues={ep.cues} selectedId={selectedId} onSelect={setSelectedId} /> : null}</div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={smallBtn}
              onClick={() => {
                const c = blankCue(selected ? selected.endSec : 0);
                updateEp((cues) => [...cues, c]);
                setSelectedId(c.id);
              }}
            >
              + 添加声音提示
            </button>
            {selected ? (
              <button
                type="button"
                className={smallBtn}
                onClick={() => {
                  updateEp((cues) => cues.filter((c) => c.id !== selectedId));
                  setSelectedId("");
                }}
              >
                删除所选提示
              </button>
            ) : null}
          </div>
          {selected ? (
            <div className="mt-4 grid gap-3 rounded-lg border border-white/10 p-3 sm:grid-cols-3">
              <label className="text-sm text-neutral-300">
                开始（秒）
                <input type="number" min={0} max={45} step={0.5} value={selected.startSec} onChange={(e) => updateCue({ startSec: Number(e.target.value) })} aria-label="开始秒" className={field} />
              </label>
              <label className="text-sm text-neutral-300">
                结束（秒）
                <input type="number" min={0} max={45} step={0.5} value={selected.endSec} onChange={(e) => updateCue({ endSec: Number(e.target.value) })} aria-label="结束秒" className={field} />
              </label>
              <label className="text-sm text-neutral-300">
                层
                <select value={selected.layer} onChange={(e) => updateCue({ layer: e.target.value as SoundLayer })} aria-label="声音层" className={field}>
                  {SOUND_LAYERS.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-300 sm:col-span-3">
                描述（情绪、乐器、速度、强度、对齐的动作）
                <textarea rows={3} maxLength={500} value={selected.description} onChange={(e) => updateCue({ description: e.target.value })} aria-label="声音描述" className={field} />
              </label>
            </div>
          ) : (
            <p className="mt-3 text-xs text-neutral-500">点时间线上的色块编辑提示。</p>
          )}
          <ul className="mt-4 space-y-1 text-xs text-neutral-400">
            {ep.cues.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelectedId(c.id)} className="text-left hover:text-white">
                  <Tag>{layerLabel(c.layer)}</Tag> {c.startSec}–{c.endSec}s · {c.description}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card title="本地规则检查（非 AI）">
            <div role="status" className="text-sm">
              {warnings.length === 0 ? (
                <p className="text-emerald-300">本集未发现问题</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-amber-200">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card title={`第 ${epNo} 集 · 分轨`}>
            <p className="mb-2 text-xs text-neutral-500">每层 1 条，从 0 秒对齐整集（WAV / MP3 / M4A / AIFF / FLAC，最大 200 MB）。视频页合成时自动混音：对白出现时压低音乐，响度统一到 -14 LUFS。</p>
            {stemError ? <p className="mb-2 text-xs text-rose-300">{stemError}</p> : null}
            <ul className="space-y-2">
              {STEM_LAYERS.map((l) => (
                <StemRow
                  key={`${epNo}-${l.key}`}
                  projectId={projectId}
                  episode={epNo}
                  layer={l}
                  stem={stemFor(l.key)}
                  onChange={(next, error) => {
                    setStemError(error ?? "");
                    setStems((prev) => [...prev.filter((s) => !(s.episode === epNo && s.layer === l.key)), ...(next ? [next] : [])]);
                  }}
                />
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <SaveBar dirty={dirty} pending={pending} status={status} onSave={() => persist(plan)} />
    </div>
  );
}
