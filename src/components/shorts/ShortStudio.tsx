"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { fmtWait } from "@/components/shorts/JobPill";
import { OperatorPicker } from "@/components/shorts/OperatorPicker";
import {
  addHookAction,
  aiConceptsAction,
  aiShotsAction,
  issueScopeAction,
  issueStatusAction,
  quoteJobAction,
  renderShortAction,
  rewriteShotAction,
  studioStateAction,
  clearRunErrorAction,
  resumeJobAction,
  retargetTextAction,
  runJobAction,
  saveShortVideoAction,
  setBudgetAction,
  saveTemplateAction,
  setVideoThemeAction,
  setVideoFamilyAction,
  setVideoFilmerAction,
  shotStageAction,
  type StageAction,
  type StudioState,
} from "@/app/short-actions";
import {
  budgetOf,
  BUDGET_WARN_RATIO,
  defaultBudget,
  DEFAULT_ATTEMPTS,
  finalSeconds,
  hookBudget,
  isExtraHook,
  jobCost,
  MAX_USD_PER_SECOND,
  STAGE_LABELS,
  VIDEO_MIN_SEC,
  VIDEO_USD_PER_SEC,
  type GenJob,
  type JobKind,
  type Quote,
  type ShortShot,
  type VideoResolution,
  videoTheme,
  waitingFor,
} from "@/lib/shorts";
import { THEMES } from "@/lib/shorts-scenes";
import { TEXT_FIELDS, TEXT_LABELS, type TextField } from "@/lib/shorts-sync";
import { DraftFeedback } from "@/components/shorts/DraftFeedback";
import type { Conflict } from "@/lib/shorts";
import { PromptPreview } from "@/components/shorts/PromptPreview";
import { ColorKits } from "@/components/workbench/ProductKit";
import type { KitData } from "@/lib/product-kit";

const input =
  "w-full rounded-md border border-white/10 bg-neutral-950 px-2 py-1.5 text-sm text-white outline-none focus:border-amber-400/60";
const btn =
  "rounded-md border border-white/15 px-2.5 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40";
const num =
  "w-16 rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white outline-none focus:border-amber-400/60";
const primary =
  "rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40";
const usd = (n: number) => `$${n.toFixed(2)}`;

interface Pending {
  shotId: string;
  kind: JobKind;
  seconds: number;
  reason: string;
  overLimit: boolean;
  quote: Quote | null;
}

export function ShortStudio({
  initial,
  templates,
  hfReady,
  productPhotos,
  finalAt: initialFinalAt,
  initialShot = null,
  kit,
  hasBase = false,
  families = [],
  cast = [],
}: {
  initial: StudioState;
  templates: { id: string; label: string; look: string }[];
  hfReady: boolean;
  productPhotos: number;
  finalAt: string | null;
  initialShot?: string | null;
  kit?: KitData;
  hasBase?: boolean;
  families?: { id: string; name: string }[];
  /** 家庭位 1 的成员：选谁拿手机 */
  cast?: { id: string; name: string }[];
}) {
  const [st, setSt] = useState(initial);
  const [shots, setShots] = useState<ShortShot[]>(initial.video.shots);
  const [dirty, setDirty] = useState(false);
  const [brief, setBrief] = useState(initial.video.brief);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [busy, start] = useTransition();
  const [pending, setPending] = useState<Pending | null>(null);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [finalAt, setFinalAt] = useState(initialFinalAt);
  const [rw, setRw] = useState<{ shotId: string; text: string } | null>(null);
  const [proposal, setProposal] = useState<{
    shotId: string;
    fields: Record<TextField, string>;
    notes: string[];
    left: string[];
    needs3d: string[];
  } | null>(null);
  const v = st.video;
  const [focus, setFocusState] = useState<string | null>(initialShot);
  const setFocus = (id: string | null) => {
    setFocusState(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("shot", id);
    else u.searchParams.delete("shot");
    window.history.replaceState(window.history.state, "", u.toString());
    window.scrollTo({ top: 0 });
  };

  const apply = (r: { error?: string; result?: StudioState }, ok?: string) => {
    if (r.result) {
      setSt(r.result);
      setShots(r.result.video.shots);
      setDirty(false);
    }
    setMsg(
      r.error
        ? { tone: "err", text: r.error }
        : ok
          ? { tone: "ok", text: ok }
          : null,
    );
  };
  const act = (
    fn: () => Promise<{ error?: string; result?: StudioState }>,
    ok?: string,
  ) => start(async () => apply(await fn(), ok));
  const vt = videoTheme(v);
  const themeLabel = `${THEMES.find((t) => t.id === vt.theme)?.label ?? "无节日"}${vt.theme === "custom" && vt.themeText ? `（${vt.themeText}）` : ""}`;
  const changeTheme = (theme: string) => {
    const text = theme === "custom" ? window.prompt("自定义节日是什么？例如：中秋节，挂灯笼、桌上有月饼", vt.themeText ?? "") : "";
    if (text === null) return;
    start(async () => {
      let r = await setVideoThemeAction(v.id, theme, text);
      if (r.result?.confirm) {
        if (!window.confirm(r.result.confirm)) return;
        r = await setVideoThemeAction(v.id, theme, text, true);
      }
      apply({ error: r.error, result: r.result?.state }, "已换节日");
    });
  };

  const famName = (k: string) => families.find((f) => f.id === v.families?.[k])?.name ?? "不指定";
  const famSlots = [...new Set(["1", ...shots.map((s) => String(s.family ?? 1))])].sort();
  const changeFamily = (slot: string, id: string) =>
    start(async () => {
      let r = await setVideoFamilyAction(v.id, Number(slot), id || null);
      if (r.result?.confirm) {
        if (!window.confirm(r.result.confirm)) return;
        r = await setVideoFamilyAction(v.id, Number(slot), id || null, true);
      }
      apply({ error: r.error, result: r.result?.state }, "已换家庭");
    });
  const changeFilmer = (id: string) =>
    start(async () => {
      let r = await setVideoFilmerAction(v.id, id || null);
      if (r.result?.confirm) {
        if (!window.confirm(r.result.confirm)) return;
        r = await setVideoFilmerAction(v.id, id || null, true);
      }
      apply({ error: r.error, result: r.result?.state }, "已换拿手机的人");
    });

  const live = useMemo(() => ({ ...v, shots }), [v, shots]);
  const secs = finalSeconds(live);
  const budget = budgetOf(live);
  const spent = st.jobs
    .filter((j) => !j.isTest)
    .reduce((s, j) => s + jobCost(j), 0);
  const ratio = budget > 0 ? spent / budget : 0;
  const perSec = secs ? spent / secs : 0;
  const plannedGen = shots.reduce((s, x) => s + x.genSeconds, 0);
  const firstBody = shots.findIndex((x) => !x.hook);
  const hookList = v.shots.filter((x) => x.hook);
  const exp = v.exportHooks?.length ? v.exportHooks : hookList[0] ? [hookList[0].id] : [];
  const plan =
    shots.length * 0.1 + plannedGen * VIDEO_USD_PER_SEC[v.resolution];
  const jobsOf = (shotId: string) => st.jobs.filter((j) => j.shotId === shotId);
  const inflight = st.jobs.filter(
    (j) => j.status === "submitting" || j.status === "submitted",
  );
  const running = st.running ?? {};
  const activeJobs = new Set(
    Object.values(running)
      .filter((r) => !r.error)
      .map((r) => r.jobId),
  );
  const stuck = inflight.filter((j) => !activeJobs.has(j.id));
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState<{ shotId: string; kind: JobKind } | null>(
    null,
  );
  const dirtyRef = useRef(dirty);
  const stRef = useRef(st);
  useEffect(() => {
    dirtyRef.current = dirty;
    stRef.current = st;
  });
  // 后台结果回来：只更新状态类字段，别冲掉其他镜头还没保存的文字
  const merge = (next: StudioState | null) => {
    if (!next) return;
    for (const [id, r] of Object.entries(stRef.current.running ?? {})) {
      if (r.error || next.running[id]) continue;
      if (next.jobs.find((j) => j.id === r.jobId)?.status === "completed")
        setDone({ shotId: id, kind: r.kind });
    }
    setSt(next);
    setShots((cur) =>
      dirtyRef.current
        ? cur.map((s) => {
            const n = next.video.shots.find((x) => x.id === s.id);
            return n
              ? {
                  ...s,
                  stage: n.stage,
                  frameJobId: n.frameJobId,
                  videoJobId: n.videoJobId,
                  issues: n.issues,
                }
              : s;
          })
        : next.video.shots,
    );
  };
  const pollOn = Object.values(running).some((r) => !r.error);
  useEffect(() => {
    if (!pollOn) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(
      () => void studioStateAction(v.id).then(merge),
      3000,
    );
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [pollOn, v.id]);
  const goShot = (id: string) => setFocus(id);

  const rewrite = (shotId: string, feedback = "", draft?: Record<TextField, string>) =>
    start(async () => {
      setMsg(null);
      setRw({ shotId, text: "改写中…（几秒到半分钟）" });
      const r = await rewriteShotAction(v.id, shotId, { feedback, draft });
      if (r.error) return setRw({ shotId, text: `⚠ ${r.error}` });
      setRw(null);
      if (r.result) {
        setProposal({ shotId, ...r.result });
        setTimeout(() => document.getElementById(`proposal-${shotId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    });

  // 审批框里的冲突：没退回构图的先退回（免费），再带去要改的地方，或者交给 AI 按 3D 改文字
  const fixConflict = (shotId: string, c: Conflict, ai: boolean) => {
    setPending(null);
    start(async () => {
      if (shots.find((x) => x.id === shotId)?.stage !== "draft") {
        const r = await shotStageAction(v.id, shotId, "reopen_comp");
        apply(r);
        if (r.error) return;
      }
      if (ai) return rewrite(shotId, `生成前自查发现：${c.msg}。按 3D 改文字，删掉和 3D 冲突的写法。`);
      if (c.fix === "3d") {
        window.location.href = `/projects/${v.projectId}/shorts/${v.id}/stage?shot=${shotId}${c.fig ? `&fig=${c.fig}` : ""}`;
        return;
      }
      setTimeout(() => {
        const el = document.getElementById(`fp-${shotId}`);
        el?.closest("details")?.setAttribute("open", "");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
      }, 150);
    });
  };

  const edit = (i: number, patch: Partial<ShortShot>) => {
    setShots((xs) => xs.map((s, k) => (k === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  // 审批框：参数变化时重新估价（免费）
  useEffect(() => {
    if (!pending) return;
    let stale = false;
    const t = setTimeout(async () => {
      const r = await quoteJobAction(
        v.id,
        pending.shotId,
        pending.kind,
        pending.seconds,
        pending.reason,
        pending.overLimit,
      );
      if (stale) return;
      if (r.error) setMsg({ tone: "err", text: r.error });
      setPending((p) => (p ? { ...p, quote: r.result ?? null } : p));
    }, 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pending?.shotId,
    pending?.kind,
    pending?.seconds,
    pending?.reason,
    pending?.overLimit,
    v.id,
  ]);

  return (
    <div className="mt-3 space-y-5 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div className="space-y-2">
          <input
            defaultValue={v.title}
            onBlur={(e) =>
              e.target.value !== v.title &&
              act(() => saveShortVideoAction(v.id, { title: e.target.value }))
            }
            className="bg-transparent text-2xl font-semibold text-white outline-none"
          />
          <details className="text-xs text-neutral-400">
            <summary className="cursor-pointer select-none">
              视频设定 · 节日：{themeLabel} · 家庭：{famSlots.map(famName).join(" / ")} · {templates.find((t) => t.id === v.templateId)?.label ?? v.templateId} · {v.resolution} · 颜色：
              {kit?.colors.find((c) => c.id === v.colorId)?.name ?? "原色"}
            </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {famSlots.map((k) => (
              <label key={k} className="flex items-center gap-1">
                家庭{famSlots.length > 1 ? ` ${k}` : ""}：
                <select disabled={busy} value={v.families?.[k] ?? ""} onChange={(e) => changeFamily(k, e.target.value)} className="rounded border border-white/10 bg-neutral-950 px-1 py-0.5 text-white">
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                  <option value="">不指定</option>
                </select>
              </label>
            ))}
            {cast.length ? (
              <label className="flex items-center gap-1">
                拿手机的人：
                <select disabled={busy} value={v.filmer ?? ""} onChange={(e) => changeFilmer(e.target.value)} className="rounded border border-white/10 bg-neutral-950 px-1 py-0.5 text-white">
                  <option value="">不指定</option>
                  {cast.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <a href="/families" className="text-amber-300 hover:underline">
              去家庭库改成员 →
            </a>
          </div>
          {v.fromTemplate ? (
            <div className="mt-2 space-y-1 text-amber-200/80">
              <p>
                从模板「{v.fromTemplate.name}」v{v.fromTemplate.v} 套用{v.fromTemplate.fromProduct ? `（原来是 ${v.fromTemplate.fromProduct} 做的）` : ""}：每镜要重新打开 3D 看一眼、点保存。
                {v.fromTemplate.rewritten ? "文字已经按这个产品改写过。" : "产品相关的文字还是原产品的。"}
              </p>
              {!v.fromTemplate.rewritten ? (
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("用 DeepSeek 按这个产品的资料，改写所有镜头的画面、机位、产品备注、提示词和字幕。\n\n调用文字模型 1 次，大约 $0.01，不出图。\n\n确定吗？")) return;
                    start(async () => {
                      setMsg({ tone: "ok", text: "改写中…（半分钟左右）" });
                      const r = await retargetTextAction(v.id);
                      apply({ error: r.error, result: r.result?.state }, r.result ? `已按这个产品改写：${r.result.notes.slice(0, 8).join("；") || "没有要改的地方"}` : undefined);
                    });
                  }}
                >
                  按这个产品改写全部镜头文字（DeepSeek，约 $0.01）
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btn}
              disabled={busy || !v.shots.some((s) => !s.hook)}
              title="存正文和第一个开头的文字、机位、场地和节日；不存首帧、视频和花费"
              onClick={() => {
                const name = window.prompt("模板名字", v.title);
                if (!name?.trim()) return;
                start(async () => {
                  const r = await saveTemplateAction(v.id, name);
                  apply({ error: r.error }, `已存为模板「${name.trim()}」，新建视频时可以选`);
                });
              }}
            >
              存为模板
            </button>
            <select
              value={vt.theme}
              disabled={busy}
              onChange={(e) => changeTheme(e.target.value)}
              className={`${input} w-auto py-1 text-xs`}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  节日：{t.label}
                </option>
              ))}
            </select>
            <select
              value={v.templateId}
              disabled={busy || st.jobs.length > 0}
              onChange={(e) =>
                act(() =>
                  saveShortVideoAction(v.id, { templateId: e.target.value }),
                )
              }
              className={`${input} w-auto py-1 text-xs`}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}（{t.look === "cinematic" ? "电影感" : "UGC"}）
                </option>
              ))}
            </select>
            <select
              value={v.resolution}
              disabled={busy}
              onChange={(e) =>
                (!st.jobs.length ||
                  window.confirm(
                    "已经生成过的镜头保持原来的分辨率，之后生成的用新的分辨率，前后画质会不一样。确定要换吗？",
                  )) &&
                act(() =>
                  saveShortVideoAction(v.id, {
                    resolution: e.target.value as VideoResolution,
                  }),
                )
              }
              className={`${input} w-auto py-1 text-xs`}
            >
              {(Object.keys(VIDEO_USD_PER_SEC) as VideoResolution[]).map(
                (r) => (
                  <option key={r} value={r}>
                    {r} · ${VIDEO_USD_PER_SEC[r]}/秒
                  </option>
                ),
              )}
            </select>
            <span>
              9:16 竖版 · 不用 1080p（$0.65/秒，超出每秒上限）·
              不混入手机实拍素材
            </span>
          </div>
          {kit ? (
            <div className="mt-3 max-w-3xl rounded-lg border border-white/10 p-3">
              <p className="mb-2 text-xs text-neutral-300">产品颜色：这条视频拍哪个颜色。新颜色在这里建、传实物照，贴好色后其他视频也能直接选。</p>
              <ColorKits
                kit={kit}
                hasBase={hasBase}
                selected={v.colorId ?? null}
                onSelect={(id) => act(() => saveShortVideoAction(v.id, { colorId: id }), "已换颜色款")}
                locked={v.shots.some((s) => s.stage !== "draft" || s.frameJobId) ? "已经有镜头确认或出过首帧，不能换颜色款：要拍新颜色请新建一条视频。" : undefined}
              />
            </div>
          ) : null}
          </details>
        </div>
        <div className="min-w-72 rounded-lg border border-white/10 p-3 text-xs">
          <div className="flex justify-between text-neutral-300">
            <span>
              成片 {secs} 秒 · 预算 {usd(budget)}
              {v.budgetUsd === null
                ? `（= ${secs} 秒 × $${MAX_USD_PER_SECOND}）`
                : "（已手动调整）"}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-white/10">
            <div
              className={`h-full ${ratio >= 1 ? "bg-rose-500" : ratio >= BUDGET_WARN_RATIO ? "bg-amber-400" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-neutral-300">
              已花 {usd(spent)} · 剩 {usd(Math.max(0, budget - spent))}
            </span>
            <span
              className={
                perSec > MAX_USD_PER_SECOND
                  ? "text-rose-300"
                  : "text-emerald-300"
              }
            >
              当前 {usd(perSec)}/秒
            </span>
          </div>
          <details className="mt-1">
            <summary className="cursor-pointer select-none text-neutral-500">调整预算</summary>
          <p className="mt-1 text-neutral-500">
            按分镜一次通过预计 {usd(plan)}（{secs ? usd(plan / secs) : "—"}/秒）
          </p>
          {ratio >= 1 ? (
            <p className="mt-1 text-rose-300">预算已用完，付费生成已锁住。</p>
          ) : ratio >= BUDGET_WARN_RATIO ? (
            <p className="mt-1 text-amber-300">
              已用掉 {Math.round(ratio * 100)}% 预算。
            </p>
          ) : null}
          <div className="mt-2 flex gap-1">
            <input
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              placeholder="新预算 $"
              className={`${input} py-1 text-xs`}
            />
            <button
              className={btn}
              disabled={busy || !budgetDraft}
              onClick={() =>
                act(
                  () => setBudgetAction(v.id, Number(budgetDraft)),
                  "预算已更新",
                )
              }
            >
              调整预算
            </button>
            {v.budgetUsd !== null ? (
              <button
                className={btn}
                disabled={busy}
                onClick={() => act(() => setBudgetAction(v.id, null))}
              >
                恢复默认 {usd(defaultBudget(live))}
              </button>
            ) : null}
          </div>
          </details>
        </div>
      </header>

      {msg ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${msg.tone === "err" ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/15 text-emerald-200"}`}
        >
          {msg.text}
        </p>
      ) : null}
      {!hfReady ? (
        <p className="rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          尚未配置 Higgsfield Key：免费步骤可用，付费生成不可用。
        </p>
      ) : null}
      {productPhotos === 0 ? (
        <p className="rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          产品还没有参考图：先上传产品照，或在短视频列表页用 3D
          模型渲染参考图（免费）。没有参考图不能生成首帧。
        </p>
      ) : null}
      {stuck.length ? (
        <div className="rounded-md bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          有 {stuck.length} 个任务连接中断。只能继续等待，不会重复扣费。
          {stuck.map((j) => (
            <button
              key={j.id}
              className={`${btn} ml-2`}
              disabled={busy}
              onClick={() => act(() => resumeJobAction(j.id), "已在后台接着等，结果出来会自动显示")}
            >
              继续等待{" "}
              {j.kind === "video"
                ? "视频"
                : j.kind === "scene"
                  ? "场地参考图"
                  : "首帧"}
            </button>
          ))}
        </div>
      ) : null}

      {focus ? null : (
      <details
        open={!(v.conceptId && shots.length)}
        className="rounded-xl border border-white/10 bg-neutral-900/70 p-4"
      >
        <summary className="mb-2 cursor-pointer select-none text-sm font-semibold text-amber-300/90">
          创意
          {v.conceptId ? (
            <span className="ml-2 font-normal text-neutral-300">
              已选：{v.concepts.find((c) => c.id === v.conceptId)?.title ?? ""}
            </span>
          ) : null}
        </summary>
        <div className="flex gap-2">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
            placeholder="可选：这条想要的节日、受众、卖点…"
            className={input}
          />
          <button
            className={primary}
            disabled={
              busy ||
              (shots.length > 0 && st.jobs.some((j) => j.status !== "failed"))
            }
            onClick={() =>
              act(async () => {
                const s = await saveShortVideoAction(v.id, { brief });
                return s.error ? s : aiConceptsAction(v.id);
              }, "已生成创意")
            }
          >
            {busy ? "…" : v.concepts.length ? "重新出创意" : "AI 出 4 个创意"}
          </button>
        </div>
        {v.concepts.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {v.concepts.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                onClick={() =>
                  act(() => saveShortVideoAction(v.id, { conceptId: c.id }))
                }
                className={`rounded-lg border p-3 text-left text-sm ${v.conceptId === c.id ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"}`}
              >
                <p className="font-medium text-white">{c.title}</p>
                <p className="mt-1 text-amber-200">{c.hookCaption}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {c.audience} · {c.setting}
                </p>
                <p className="mt-1 text-xs text-neutral-500">{c.people}</p>
                <p className="mt-1 text-xs text-neutral-400">{c.why}</p>
                <p className="mt-1 text-xs text-sky-300">CTA：{c.ctaCaption}</p>
              </button>
            ))}
          </div>
        ) : null}
      </details>
      )}

      <section className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-amber-300/90">
            {focus ? (
              <button className="text-neutral-300 hover:text-amber-200" onClick={() => setFocus(null)}>
                ← 全部镜头
              </button>
            ) : (
              "镜头"
            )}
          </h2>
          <div className="flex gap-2">
            <button
              className={btn}
              disabled={
                busy ||
                !v.conceptId ||
                st.jobs.some((j) => j.status !== "failed")
              }
              onClick={() => act(() => aiShotsAction(v.id), "已生成分镜")}
            >
              {shots.length ? "按选中创意重出分镜" : "按选中创意出分镜"}
            </button>
            <button
              className={btn}
              disabled={busy}
              onClick={() => {
                setShots((xs) => [
                  ...xs,
                  {
                    id: Math.random().toString(36).slice(2, 10),
                    beat: "",
                    useSeconds: 3,
                    trimStart: 0,
                    genSeconds: VIDEO_MIN_SEC,
                    description: "",
                    camera: "",
                    caption: "",
                    productNote: "",
                    compositeNote: "",
                    framePrompt: "",
                    motionPrompt: "",
                    stage: "draft",
                    layout: null,
                    compFile: null,
                    frameJobId: null,
                    videoJobId: null,
                    checkNote: "",
                  },
                ]);
                setDirty(true);
              }}
            >
              + 镜头
            </button>
            <button
              className={primary}
              disabled={busy || !dirty}
              onClick={() =>
                act(() => saveShortVideoAction(v.id, { shots }), "分镜已保存")
              }
            >
              保存分镜
            </button>
          </div>
        </div>
        {dirty ? (
          <p className="mb-2 text-xs text-amber-300">
            有未保存的修改：保存后才能进行关口操作和生成。
          </p>
        ) : null}
        <p className={`mb-3 text-xs text-neutral-500 ${focus ? "hidden" : ""}`}>
          每镜生成最少 {VIDEO_MIN_SEC} 秒：2–3
          秒的节拍尽量和相邻同机位动作合成一镜，再剪开用。计划生成 {plannedGen}{" "}
          秒，成片用 {secs} 秒
          {plannedGen
            ? `（利用率 ${Math.round((secs / plannedGen) * 100)}%）`
            : ""}
          。
        </p>
        <ol className={focus ? "space-y-4" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"}>
          {shots.map((s, i) => {
            if (focus && s.id !== focus) return null;
            const js = jobsOf(s.id);
            const frames = js.filter((j) => j.kind === "frame");
            const vids = js.filter((j) => j.kind === "video");
            const charged = (k: JobKind) =>
              js.filter((j) => j.kind === k && j.status !== "failed").length;
            const saved = v.shots.find((x) => x.id === s.id);
            const prevIssues = v.shots
              .slice(0, i)
              .flatMap((x) => x.issues ?? [])
              .filter((t) => t.scope === "video")
              .map((t) => t.text);
            const wait = waitingFor(v, s.id);
            const runBusy = !!running[s.id] && !running[s.id].error;
            const mainAct =
              s.stage === "draft"
                ? "confirm_comp"
                : s.stage === "comp_ok"
                  ? "frame"
                  : s.stage === "frame_ready"
                    ? "frame_ok"
                    : s.stage === "frame_ok"
                      ? "video"
                      : s.stage === "video_ready"
                        ? "accept"
                        : null;
            const gate = (a: StageAction, label: string, enabled: boolean) => !enabled ? null : (
              <button
                className={a === mainAct ? primary : btn}
                disabled={
                  busy || dirty || !saved || !enabled || wait > 0 || runBusy
                }
                onClick={() => {
                  const sy = st.sync?.[s.id];
                  const list = sy ? [...sy.changes, ...sy.issues] : [];
                  if (
                    a === "confirm_comp" &&
                    list.length &&
                    !window.confirm(
                      `这一镜的文字和 3D 还有 ${list.length} 处对不上：\n· ${list.join("\n· ")}\n\n仍然确认构图？`,
                    )
                  )
                    return;
                  act(() => shotStageAction(v.id, s.id, a));
                }}
              >
                {label}
              </button>
            );
            const open = (kind: JobKind) =>
              setPending({
                shotId: s.id,
                kind,
                seconds: kind === "video" ? s.genSeconds : 0,
                reason: "",
                overLimit: false,
                quote: null,
              });
            const shotSpent = js.reduce((a, j) => a + jobCost(j), 0);
            const locked = s.stage !== "draft";
            // 灰按钮旁写清楚还差哪一步
            const next = runBusy
              ? "正在生成，等它完成"
              : wait > 0
                ? `文字、场地、机位可以先做；确认构图和生成要等 #${wait} 采用`
                : dirty
                  ? "有没保存的修改：先点「保存分镜」，下面的按钮才能点"
                  : s.stage === "draft"
                    ? saved?.compFile
                      ? "下一步：① 确认构图（免费）"
                      : "下一步：先在场地地图摆好机位，点「保存机位 + 3D 构图」"
                    : s.stage === "comp_ok"
                      ? hfReady ? "下一步：② 生成首帧（先弹审批框）" : "生成要先在「模型设置」填 Higgsfield Key"
                      : s.stage === "frame_ready"
                        ? "下一步：检查首帧，点 ③ 首帧通过 或 首帧不行"
                        : s.stage === "frame_ok"
                          ? "下一步：④ 生成视频（先弹审批框）"
                          : s.stage === "video_ready"
                            ? "下一步：检查视频，点 ⑤ 采用 或 退回返工"
                            : "已采用";
            const stepNo =
              s.stage === "accepted"
                ? 5
                : s.stage === "frame_ok" || s.stage === "video_ready"
                  ? 4
                  : s.stage === "comp_ok" || s.stage === "frame_ready"
                    ? 3
                    : s.description.trim()
                      ? 2
                      : 1;
            const thumb = saved?.frameJobId && st.jobs.find((j) => j.id === saved.frameJobId)?.hasOutput
              ? `/api/shorts/${saved.frameJobId}`
              : saved?.compFile
                ? `/api/shorts/${v.id}?comp=${s.id}&t=${encodeURIComponent(saved.compFile)}`
                : null;
            if (!focus)
              return [
                i === 0 ? (
                  <li key="h-hook" className="col-span-full flex flex-wrap items-center justify-between gap-2 pt-1 text-xs font-medium text-neutral-400">
                    <span>开头 · 多个开头共用下面的正文，导出时勾选要哪几个</span>
                    <button
                      className={btn}
                      disabled={busy || dirty}
                      title={dirty ? "先保存分镜" : ""}
                      onClick={() => act(() => addHookAction(v.id), "已新建开头：先改文字，再去 3D 保存构图")}
                    >
                      ＋ 新建开头
                    </button>
                  </li>
                ) : null,
                !s.hook && i === firstBody ? (
                  <li key="h-body" className="col-span-full pt-3 text-xs font-medium text-neutral-400">
                    正文 · 按顺序一镜一镜做
                  </li>
                ) : null,
                <li key={s.id} id={`shot-${s.id}`}>
                  <button
                    onClick={() => setFocus(s.id)}
                    className={`block w-full rounded-lg border p-2 text-left hover:border-amber-400/60 ${runBusy ? "border-sky-400/60" : s.stage === "accepted" ? "border-emerald-400/30" : "border-white/10"}`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="aspect-[9/16] w-full rounded bg-black object-cover" />
                    ) : (
                      <div className="flex aspect-[9/16] w-full items-center justify-center rounded bg-white/5 text-xs text-neutral-600">
                        还没有画面
                      </div>
                    )}
                    <p className="mt-2 truncate text-sm text-white">
                      {s.hook ? `开头 · ${s.hook.name}` : `#${i + 1} ${s.beat || "（未命名）"}`}
                    </p>
                    <p className="text-xs text-neutral-500">{s.useSeconds} 秒 · {usd(shotSpent)}</p>
                    <p
                      className={`mt-1 text-xs ${s.stage === "accepted" ? "text-emerald-300" : runBusy ? "text-sky-300" : wait > 0 ? "text-neutral-500" : "text-amber-300"}`}
                    >
                      {runBusy ? "生成中…" : s.stage === "accepted" ? "已采用" : wait > 0 ? `等 #${wait} 采用` : STAGE_LABELS[s.stage]}
                    </p>
                  </button>
                  {s.hook ? (
                    <label className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                      <input
                        type="checkbox"
                        checked={exp.includes(s.id)}
                        disabled={busy || dirty}
                        onChange={(e) =>
                          act(() =>
                            saveShortVideoAction(v.id, {
                              exportHooks: e.target.checked ? [...exp, s.id] : exp.filter((x) => x !== s.id),
                            }),
                          )
                        }
                      />
                      导出
                    </label>
                  ) : null}
                </li>,
              ];
            const prevId = shots[i - 1]?.id;
            const nextId = shots[i + 1]?.id;
            return (
              <li
                key={s.id}
                id={`shot-${s.id}`}
                className="scroll-mt-4 rounded-lg border border-white/10 p-3"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <ol className="flex flex-wrap gap-1 text-xs">
                    {["写内容", "3D 摆位 + 机位", "首帧", "视频 → 采用"].map((label, k) => (
                      <li
                        key={label}
                        className={`rounded-full px-3 py-1 ${k + 1 < stepNo ? "bg-emerald-500/15 text-emerald-200" : k + 1 === stepNo ? "bg-amber-400 text-black" : "bg-white/5 text-neutral-500"}`}
                      >
                        {k + 1 < stepNo ? "✓ " : `${k + 1} `}
                        {label}
                      </li>
                    ))}
                  </ol>
                  <div className="flex gap-1">
                    <button className={btn} disabled={!prevId} onClick={() => prevId && setFocus(prevId)}>
                      ‹ 上一镜
                    </button>
                    <button className={btn} disabled={!nextId} onClick={() => nextId && setFocus(nextId)}>
                      下一镜 ›
                    </button>
                  </div>
                </div>
                {s.hook ? (
                  <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-neutral-300">
                    <label>
                      开头名称
                      <input
                        value={s.hook.name}
                        onChange={(e) => edit(i, { hook: { ...s.hook!, name: e.target.value } })}
                        className={`${input} w-48`}
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      剪一刀：第
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={s.useSeconds}
                        value={s.hook.cut ?? ""}
                        placeholder="不剪"
                        onChange={(e) =>
                          edit(i, { hook: { ...s.hook!, cut: e.target.value === "" ? undefined : Number(e.target.value) } })
                        }
                        className={num}
                      />
                      秒切成 2 个镜头
                    </label>
                    {s.hook.cut ? (
                      <label className="flex items-center gap-1">
                        后半段放大
                        <select
                          value={s.hook.zoomB ?? 1}
                          onChange={(e) => edit(i, { hook: { ...s.hook!, zoomB: Number(e.target.value) } })}
                          className={`${input} w-auto py-1`}
                        >
                          {[1, 1.2, 1.35, 1.5].map((z) => (
                            <option key={z} value={z}>
                              {z === 1 ? "不放大" : `${z} 倍（像特写）`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <p className="basis-full text-neutral-500">
                      只生成一段 {s.genSeconds} 秒视频、只付一次钱，导出时按剪辑点剪成 2 个镜头（同一个机位）。改剪辑点不花钱。
                      {isExtraHook(v, s)
                        ? ` 这个开头单独预算 ${usd(hookBudget(s))}，不占正文预算。`
                        : " 第一个开头算在本条视频预算里。"}
                    </p>
                  </div>
                ) : null}
                <p className="mb-2 rounded bg-sky-500/10 px-2 py-1 text-xs text-sky-200">{next}</p>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-white">#{i + 1}</span>
                    <input
                      value={s.beat}
                      onChange={(e) => edit(i, { beat: e.target.value })}
                      placeholder="节拍"
                      className={`${input} w-32 py-1`}
                    />
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${s.stage === "accepted" ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-neutral-300"}`}
                    >
                      {STAGE_LABELS[s.stage]}
                    </span>
                    <span className="text-xs text-neutral-400">
                      本镜已花 {usd(shotSpent)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    用
                    <input
                      type="number"
                      step={0.5}
                      min={1}
                      value={s.useSeconds}
                      onChange={(e) =>
                        edit(i, { useSeconds: Number(e.target.value) })
                      }
                      className={num}
                    />
                    秒 · 从第
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      value={s.trimStart}
                      onChange={(e) =>
                        edit(i, { trimStart: Number(e.target.value) })
                      }
                      className={num}
                    />
                    秒起 · 生成
                    <input
                      type="number"
                      min={VIDEO_MIN_SEC}
                      max={12}
                      value={s.genSeconds}
                      onChange={(e) =>
                        edit(i, { genSeconds: Number(e.target.value) })
                      }
                      className={num}
                    />
                    秒
                    <button
                      className={btn}
                      disabled={busy || js.length > 0}
                      title={js.length ? "已经有生成记录的镜头不能删" : ""}
                      onClick={() => {
                        setShots((xs) => xs.filter((_, k) => k !== i));
                        setDirty(true);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-neutral-400">
                    画面
                    <textarea
                      value={s.description}
                      onChange={(e) => edit(i, { description: e.target.value })}
                      rows={2}
                      className={input}
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    机位
                    <textarea
                      value={s.camera}
                      onChange={(e) => edit(i, { camera: e.target.value })}
                      rows={2}
                      className={input}
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    字幕（英文，成片不烧，后期加字幕时参考）
                    <input
                      value={s.caption}
                      onChange={(e) => edit(i, { caption: e.target.value })}
                      className={input}
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    产品状态
                    <input
                      value={s.productNote}
                      onChange={(e) => edit(i, { productNote: e.target.value })}
                      className={input}
                    />
                  </label>
                  <div className="text-xs text-neutral-400 md:col-span-2">
                    拍摄者（先选姿态，露什么按机位自动算）
                    {locked ? " · 改了要先“退回构图”" : ""}
                    <div className="mt-1">
                      <OperatorPicker
                        value={s.operator ?? ""}
                        disabled={locked}
                        layout={s.layout}
                        onChange={(v) => edit(i, { operator: v })}
                      />
                    </div>
                  </div>
                </div>
                <details className="mt-2 rounded-md border border-white/10 p-2">
                  <summary className="cursor-pointer select-none text-xs text-neutral-400">
                    高级：英文提示词、后期合成
                  </summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-neutral-400 md:col-span-2">
                    后期合成（屏幕 / 投影 / 灯光图案，AI 不画）
                    <input
                      value={s.compositeNote}
                      onChange={(e) =>
                        edit(i, { compositeNote: e.target.value })
                      }
                      className={input}
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    画面细节（英文，只写服装、表情、光线；人的位置和动作在 3D 人偶的「动作」栏写）{locked ? " · 改了要先“退回构图”" : ""}
                    <textarea
                      id={`fp-${s.id}`}
                      value={s.framePrompt}
                      disabled={locked}
                      onChange={(e) => edit(i, { framePrompt: e.target.value })}
                      rows={4}
                      className={`${input} disabled:opacity-60`}
                    />
                  </label>
                  <label className="text-xs text-neutral-400">
                    运动提示词（视频）
                    <textarea
                      value={s.motionPrompt}
                      onChange={(e) =>
                        edit(i, { motionPrompt: e.target.value })
                      }
                      rows={4}
                      className={input}
                    />
                  </label>
                </div>

                <PromptPreview videoId={v.id} shotId={s.id} dirty={dirty} />
                </details>

                <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-white/10 pt-3">
                  {saved?.compFile ? (
                    <a
                      href={`/api/shorts/${v.id}?comp=${s.id}&t=${encodeURIComponent(saved.compFile)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-24 shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/shorts/${v.id}?comp=${s.id}&t=${encodeURIComponent(saved.compFile)}`}
                        alt="3D 构图"
                        className="aspect-[9/16] w-full rounded border border-white/10 bg-black object-cover"
                      />
                    </a>
                  ) : null}
                  <div className="space-y-1 text-xs text-neutral-400">
                    {wait ? (
                      <p className="text-amber-300">
                        文字、场地、机位现在可以先做；确认构图和生成要等 #{wait}{" "}
                        采用
                      </p>
                    ) : null}
                    <p>
                      3D 构图（免费）：
                      {saved?.compFile
                        ? "已保存"
                        : saved?.layout
                          ? "机位已摆，还没保存构图"
                          : "还没摆机位"}
                      {saved?.layout?.move
                        ? ` · 运镜 ${saved.layout.move.kind}`
                        : ""}
                    </p>
                    <a
                      href={`/projects/${v.projectId}/shorts/${v.id}/set?shot=${s.id}`}
                      className={`${btn} inline-block`}
                    >
                      打开 3D 摆位 + 机位
                    </a>
                    {(() => {
                      const sy = st.sync?.[s.id];
                      if (!sy || (s.stage !== "draft" && s.stage !== "comp_ok"))
                        return null;
                      if (!sy.changes.length && !sy.issues.length)
                        return sy.tracked ? (
                          <p className="text-emerald-300/80">文字和 3D 一致</p>
                        ) : null;
                      return (
                        <div className="mt-1 space-y-1 rounded border border-amber-400/40 bg-amber-400/5 p-2 text-amber-200">
                          {sy.changes.length ? (
                            <>
                              <p className="font-medium">
                                文字写好后 3D 改过，文字可能过期：
                              </p>
                              <ul className="list-disc pl-4">
                                {sy.changes.map((x) => (
                                  <li key={x}>{x}</li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          {sy.issues.length ? (
                            <>
                              <p className="font-medium">文字和 3D 对不上：</p>
                              <ul className="list-disc pl-4">
                                {sy.issues.map((x) => (
                                  <li key={x}>{x}</li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          <button
                            className={btn}
                            disabled={busy || dirty || s.stage !== "draft"}
                            onClick={() => rewrite(s.id)}
                          >
                            {busy && rw?.shotId === s.id ? "改写中…" : "按 3D 改写这一镜（DeepSeek，每次不到 $0.01）"}
                          </button>
                          {rw?.shotId === s.id ? <p className="text-neutral-200">{rw.text}</p> : null}
                          {s.stage !== "draft" ? (
                            <p>构图已确认：要改先点“退回构图”。</p>
                          ) : dirty ? (
                            <p>先保存分镜再改写。</p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {(() => {
                  const r = running[s.id];
                  if (!r) return null;
                  const name = r.kind === "video" ? "视频" : "首帧";
                  if (r.error)
                    return (
                      <div className="mt-3 rounded-lg border border-rose-400/50 bg-rose-500/10 p-3 text-sm text-rose-100">
                        <p className="font-medium">
                          #{i + 1} {name}这次没生成成功
                        </p>
                        <p className="text-xs text-rose-200/80">{r.error}</p>
                        <button
                          className={`${btn} mt-2`}
                          onClick={() =>
                            void clearRunErrorAction(v.id, s.id).then(merge)
                          }
                        >
                          知道了
                        </button>
                      </div>
                    );
                  const lj = st.jobs.find((j) => j.id === r.jobId);
                  const model = r.kind === "video" ? "Seedance" : "Sunburst";
                  const step =
                    r.step === "prep"
                      ? r.kind === "video"
                        ? "第 1 步：上传首帧"
                        : "第 1 步：按机位渲染产品角度图、上传参考图（免费，约 1–2 分钟）"
                      : lj?.status === "submitting"
                        ? `第 2 步：提交给 ${model}`
                        : `第 2 步：${model} 生成中（${r.kind === "video" ? "视频通常 3–8 分钟" : "首帧通常 1–2 分钟"}）`;
                  return (
                    <div className="mt-3 flex items-start gap-3 rounded-lg border border-sky-400/50 bg-sky-500/10 p-3 text-sm text-sky-100">
                      <span className="mt-1 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                      <div>
                        <p className="font-medium">
                          #{i + 1} {name}生成中 · 已等{" "}
                          {fmtWait(
                            Math.max(0, Math.round((now - r.startedAt) / 1000)),
                          )}
                        </p>
                        <p className="text-xs text-sky-200/80">
                          {step}
                          。这期间可以去做别的镜头或页面，好了右下角会提示；不会重复扣费。
                        </p>
                      </div>
                    </div>
                  );
                })()}
                {proposal?.shotId === s.id ? (
                  <div id={`proposal-${s.id}`} className="mt-3 scroll-mt-4 space-y-2 rounded-lg border border-sky-400/40 bg-sky-400/5 p-3 text-xs text-neutral-300">
                    <p className="text-sm font-medium text-sky-200">
                      按 3D 改写的草稿（还没保存）
                    </p>
                    {proposal.notes.length ? (
                      <ul className="list-disc pl-4 text-sky-100">
                        {proposal.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    ) : null}
                    {TEXT_FIELDS.filter((k) => proposal.fields[k] !== s[k]).map(
                      (k) => (
                        <div key={k} className="grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="text-neutral-500">
                              {TEXT_LABELS[k]} · 改前
                            </p>
                            <p className="whitespace-pre-wrap rounded bg-red-500/10 p-2 text-red-100/80">
                              {s[k]}
                            </p>
                          </div>
                          <div>
                            <p className="text-neutral-500">
                              {TEXT_LABELS[k]} · 改后
                            </p>
                            <p className="whitespace-pre-wrap rounded bg-emerald-500/10 p-2 text-emerald-100">
                              {proposal.fields[k]}
                            </p>
                          </div>
                        </div>
                      ),
                    )}
                    {TEXT_FIELDS.every((k) => proposal.fields[k] === s[k]) ? (
                      <p>AI 认为文字不用改。</p>
                    ) : null}
                    {proposal.left.length ? (
                      <p className="text-amber-300">
                        改完还剩：{proposal.left.join("；")}
                      </p>
                    ) : null}
                    <DraftFeedback
                      busy={busy}
                      needs3d={proposal.needs3d}
                      onSubmit={(f) => rewrite(s.id, f, proposal.fields)}
                    />
                    <div className="flex gap-2">
                      <button
                        className={primary}
                        disabled={busy || dirty}
                        onClick={() => {
                          const p = proposal;
                          setProposal(null);
                          act(
                            () =>
                              saveShortVideoAction(v.id, {
                                shots: shots.map((x) =>
                                  x.id === p.shotId ? { ...x, ...p.fields } : x,
                                ),
                              }),
                            "已按 3D 改写并保存",
                          );
                        }}
                      >
                        采用并保存
                      </button>
                      <button className={btn} onClick={() => setProposal(null)}>
                        不用，保持原文
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-400">
                      首帧 · {charged("frame")} 次（默认上限 {DEFAULT_ATTEMPTS}
                      ）
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {gate(
                        "confirm_comp",
                        saved?.compFile
                          ? "确认构图"
                          : "确认构图（先做 3D 构图）",
                        s.stage === "draft" && !!saved?.compFile,
                      )}
                      {gate(
                        "reopen_comp",
                        "退回构图",
                        s.stage !== "draft" && s.stage !== "accepted",
                      )}
                      {s.stage === "comp_ok" || s.stage === "frame_ready" ? (
                      <button
                        className={mainAct === "frame" ? primary : btn}
                        disabled={
                          busy ||
                          dirty ||
                          !hfReady ||
                          wait > 0 ||
                          runBusy
                        }
                        onClick={() => open("frame")}
                      >
                        {s.stage === "frame_ready" ? "重做首帧…" : "生成首帧…"}
                      </button>
                      ) : null}
                      {s.stage === "frame_ready" ? (
                        <span className="self-center text-xs text-amber-300">
                          对照 3D 构图：机位、产品朝向、大小一致才算通过
                        </span>
                      ) : null}
                      {gate(
                        "frame_ok",
                        "首帧通过",
                        s.stage === "frame_ready",
                      )}
                      {gate(
                        "frame_reject",
                        "首帧不行",
                        s.stage === "frame_ready" || s.stage === "frame_ok",
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                      <History jobs={frames} currentId={s.frameJobId} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-400">
                      视频 · {charged("video")} 次（默认上限 {DEFAULT_ATTEMPTS}
                      ）
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {s.stage === "frame_ok" || s.stage === "video_ready" ? (
                      <button
                        className={mainAct === "video" ? primary : btn}
                        disabled={
                          busy ||
                          dirty ||
                          !hfReady ||
                          wait > 0 ||
                          runBusy
                        }
                        onClick={() => open("video")}
                      >
                        {s.stage === "video_ready" ? "重做视频…" : "生成视频…"}
                      </button>
                      ) : null}
                      {gate("accept", "采用", s.stage === "video_ready")}
                      {s.stage === "video_ready" || s.stage === "accepted" ? (
                      <button
                        className={btn}
                        disabled={
                          busy ||
                          dirty ||
                          !saved
                        }
                        onClick={() => {
                          const note = window.prompt(
                            "这一版哪里不对？多条用分号隔开。新版出来后会逐条对照",
                          );
                          if (!note || !note.trim()) return;
                          const all = window.confirm(
                            "这些问题整条视频都要注意吗？\n\n确定 = 整条视频都要注意（后面的镜头审片时也提醒，并记进规则库）\n取消 = 只管这一镜",
                          );
                          act(() =>
                            shotStageAction(
                              v.id,
                              s.id,
                              "rework",
                              note,
                              all ? "video" : "shot",
                            ),
                          );
                        }}
                      >
                        退回返工…
                      </button>
                      ) : null}
                      {saved?.issues?.length || prevIssues.length ? (
                        <div className="w-full space-y-1 rounded-md border border-amber-400/20 bg-amber-400/5 p-2 text-xs">
                          {(saved?.issues ?? []).map((it) => {
                            const canMark =
                              s.stage === "video_ready" &&
                              !!s.videoJobId &&
                              s.videoJobId !== it.fromJobId;
                            return (
                              <div
                                key={it.id}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <span
                                  className={
                                    it.status === "fixed"
                                      ? "text-emerald-300"
                                      : "text-amber-200"
                                  }
                                >
                                  {it.status === "fixed" ? "已解决" : "待对照"}
                                </span>
                                <span className="text-neutral-200">
                                  {it.text}
                                </span>
                                <button
                                  className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:bg-white/5"
                                  disabled={busy}
                                  title="点一下切换"
                                  onClick={() =>
                                    act(() =>
                                      issueScopeAction(
                                        v.id,
                                        s.id,
                                        it.id,
                                        it.scope === "video" ? "shot" : "video",
                                      ),
                                    )
                                  }
                                >
                                  {it.scope === "video"
                                    ? "整条视频都要注意"
                                    : "只管这一镜"}
                                </button>
                                {it.fromJobId ? (
                                  <a
                                    className="text-sky-300 underline"
                                    href={`/api/shorts/${it.fromJobId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    旧版
                                  </a>
                                ) : null}
                                {canMark ? (
                                  <>
                                    <a
                                      className="text-sky-300 underline"
                                      href={`/api/shorts/${s.videoJobId}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      新版
                                    </a>
                                    <button
                                      className={btn}
                                      disabled={busy}
                                      onClick={() =>
                                        act(() =>
                                          issueStatusAction(
                                            v.id,
                                            s.id,
                                            it.id,
                                            "fixed",
                                          ),
                                        )
                                      }
                                    >
                                      已解决
                                    </button>
                                    <button
                                      className={btn}
                                      disabled={busy}
                                      onClick={() =>
                                        act(() =>
                                          issueStatusAction(
                                            v.id,
                                            s.id,
                                            it.id,
                                            "open",
                                          ),
                                        )
                                      }
                                    >
                                      仍存在
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            );
                          })}
                          {(() => {
                            const old = saved?.issues?.find(
                              (x) => x.fromJobId,
                            )?.fromJobId;
                            if (!old || !s.videoJobId || s.videoJobId === old)
                              return null;
                            return (
                              <div className="grid max-w-md grid-cols-2 gap-2">
                                {[
                                  ["旧版", old],
                                  ["新版", s.videoJobId],
                                ].map(([label, id]) => (
                                  <figure key={id}>
                                    <figcaption className="mb-1 text-neutral-400">
                                      {label}
                                    </figcaption>
                                    <video
                                      src={`/api/shorts/${id}`}
                                      controls
                                      muted
                                      playsInline
                                      className="aspect-[9/16] w-full rounded bg-black object-cover"
                                    />
                                  </figure>
                                ))}
                              </div>
                            );
                          })()}
                          {prevIssues.length ? (
                            <p className="text-neutral-400">
                              整条视频都要注意（前面镜头记下的）：
                              {prevIssues.join("；")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                      <History jobs={vids} currentId={s.videoJobId} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {focus ? null : (
      <section className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
        <h2 className="mb-2 text-sm font-semibold text-amber-300/90">
          预览与导出（免费，本机合成）
        </h2>
        <p className="mb-2 text-xs text-neutral-500">
          每个勾选的开头各出一条「开头 + 正文」，裁成 1080×1920，不加字幕（字幕在后期加）。
          {exp.length ? ` 现在勾选了：${hookList.filter((h) => exp.includes(h.id)).map((h) => h.hook?.name).join("、")}。` : ""}
        </p>
        <button
          className={primary}
          disabled={busy || !v.shots.some((s) => s.stage === "accepted")}
          onClick={() =>
            start(async () => {
              const r = await renderShortAction(v.id);
              apply(r, "成片已更新");
              if (!r.error) setFinalAt(new Date().toISOString());
            })
          }
        >
          导出 {Math.max(1, exp.length)} 个版本
        </button>
        {finalAt ? (
          <div className="mt-3 flex flex-wrap gap-3">
            {(exp.length ? exp : ["1"]).map((id, k) => (
              <figure key={`${id}-${finalAt}`}>
                <figcaption className="mb-1 text-xs text-neutral-400">
                  {hookList.find((h) => h.id === id)?.hook?.name ?? "成片"}
                </figcaption>
                <video
                  src={`/api/shorts/${v.id}?final=${k === 0 ? "1" : id}&t=${encodeURIComponent(finalAt)}`}
                  controls
                  className="max-h-[560px] rounded-lg"
                />
              </figure>
            ))}
          </div>
        ) : null}
      </section>
      )}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {Object.entries(running).map(([id, r]) => {
          const label = `#${shots.findIndex((x) => x.id === id) + 1} ${r.kind === "video" ? "视频" : "首帧"}`;
          return (
            <button
              key={id}
              onClick={() => goShot(id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg ${r.error ? "border-rose-400/60 bg-rose-950/90 text-rose-100" : "border-sky-400/60 bg-sky-950/90 text-sky-100"}`}
            >
              {r.error ? null : (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
              )}
              {r.error
                ? `${label}没生成成功 · 看原因`
                : `${label}生成中 · ${fmtWait(Math.max(0, Math.round((now - r.startedAt) / 1000)))}`}
            </button>
          );
        })}
        {done ? (
          <div className="flex items-center gap-3 rounded-full border border-emerald-400/60 bg-emerald-950/90 px-4 py-2 text-sm text-emerald-100 shadow-lg">
            <button
              onClick={() => {
                goShot(done.shotId);
                setDone(null);
              }}
            >
              #{shots.findIndex((x) => x.id === done.shotId) + 1}{" "}
              {done.kind === "video" ? "视频" : "首帧"}好了 · 去检查
            </button>
            <button onClick={() => setDone(null)} aria-label="关闭">
              ×
            </button>
          </div>
        ) : null}
      </div>

      {pending ? (
        <Approval
          pending={pending}
          shotIndex={shots.findIndex((s) => s.id === pending.shotId) + 1}
          busy={busy}
          onChange={(p) =>
            // 改原因时保留旧报价，不让审批框重绘、输入框失焦；300ms 后重新估价，服务器批准时还会再查一次
            setPending((cur) => (cur ? { ...cur, ...p, ...("reason" in p ? {} : { quote: null }) } : cur))
          }
          onCancel={() => setPending(null)}
          onFix={(c, ai) => fixConflict(pending.shotId, c, ai)}
          onApprove={() => {
            const p = pending;
            if (!p.quote) return;
            setPending(null);
            setMsg({
              tone: "ok",
              text: `${p.kind === "video" ? "视频" : "首帧"}生成中…（${usd(p.quote.costUsd)}）关掉页面也不会重复扣费`,
            });
            act(
              () =>
                runJobAction(
                  v.id,
                  p.shotId,
                  p.kind,
                  p.seconds,
                  p.reason,
                  p.overLimit,
                  p.quote!.costUsd,
                ),
              `#${shots.findIndex((s) => s.id === p.shotId) + 1} ${p.kind === "video" ? "视频" : "首帧"}已开始生成，进度看这一镜和右下角`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function History({ jobs, currentId }: { jobs: GenJob[]; currentId: string | null }) {
  if (!jobs.length) return null;
  const cur = jobs.find((j) => j.id === currentId) ?? jobs[jobs.length - 1];
  const rest = jobs.filter((j) => j.id !== cur.id);
  return (
    <div className="flex items-start gap-2">
      <JobThumb job={cur} current={cur.id === currentId} />
      {rest.length ? (
        <details className="text-xs text-neutral-400">
          <summary className="cursor-pointer select-none">历史版本（{rest.length}）</summary>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {rest.map((j) => (
              <JobThumb key={j.id} job={j} current={false} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function JobThumb({ job, current }: { job: GenJob; current: boolean }) {
  const ring = current ? "border-amber-400" : "border-white/10";
  return (
    <div
      className={`w-28 shrink-0 rounded border ${ring} p-1 text-[10px] text-neutral-400`}
    >
      {job.hasOutput ? (
        job.kind === "video" ? (
          <video
            src={`/api/shorts/${job.id}`}
            controls
            muted
            className="aspect-[9/16] w-full rounded bg-black object-cover"
          />
        ) : (
          <a href={`/api/shorts/${job.id}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/shorts/${job.id}`}
              alt=""
              className="aspect-[9/16] w-full rounded bg-black object-cover"
            />
          </a>
        )
      ) : (
        <div className="flex aspect-[9/16] items-center justify-center rounded bg-white/5 text-center">
          {job.status === "failed" ? "失败·不收费" : "生成中"}
        </div>
      )}
      <p className="mt-1">
        {usd(jobCost(job))}
        {job.kind === "video" ? ` · ${job.seconds}s` : ""}
        {current ? " · 当前" : ""}
      </p>
      {job.reason ? (
        <p className="truncate" title={job.reason}>
          改：{job.reason}
        </p>
      ) : null}
      {job.error ? (
        <p className="truncate text-rose-300" title={job.error}>
          {job.error}
        </p>
      ) : null}
    </div>
  );
}

function Approval({
  pending,
  shotIndex,
  busy,
  onChange,
  onCancel,
  onFix,
  onApprove,
}: {
  pending: Pending;
  shotIndex: number;
  busy: boolean;
  onChange: (p: Partial<Pending>) => void;
  onCancel: () => void;
  onFix: (c: Conflict, ai: boolean) => void;
  onApprove: () => void;
}) {
  const q = pending.quote;
  const [ack, setAck] = useState(false);
  const row = (k: string, val: string, tone = "") => (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-400">{k}</span>
      <span className={tone || "text-white"}>{val}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md space-y-3 rounded-xl border border-amber-400/40 bg-neutral-950 p-5 text-sm">
        <h3 className="text-base font-semibold text-white">
          花钱审批 · 镜头 #{shotIndex} ·{" "}
          {pending.kind === "video" ? "视频" : "首帧"}
        </h3>
        {pending.kind === "video" ? (
          <label className="flex items-center justify-between text-neutral-400">
            生成时长（秒）
            <input
              type="number"
              min={VIDEO_MIN_SEC}
              max={12}
              value={pending.seconds}
              onChange={(e) => onChange({ seconds: Number(e.target.value) })}
              className={`${input} w-20`}
            />
          </label>
        ) : null}
        {!q ? (
          <p className="text-neutral-400">估价中（免费）…</p>
        ) : (
          <div className="space-y-1 rounded-lg border border-white/10 p-3 text-xs">
            {row("模型", q.model)}
            {row("分辨率", q.resolution)}
            {pending.kind === "video" ? row("时长", `${q.seconds} 秒`) : null}
            {row(
              "单价",
              pending.kind === "video"
                ? `$${q.unitUsd}/秒`
                : `$${q.unitUsd}/张`,
            )}
            {row("本次费用", usd(q.costUsd), "text-amber-300 font-semibold")}
            {row("这是本镜第几次", `第 ${q.attempt} 次`)}
            {row("本镜累计（含本次）", usd(q.shotSpent + q.costUsd))}
            {row("本条视频累计（含本次）", usd(q.videoSpent + q.costUsd))}
            {row(
              "预算 / 余量",
              `${usd(q.budget)} / ${usd(q.remainingAfter)}`,
              q.remainingAfter < 0 ? "text-rose-300" : "",
            )}
            {row(
              "成片每秒成本（含本次）",
              `${usd(q.perSecondAfter)}/秒`,
              q.perSecondAfter > MAX_USD_PER_SECOND
                ? "text-rose-300"
                : "text-emerald-300",
            )}
          </div>
        )}
        {q?.needsReason ? (
          <label className="block text-xs text-neutral-400">
            重做原因（这次改了构图 / 首帧 / 提示词 / 时长中的哪一项，为什么）
            <textarea
              value={pending.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
              rows={2}
              className={input}
            />
            <span className="text-neutral-500">
              能用剪辑解决的（换剪辑点、缩短使用秒数、补一个短镜头），先别重出整段。
            </span>
          </label>
        ) : null}
        {q?.needsOverLimit ? (
          <label className="flex items-center gap-2 text-xs text-amber-200">
            <input
              type="checkbox"
              checked={pending.overLimit}
              onChange={(e) => onChange({ overLimit: e.target.checked })}
            />
            超限重新审批：本镜已超过默认 1 次 + 1 次重做
          </label>
        ) : null}
        {q?.conflicts?.length ? (
          <div className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            <p className="font-semibold">文字和 3D 对不上（生成前自查，免费）</p>
            {q.conflicts.map((c) => (
              <div key={c.msg} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">• {c.msg}</span>
                <button type="button" className="rounded border border-amber-300/50 px-2 py-0.5 hover:bg-amber-400/10" onClick={() => onFix(c, false)}>
                  {c.fix === "3d" ? "去 3D 改" : "去改文字"}
                </button>
                {c.fix === "text" ? (
                  <button type="button" className="rounded border border-amber-300/50 px-2 py-0.5 hover:bg-amber-400/10" onClick={() => onFix(c, true)}>
                    让 AI 按 3D 改文字（约 $0.01）
                  </button>
                ) : null}
              </div>
            ))}
            <p className="text-amber-200/80">点改的按钮会关掉这个框；构图已确认的会先退回构图（免费，首帧和次数都保留）。AI 改完给你看改前改后，你点采用才保存。确定没问题，也可以勾选下面这项直接生成。</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              我看过了，仍按现在的内容生成
            </label>
          </div>
        ) : null}
        {q?.warnings.map((w) => (
          <p key={w} className="text-xs text-amber-300">
            ⚠ {w}
          </p>
        ))}
        {q?.blocked.map((b) => (
          <p key={b} className="text-xs text-rose-300">
            ✕ {b}
          </p>
        ))}
        <div className="flex justify-end gap-2">
          <button className={btn} onClick={onCancel}>
            取消
          </button>
          <button
            className={primary}
            disabled={busy || !q || q.blocked.length > 0 || (!!q.conflicts?.length && !ack)}
            onClick={onApprove}
          >
            {q ? `批准并花 ${usd(q.costUsd)}` : "批准"}
          </button>
        </div>
      </div>
    </div>
  );
}
