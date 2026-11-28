"use client";

import { BudgetEditor } from "@/components/admin/BudgetEditor";
import { PRECISION_LABEL, type Precision } from "@/lib/model-precision";
import { ExportHistory } from "@/components/admin/ExportHistory";
import { OverLimitApproval } from "@/components/admin/OverLimitApproval";
import { replaceLoss, shotsSpend } from "@/lib/spend";
import { askConfirm, askPrompt } from "@/components/ConfirmHost";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { fmtWait } from "@/components/shorts/JobPill";
import { RunProgress } from "@/components/shorts/RunProgress";
import { NearToast } from "@/components/NearToast";
import { DisabledWhy } from "@/components/DisabledWhy";
import { useLeaveGuard } from "@/lib/use-leave-guard";
import { useRunPoll } from "@/lib/use-run-poll";
import { OperatorPicker } from "@/components/shorts/OperatorPicker";
import { effectDef } from "@/lib/hook-effects";
import { HookPanel } from "@/components/shorts/HookPanel";
import type { HookDef } from "@/lib/hooks";
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
  settleJobAction,
  retargetTextAction,
  storyCheckAction,
  storyIgnoreAction,
  runJobAction,
  saveShortVideoAction,
  setBudgetAction,
  saveTemplateAction,
  setVideoThemeAction,
  setVideoFamilyAction,
  setVideoFilmerAction,
  deleteHookShotAction,
  shotStageAction,
  type StageAction,
  type StudioState,
  fitShotActionsAction,
  setHookSelfieAction,
  setShotMoveAction,
  setShotFrameModelAction,
  recheckFrameAction,
  recheckVideoAction,
  setEndCardAction,
} from "@/app/short-actions";
import {
  budgetOf,
  BUDGET_WARN_RATIO,
  defaultBudget,
  DEFAULT_ATTEMPTS,
  finalSeconds,
  hookBudget,
  hookEffectOf,
  hooksOf,
  isExtraHook,
  jobCost,
  MAX_USD_PER_SECOND,
  STAGE_LABELS,
  VIDEO_MIN_SEC,
  HF_VIDEO_USD_PER_SEC,
  shotHasPeople,
  videoModelLabel,
  frameModelOf,
  SHORT_FRAME_MODELS,
  videoUsdPerSec,
  VIDEO_USD_PER_SEC,
  type GenJob,
  type JobKind,
  type Quote,
  type ShortShot,
  type VideoResolution,
  videoTheme,
  waitingFor,
  RULE1_REDO,
  rule1Tries,
  RULE1_MAX,
  noProductShot,
} from "@/lib/shorts";
import { THEMES } from "@/lib/shorts-scenes";
import { MOVES } from "@/lib/shorts-set";
import { type TextField } from "@/lib/shorts-sync";
import { DraftView, SyncNotice } from "@/components/shorts/RewriteUI";
import type { Conflict } from "@/lib/shorts";
import { PromptPreview } from "@/components/shorts/PromptPreview";
import { LogoLockPanel } from "@/components/shorts/LogoLockPanel";
import { ColorKits } from "@/components/workbench/ProductKit";
import { ExportGate } from "@/components/shorts/ExportGate";
import { NeedKey } from "@/components/shorts/NeedKey";
import { exportReport } from "@/lib/export-check";
import { storyStale } from "@/lib/story-check";
import { EMPTY_FACTS, type AdFacts } from "@/lib/ad-compliance";
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
  quoteErr?: string;
}

export function ShortStudio({
  initial,
  templates,
  hfReady,
  arkReady = false,
  aiReady = true,
  adFacts = EMPTY_FACTS,
  productPhotos,
  finalAt: initialFinalAt,
  initialShot = null,
  kit,
  hasBase = false,
  model = null,
  families = [],
  hookLib = [],
  cast = [],
}: {
  initial: StudioState;
  templates: { id: string; label: string; look: string }[];
  hfReady: boolean;
  arkReady?: boolean;
  /** DeepSeek Key 填了没 */
  aiReady?: boolean;
  /** 产品资料第 5 步填的价格等依据：导出前对照 */
  adFacts?: AdFacts;
  productPhotos: number;
  finalAt: string | null;
  initialShot?: string | null;
  kit?: KitData;
  hasBase?: boolean;
  /** 现在在用的产品模型精度：工作台上提示新手 3D 构图是按精确还是近似模型摆的 */
  model?: { precision: Precision; name: string } | null;
  families?: { id: string; name: string }[];
  hookLib?: HookDef[];
  /** 家庭位 1 的成员：选谁拿手机 */
  cast?: { id: string; name: string }[];
}) {
  const [st, setSt] = useState(initial);
  const [bgCap, setBgCap] = useState<string | null>(null);
  const [shots, setShots] = useState<ShortShot[]>(initial.video.shots);
  const [dirty, setDirty] = useState(false);
  const [brief, setBrief] = useState(initial.video.brief);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const [busy, start] = useTransition();
  useLeaveGuard(dirty);
  const [pending, setPending] = useState<Pending | null>(null);
  const [finalAt, setFinalAt] = useState(initialFinalAt);
  const [rw, setRw] = useState<{ shotId: string; text: string } | null>(null);
  const [rechecking, setRechecking] = useState<string | null>(null);
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
  const closeMsg = useCallback(() => setMsg(null), []);
  const act = (
    fn: () => Promise<{ error?: string; result?: StudioState }>,
    ok?: string,
  ) => start(async () => apply(await fn(), ok));
  const vt = videoTheme(v);
  const themeLabel = `${THEMES.find((t) => t.id === vt.theme)?.label ?? "无节日"}${vt.theme === "custom" && vt.themeText ? `（${vt.themeText}）` : ""}`;
  const changeTheme = async (theme: string) => {
    const text = theme === "custom" ? await askPrompt("自定义节日是什么？例如：中秋节，挂灯笼、桌上有月饼", vt.themeText ?? "") : "";
    if (text === null) return;
    start(async () => {
      let r = await setVideoThemeAction(v.id, theme, text);
      if (r.result?.confirm) {
        if (!await askConfirm(r.result.confirm)) return;
        r = await setVideoThemeAction(v.id, theme, text, true);
      }
      apply({ error: r.error, result: r.result?.state }, "已换节日");
    });
  };

  const themeSelect = (
    <select value={vt.theme} disabled={busy} onChange={(e) => changeTheme(e.target.value)} className={`${input} w-auto py-1 text-xs`}>
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          节日：{t.label}
        </option>
      ))}
    </select>
  );

  const [hookPanel, setHookPanel] = useState<{ shotId?: string; targetId?: string } | null>(null);
  const famName = (k: string) => families.find((f) => f.id === v.families?.[k])?.name ?? "不指定";
  const famSlots = [...new Set(["1", ...shots.map((s) => String(s.family ?? 1))])].sort();
  const changeFamily = (slot: string, id: string) =>
    start(async () => {
      let r = await setVideoFamilyAction(v.id, Number(slot), id || null);
      if (r.result?.confirm) {
        if (!await askConfirm(r.result.confirm)) return;
        r = await setVideoFamilyAction(v.id, Number(slot), id || null, true);
      }
      apply({ error: r.error, result: r.result?.state }, "已换家庭");
    });
  const changeFilmer = (id: string) =>
    start(async () => {
      let r = await setVideoFilmerAction(v.id, id || null);
      if (r.result?.confirm) {
        if (!await askConfirm(r.result.confirm)) return;
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
  const hookList = hooksOf(v);
  const exp = v.exportHooks?.length ? v.exportHooks : hookList[0] ? [hookList[0].id] : [];
  const plan =
    shots.length * 0.1 + shots.reduce((a, x) => a + x.genSeconds * videoUsdPerSec(x, v.resolution), 0);
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
  const unsure = st.jobs.filter((j) => j.status === "unknown");
  // 服务端渲染时没有当前时间：先用 0，装好后马上换成真时间（避免服务端/浏览器时间不同的 hydration 警告）
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t0);
  }, []);
  const [done, setDone] = useState<{ shotId: string; kind: JobKind } | null>(
    null,
  );
  const dirtyRef = useRef(dirty);
  const stRef = useRef(st);
  useEffect(() => {
    dirtyRef.current = dirty;
    stRef.current = st;
  });
  // 改了没保存就关页面 / 刷新：浏览器先问一句
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
  // 后台保存 3D 构图：隐藏的 3D 页存完会发消息回来
  useEffect(() => {
    if (!bgCap) return;
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string } | null)?.type !== "pd-3d-saved") return;
      setBgCap(null);
      void studioStateAction(v.id).then(merge);
      setMsg({ tone: "ok", text: "3D 构图已在后台自动保存" });
    };
    window.addEventListener("message", on);
    const t = setTimeout(() => {
      setBgCap(null);
      setMsg({ tone: "err", text: "3D 构图没能在后台保存好：点卡片上的「打开 3D 摆位 + 机位」，再点「保存」" });
    }, 120_000);
    return () => {
      window.removeEventListener("message", on);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgCap]);
  const pollOn = Object.values(running).some((r) => !r.error);
  // 只在有任务时轮询；每次只取几百字节的「变了没」，变了才取完整状态（见 useRunPoll）
  const typical = useRunPoll(v.id, pollOn, () => void studioStateAction(v.id).then(merge));
  useEffect(() => {
    if (!pollOn) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [pollOn]);
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
      setPending((p) => (p ? { ...p, quote: r.result ?? null, quoteErr: r.error } : p));
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
        <div className="min-w-0 max-w-full space-y-2">
          <input
            defaultValue={v.title}
            onBlur={(e) =>
              e.target.value !== v.title &&
              act(() => saveShortVideoAction(v.id, { title: e.target.value }))
            }
            className="w-full min-w-0 bg-transparent text-2xl font-semibold text-white outline-none"
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
                {v.fromTemplate.rewritten ? "文字已经按这个产品改写过。" : "产品的零件、卖点、价格还是原产品的，出首帧前剧本对账会逐条查。"}
              </p>
              {v.fromTemplate.swapped ? <p className="text-emerald-300/90">✓ 已免费把旧产品名、家庭名、人名换成这个产品和家庭的，共 {v.fromTemplate.swapped} 处</p> : null}
              {v.fromTemplate.left?.length ? (
                <ul className="list-disc pl-5 text-rose-300/90">
                  {v.fromTemplate.left.map((x) => (
                    <li key={x}>{x}（换不了，要改掉）</li>
                  ))}
                </ul>
              ) : null}
              {!v.fromTemplate.rewritten ? (
                <button
                  type="button"
                  className={btn}
                  disabled={busy}
                  onClick={async () => {
                    if (!await askConfirm("用 DeepSeek 按这个产品的资料，改写所有镜头的画面、机位、产品备注、提示词和字幕。\n\n调用文字模型 1 次，大约 $0.01，不出图。\n\n确定吗？")) return;
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
          {(() => {
            const sc = v.storyCheck;
            const stale = storyStale(v);
            const locked = sc && !stale && sc.issues.some((i) => v.shots.find((x) => x.id === i.shotId)?.stage !== "draft");
            return (
              <div className="mt-2 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={!sc || stale ? "text-amber-200/80" : sc.pass ? "text-emerald-300" : "text-rose-300"}>
                    剧本对账：{!sc ? "还没查，出首帧前会自动查" : sc.error ? `上次没查成（${sc.error}）` : stale ? "剧本改过，出首帧前会自动再查" : sc.pass ? "产品、人物、节日、前后都对得上" : `${sc.issues.length} 处对不上，这几镜出首帧会被拦住`}
                  </span>
                  <button
                    type="button"
                    className={btn}
                    disabled={busy}
                    title="大脑 K3 对照产品资料、家庭、节日和开头查每一镜；还没确认构图的镜头有问题会自动改写"
                    onClick={() =>
                      start(async () => {
                        setMsg({ tone: "ok", text: "Kimi K3 对账中…（1–3 分钟）" });
                        apply(await storyCheckAction(v.id), "剧本对账完成");
                      })
                    }
                  >
                    {sc && !stale ? "重新对账" : "现在对账"}（Kimi K3，约 $0.03）
                  </button>
                  {sc && !stale && sc.issues.length ? (
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={async () => {
                        if (!(await askConfirm(`让 AI 改掉这 ${sc.issues.length} 处，改完 K3 自动复查（约 $0.05）。\n\n已采用的镜头只改文字，已经出好的首帧和视频不动。\n\n确定吗？`))) return;
                        start(async () => {
                          setMsg({ tone: "ok", text: "AI 改写并复查中…（2–4 分钟）" });
                          apply(await storyCheckAction(v.id, true), "改完了，复查结果在「剧本对账」里");
                        });
                      }}
                    >
                      一键改掉（只改文字）
                    </button>
                  ) : null}
                </div>
                {sc && !stale ? (
                  <ul className="list-disc space-y-0.5 pl-5">
                    {sc.fixes?.length
                      ? sc.fixes.map((f, k) => {
                          const s = v.shots.find((x) => x.id === f.shotId);
                          const n = s ? (s.hook ? `开头「${s.hook.name}」` : `#${v.shots.indexOf(s) + 1}`) : "";
                          return (
                            <li key={`f${k}`} className={f.ok ? "text-emerald-300/90" : "text-rose-300/90"}>
                              {f.ok ? "✓ 复查通过" : "✗ 还没改好"} · {n}：{f.why}
                              {f.quote || f.now ? (
                                <span className="block text-neutral-400">
                                  「{f.quote}」→「{f.now || "（整句重写）"}」
                                </span>
                              ) : null}
                            </li>
                          );
                        })
                      : sc.fixed.map((f) => (
                          <li key={f} className="text-emerald-300/90">{f}</li>
                        ))}
                    {sc.issues.map((i, k) => {
                      const s = v.shots.find((x) => x.id === i.shotId);
                      const n = s ? (s.hook ? `开头「${s.hook.name}」` : `#${v.shots.indexOf(s) + 1}`) : "";
                      return (
                        <li key={k} className="text-rose-300/90">
                          {n}：{i.quote ? `「${i.quote}」` : ""}{i.why}
                          <button
                            type="button"
                            className="ml-2 rounded border border-white/15 px-1.5 text-[11px] text-neutral-300 hover:bg-white/10"
                            disabled={busy}
                            title="这一条不影响，不拦首帧和导出，以后 K3 再报也跳过（免费）"
                            onClick={() => start(async () => apply(await storyIgnoreAction(v.id, i.shotId, i.kind, i.quote), "这一条不再管"))}
                          >
                            不用管
                          </button>
                        </li>
                      );
                    })}
                    {locked ? <li className="text-neutral-400">已确认构图的镜头查的时候不自动改：点「一键改掉」只改文字，已出的画面不动</li> : null}
                  </ul>
                ) : null}
              </div>
            );
          })()}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btn}
              disabled={busy || !v.shots.some((s) => !s.hook)}
              title="存正文和第一个开头的文字、机位、场地和节日；不存首帧、视频和花费"
              onClick={async () => {
                const name = await askPrompt("模板名字", v.title);
                if (!name?.trim()) return;
                start(async () => {
                  const r = await saveTemplateAction(v.id, name);
                  apply({ error: r.error }, `已存为模板「${name.trim()}」，新建视频时可以选`);
                });
              }}
            >
              存为模板
            </button>
            {themeSelect}
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
              onChange={async (e) =>
                (!st.jobs.length ||
                  await askConfirm(
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
                    {r} · ${VIDEO_USD_PER_SEC[r]}–${HF_VIDEO_USD_PER_SEC[r]}/秒
                  </option>
                ),
              )}
            </select>
            <label className="flex items-center gap-1 text-xs text-neutral-300" title="开不开声音价格一样；后期不要声音，在下面「预览与导出」里关">
              <input type="checkbox" checked={v.sound !== false} disabled={busy} onChange={(e) => act(() => saveShortVideoAction(v.id, { sound: e.target.checked }))} />
              声音（只有环境音和动作声效，价格一样）{v.shots.some((x) => x.hook?.selfie) ? "：自拍开头那一镜不管这里，总是带声音和台词" : ""}
            </label>
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
              {v.shots.length ? `已花 ${usd(spent)} · 剩 ${usd(Math.max(0, budget - spent))}` : "出完分镜后按成片秒数自动算预算"}
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
          {v.shots.length && plan > budget - spent + 0.005 ? (
            <p className="mt-1 text-amber-300">
              按现在的分镜做完约 {usd(plan)}，剩下的预算只有 {usd(Math.max(0, budget - spent))}：先调高预算，或减少镜头 / 秒数
            </p>
          ) : null}
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
          <BudgetEditor
            budget={budgetOf(live)}
            defaultUsd={defaultBudget(live)}
            custom={v.budgetUsd !== null}
            busy={busy}
            onSet={(n, reason, pin, bigOk) => act(() => setBudgetAction(v.id, n, reason, pin, bigOk), "预算已更新，已记进操作日志")}
          />
          </details>
        </div>
      </header>

      {focus ? null : (() => {
        const DO: Record<string, string> = {
          draft: "确认构图（可以先去 3D 页摆好）",
          comp_ok: "出首帧",
          frame_ready: "看首帧，合格就点通过",
          frame_ok: "出视频",
          video_ready: "看视频，合格就点采用"
        };
        const todo = [...shots.filter((s) => !s.hook), ...shots.filter((s) => s.hook)].find((s) => s.stage !== "accepted");
        const [text, go]: [string, string | null] = !shots.length
          ? !v.concepts.length
            ? ["点下面的「AI 出 4 个创意」", null]
            : !v.conceptId
              ? ["在下面 4 个创意里点选一个", null]
              : ["点「按选中创意出分镜」", null]
          : todo
            ? [`${todo.hook ? "开头" : `#${shots.indexOf(todo) + 1}`}「${todo.beat}」：${DO[todo.stage] ?? ""}`, todo.id]
            : ["镜头都采用了：到最下面「预览与导出」出成片", null];
        return (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3">
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-black">下一步</span>
            <span className="text-sm text-amber-50">{text}</span>
            {go ? (
              <button className={`${primary} ml-auto`} onClick={() => setFocus(go)}>
                去做这一镜 →
              </button>
            ) : null}
          </div>
        );
      })()}
      <NearToast msg={msg} busy={busy} onClose={closeMsg} />
      {bgCap ? (
        <>
          <p className="rounded-md bg-sky-400/10 px-3 py-2 text-sm text-sky-200">3D 构图正在后台自动保存…</p>
          <iframe src={bgCap} title="后台保存 3D 构图" aria-hidden className="pointer-events-none fixed bottom-0 right-0 h-[900px] w-[1400px] opacity-0" />
        </>
      ) : null}
      {!hfReady ? (
        <p className="rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          尚未配置 Higgsfield Key：免费步骤可用，付费生成不可用。
        </p>
      ) : null}
      {!arkReady ? (
        <p className="rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          尚未配置火山方舟 Key：只拍产品的镜头生成不了视频，到左边「设置」填写。
        </p>
      ) : null}
      {productPhotos === 0 ? (
        <p className="rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          产品还没有参考图：先上传产品照，或在短视频列表页用 3D
          模型渲染参考图（免费）。没有参考图不能生成首帧。
        </p>
      ) : null}
      {unsure.map((j) => (
        <div key={j.id} className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          #{shots.findIndex((x) => x.id === j.shotId) + 1} {j.kind === "video" ? "视频" : "首帧"}：{j.error ?? "提交结果不确定，可能已经扣费"}
          <span className="mt-1 flex flex-wrap gap-2">
            {/^doubao-/.test(j.model) ? (
              <button className={btn} disabled={busy} onClick={() => act(() => resumeJobAction(j.id), "查好了")}>
                重新查一次
              </button>
            ) : null}
            <button className={btn} disabled={busy} onClick={() => act(() => settleJobAction(j.id, false), "记成不收费，可以重做了")}>
              我在控制台确认过：没扣费
            </button>
            <button className={btn} disabled={busy} onClick={() => act(() => settleJobAction(j.id, true), "已放弃，按已扣费记账")}>
              放弃，按已扣费记账
            </button>
          </span>
        </div>
      ))}
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
          {stuck.map((j) =>
            now - Date.parse(j.createdAt) > 30 * 60_000 ? (
              <button
                key={`x${j.id}`}
                className={`${btn} ml-2`}
                disabled={busy}
                onClick={() => act(() => settleJobAction(j.id, true), "已放弃，按已扣费记账")}
              >
                等了 30 分钟还没好：放弃，按已扣费记账
              </button>
            ) : null,
          )}
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
            placeholder="可选：还想强调什么，比如受众、卖点（节日在上面的视频设定里改）"
            className={input}
          />
          <button
            className={primary}
            disabled={
              busy ||
              !aiReady ||
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
          {!aiReady ? <NeedKey name="DeepSeek" anchor="deepseek" /> : null}
        </div>
        {shots.length > 0 && st.jobs.some((j) => j.status !== "failed") ? (
          <p className="mt-1 text-xs text-neutral-400">已经开始出图，不能再换创意：要换创意，新建一条短视频</p>
        ) : null}
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DisabledWhy
              why={
                !v.conceptId
                  ? v.concepts.length
                    ? "先在上面点选一个创意；也可以点「+ 镜头」自己写"
                    : "先点上面的「AI 出 4 个创意」，再点选一个；也可以点「+ 镜头」自己写"
                  : st.jobs.some((j) => j.status !== "failed")
                    ? null
                    : null
              }
            />
            {st.jobs.some((j) => j.status !== "failed") ? null : (
              <button
                className={btn}
                disabled={busy || !aiReady || !v.conceptId}
                onClick={() => act(() => aiShotsAction(v.id), "已生成分镜")}
              >
                {shots.length ? "按选中创意重出分镜" : "按选中创意出分镜"}
              </button>
            )}
            {!aiReady ? <NeedKey name="DeepSeek" anchor="deepseek" /> : null}
            <button
              className={btn}
              disabled={busy}
              onClick={() => {
                const nid = Math.random().toString(36).slice(2, 10);
                setShots((xs) => [
                  ...xs,
                  {
                    id: nid,
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
                setFocus(nid);
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
          计划生成 {plannedGen} 秒，成片用 {secs} 秒。每镜最少生成 {VIDEO_MIN_SEC} 秒，多出来的会剪掉。
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
            const gate = (a: StageAction, label: string, enabled: boolean, blocked = false) => !enabled ? null : (
              <button
                className={a === mainAct && !blocked ? primary : btn}
                disabled={
                  busy || dirty || !saved || !enabled || wait > 0 || runBusy || blocked
                }
                onClick={async () => {
                  const sy = st.sync?.[s.id];
                  const list = sy ? [...sy.changes, ...sy.issues] : [];
                  if (
                    a === "confirm_comp" &&
                    list.length &&
                    !await askConfirm(
                      `这一镜的文字和 3D 还有 ${list.length} 处对不上：\n· ${list.join("\n· ")}\n\n仍然确认构图？`,
                    )
                  )
                    return;
                  const fc0 = s.frameCheck?.jobId === s.frameJobId ? s.frameCheck : undefined;
                  if (a === "frame_ok_force" && fc0?.product?.length) {
                    const why = await askPrompt(`产品和实物不一致（规则 #1）：\n· ${fc0.product.join("\n· ")}\n\n只有确认是误报（例如零件被人挡住）才能放行，需要管理员。写一句放行原因：`);
                    if (!why?.trim()) return;
                    act(() => shotStageAction(v.id, s.id, a, why.trim()));
                    return;
                  }
                  act(() => shotStageAction(v.id, s.id, a));
                }}
              >
                {label}
              </button>
            );
            const open = (kind: JobKind, reason = "") =>
              setPending({
                shotId: s.id,
                kind,
                seconds: kind === "video" ? s.genSeconds : 0,
                reason,
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
                    ? saved?.compFile || s.hook?.scene === "car"
                      ? "下一步：① 确认构图（免费）"
                      : "下一步：点「打开 3D 摆位 + 机位」，摆好后点右上角「保存」"
                    : s.stage === "comp_ok"
                      ? hfReady ? "下一步：② 生成首帧（先弹审批框）" : "生成要先在左边「设置」填 Higgsfield Key"
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
                    <span className="flex gap-2">
                    <button
                      className={btn}
                      disabled={busy || dirty}
                      title={dirty ? "先保存分镜" : ""}
                      onClick={async () => {
                        if (!(await askConfirm("再加一个开头？只是加一个镜头，现在不花钱；成片多一个版本，计划时长和预算会跟着增加。"))) return;
                        act(() => addHookAction(v.id), "已新建开头：先改文字，再去 3D 保存构图");
                      }}
                    >
                      {hooksOf(v).length ? "＋ 照抄第一个开头" : "＋ 用正文第 1 镜做一个开头"}
                    </button>
                    <button className={btn} disabled={busy || dirty || !hookLib.length} title={dirty ? "先保存分镜" : ""} onClick={() => setHookPanel({})}>
                      ＋ 用 Hook 库加一个开头
                    </button>
                    </span>
                  </li>
                ) : null,
                i === 0 && hookPanel ? (
                  <li key="h-panel" className="col-span-full">
                    <HookPanel aiReady={aiReady} onBgCapture={setBgCap} cast={cast} themePicker={themeSelect} key={hookPanel.shotId ?? hookPanel.targetId ?? "new"} videoId={v.id} lib={hookLib} shot={hookPanel.shotId ? v.shots.find((x) => x.id === hookPanel.shotId) : undefined} targetId={hookPanel.targetId} setHref={(id) => `/projects/${v.projectId}/shorts/${v.id}/set?shot=${id}&capture=1`} onDone={apply} onClose={() => setHookPanel(null)} />
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
                  {s.hook?.libId ? (
                    <button className="mt-1 text-xs text-amber-300 underline" disabled={busy || dirty} onClick={() => setHookPanel({ shotId: s.id })}>
                      Hook 属性（{s.hook.libName}）
                    </button>
                  ) : s.hook && !s.hook.partOf ? (
                    <button className="mt-1 text-xs text-amber-300 underline" disabled={busy || dirty} title={dirty ? "先保存分镜" : ""} onClick={() => setHookPanel({ targetId: s.id })}>
                      换成 Hook 库的套路，AI 重写
                    </button>
                  ) : null}
                  {s.hook ? (
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {s.hook.partOf ? "开头切镜后的第二段：字幕和效果跟着开头连着放" : s.hook.libId ? `Hook：${s.hook.libName}` : "模板自带的开头"}
                      {thumb && !s.frameJobId ? " · 图是 3D 构图，画面还没出" : ""}
                    </p>
                  ) : null}
                  {s.hook && !s.hook.partOf ? (
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
<label className="flex items-center gap-1 whitespace-nowrap text-xs text-neutral-400">
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
                      导出时用
                    </label>
<button
                      className="whitespace-nowrap text-xs text-neutral-500 hover:text-rose-300"
                      disabled={busy || dirty}
                      onClick={async () => {
                        if (await askConfirm(`删除开头「${s.hook?.name}」${v.shots.some((x) => x.hook?.partOf === s.id) ? "（连切镜后的第二段一起删）" : ""}？\n\n会丢掉 ${usd(shotsSpend(st.jobs, [s.id, ...v.shots.filter((x) => x.hook?.partOf === s.id).map((x) => x.id)]))} 的结果。删掉的开头进回收站，可以恢复。`)) act(() => deleteHookShotAction(v.id, s.id), "已删除开头，可在回收站恢复");
                      }}
                    >
                      删除开头
                    </button>
                    </div>
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
                    {["写内容", s.hook?.scene === "car" ? "确认画面（车里，不用 3D）" : "3D 摆位 + 机位", "首帧", "视频 → 采用"].map((label, k) => (
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
                    {!s.hook.libId && !s.hook.partOf ? (
                    <>
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
                    </>
                    ) : null}
                    <p className="basis-full text-neutral-500">
                      {s.hook.partOf
                        ? "开头切镜后的第二段：字幕和效果跟着开头连着放。"
                        : s.hook.libId
                          ? v.shots.some((x) => x.hook?.partOf === s.id)
                            ? `照案例切镜头：这段用 ${s.useSeconds} 秒，然后切到第二段（下一个开头镜头）。`
                            : "照案例一镜到底，不切镜头。"
                          : `只生成一段 ${s.genSeconds} 秒视频、只付一次钱，导出时按剪辑点剪成 2 个镜头（同一个机位）。改剪辑点不花钱。`}
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
                      className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${s.stage === "accepted" ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-neutral-300"}`}
                    >
                      {STAGE_LABELS[s.stage]}
                    </span>
                    <span className="whitespace-nowrap text-xs text-neutral-400">
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
                    {s.hook ? null : (
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
                    )}
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
                    {s.hook?.partOf
                      ? "字幕（第二段不用：开头的字幕跨两段连着放）"
                      : hookEffectOf(s.hook)
                        ? hookEffectOf(s.hook) === "talkWords"
                          ? "切镜后顶部的卖点（英文；中下方的跟读字幕自动用自拍台词）"
                          : `字幕（英文，出片时按 Hook 效果烧进开头：${effectDef(hookEffectOf(s.hook))?.label ?? ""}）`
                        : s.hook
                          ? "字幕（英文，这个开头没选 Hook 效果，出片不烧）"
                          : v.captions !== false ? "字幕（英文，出片时用开头同款样式烧进正文）" : "字幕（英文，下面「整条视频加字幕」没勾，出片不烧）"}
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
                    {s.hook?.selfie ? (
                      <p className="text-amber-200">
                        拍摄者：{cast.find((m) => m.id === (s.layout?.figures?.find((f) => f.id === "self")?.memberId ?? s.hook?.who))?.name ?? "出镜的人"}自己拿手机自拍入镜，对着镜头说台词（强制开声音）
                      </p>
                    ) : (
                      <>
                        拍摄者（先选姿态，露什么按机位自动算）
                        {locked ? " · 改了要先“退回构图”" : ""}
                        <span className="ml-1 text-[11px] text-neutral-500">· 和 3D 页右栏是同一个设置，改哪边都行</span>
                        <div className="mt-1">
                          <OperatorPicker
                            value={s.operator ?? ""}
                            disabled={locked}
                            layout={s.layout}
                            onChange={(v) => edit(i, { operator: v })}
                          />
                        </div>
                      </>
                    )}
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
                      {s.hook?.scene === "car" ? "" : "3D 构图（免费）："}
                      {s.hook?.scene === "car" ? "" : saved?.compFile
                        ? "已保存"
                        : saved?.layout
                          ? "机位已摆，还没保存构图"
                          : "还没摆机位"}
                      {saved?.layout?.move
                        ? ` · 运镜 ${MOVES.find((m) => m.id === saved.layout?.move?.kind)?.label ?? saved.layout.move.kind}`
                        : ""}
                      {s.hook?.partOf && !(saved?.layout?.figures ?? []).length ? " · 照案例只拍产品，没有人" : ""}
                    </p>
                    {s.hook?.scene === "car" ? (
                      <p className="text-sky-200">车里自拍：这一段不用 3D，三轮车不入镜</p>
                    ) : (
                    <a
                      href={`/projects/${v.projectId}/shorts/${v.id}/set?shot=${s.id}`}
                      className={`${btn} inline-block`}
                    >
                      打开 3D 摆位 + 机位
                    </a>
                    )}
                    {s.hook?.scene === "car" ? null : (
                      <a href={`/projects/${v.projectId}/product`} title={model?.name} className={`ml-2 inline-block text-xs ${!model ? "text-rose-300" : model.precision === "approx" ? "text-amber-200" : "text-emerald-300"}`}>
                        {!model ? "还没有产品模型：3D 里用方块占位" : `模型：${PRECISION_LABEL[model.precision]}`}
                      </a>
                    )}
                    {(() => {
                      const sy = st.sync?.[s.id];
                      if (!sy || (s.stage !== "draft" && s.stage !== "comp_ok"))
                        return null;
                      if (!sy.changes.length && !sy.issues.length && !sy.fix3d?.length)
                        return s.layout ? (
                          <p className="text-emerald-300/80">文字和 3D 没有冲突</p>
                        ) : (
                          <p className="text-neutral-400">还没摆 3D：摆好后才查文字里的人、位置、动作和 3D 对不对得上</p>
                        );
                      return (
                        <SyncNotice
                          sync={sy}
                          busy={busy}
                          working={busy && rw?.shotId === s.id}
                          canRewrite={s.stage === "draft" && !dirty}
                          why={s.stage !== "draft" ? "构图已确认：要改先点“退回构图”" : dirty ? "先保存分镜再改写" : ""}
                          msg={rw?.shotId === s.id ? rw.text : ""}
                          onRewrite={() => rewrite(s.id)}
                          figHref={(fig) => `/projects/${v.projectId}/shorts/${v.id}/set?shot=${s.id}${fig ? `&fig=${fig}` : ""}`}
                          onFix3d={() => act(() => fitShotActionsAction(v.id, s.id), "已把 3D 做不到的动作改好")}
                        />
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
                        : `第 2 步：${model} 生成中`;
                  return (
                    <div className="mt-3 flex items-start gap-3 rounded-lg border border-sky-400/50 bg-sky-500/10 p-3 text-sm text-sky-100">
                      <span className="mt-1 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          #{i + 1} {name}生成中 · 已等{" "}
                          {fmtWait(
                            Math.max(0, Math.round((now - r.startedAt) / 1000)),
                          )}
                        </p>
                        <p className="text-xs text-sky-100">
                          {step}
                          。这期间可以去做别的镜头或页面，好了右下角会提示；不会重复扣费。
                        </p>
                        <RunProgress kind={r.kind} step={r.step} startedAt={r.startedAt} jobCreatedAt={lj?.createdAt} typicalSec={typical[r.kind]} now={now} />
                      </div>
                    </div>
                  );
                })()}
                {proposal?.shotId === s.id ? (
                  <div id={`proposal-${s.id}`} className="mt-3 scroll-mt-4">
                    <DraftView
                      p={proposal}
                      old={s}
                      busy={busy}
                      useDisabled={dirty}
                      figIds={(s.layout?.figures ?? []).map((f) => f.id)}
                      figHref={(id) => `/projects/${v.projectId}/shorts/${v.id}/set?shot=${s.id}${id ? `&fig=${id}` : ""}`}
                      onUse={() => {
                        const p = proposal;
                        setProposal(null);
                        act(
                          () =>
                            saveShortVideoAction(v.id, {
                              shots: shots.map((x) => (x.id === p.shotId ? { ...x, ...p.fields } : x)),
                            }),
                          "已按 3D 改写并保存",
                        );
                      }}
                      onDrop={() => setProposal(null)}
                      onFeedback={(f) => rewrite(s.id, f, proposal.fields)}
                    />
                  </div>
                ) : null}
                {s.endCard ? (
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/shorts/${v.id}?endcard=1`} alt="Logo 片尾" className="aspect-[9/16] w-24 rounded border border-white/10 bg-white object-cover" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="font-medium">Logo 片尾 · 已采用 · 免费</p>
                      <p className="text-xs">白底 + 品牌 Logo + 这一镜的字幕，{s.useSeconds} 秒。平台直接合成，不用 AI 出图。</p>
                      <button type="button" disabled={busy} onClick={() => act(() => setEndCardAction(v.id, s.id, false), "已改回 AI 镜头")} className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-50">
                        改回 AI 镜头
                      </button>
                    </div>
                  </div>
                ) : !s.hook && noProductShot(s) ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                    <p className="min-w-0 flex-1">这一镜不出产品，不用 AI 出图：平台直接合成 Logo 片尾（白底 + Logo + 字幕），免费。</p>
                    <button type="button" disabled={busy} onClick={() => act(() => setEndCardAction(v.id, s.id, true), "已改成 Logo 片尾")} className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-300 disabled:opacity-50">
                      改成 Logo 片尾（免费）
                    </button>
                  </div>
                ) : null}
                <div className={`mt-3 grid gap-3 border-t border-white/10 pt-3 md:grid-cols-2${s.endCard ? " hidden" : ""}`}>
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-400">
                      首帧 · {charged("frame")} 次（默认上限 {DEFAULT_ATTEMPTS}
                      ）
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {gate(
                        "confirm_comp",
                        saved?.compFile || s.hook?.scene === "car"
                          ? "确认构图"
                          : "确认构图（先做 3D 构图）",
                        s.stage === "draft" && (!!saved?.compFile || s.hook?.scene === "car"),
                      )}
                      {gate(
                        "reopen_comp",
                        "退回构图",
                        s.stage !== "draft" && s.stage !== "accepted",
                      )}
                      {s.stage === "comp_ok" || s.stage === "frame_ready" ? (
                      <select
                        aria-label="首帧模型"
                        title="首帧用哪个模型出图；只影响下一次出首帧"
                        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                        value={frameModelOf(s).id}
                        disabled={busy || runBusy}
                        onChange={(e) => act(() => setShotFrameModelAction(v.id, s.id, e.target.value), "首帧模型已保存")}
                      >
                        {SHORT_FRAME_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label} · ${m.usd.toFixed(2)}/张 · {m.note}
                          </option>
                        ))}
                      </select>
                      ) : null}
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
                      {!hfReady && (s.stage === "comp_ok" || s.stage === "frame_ready") ? <NeedKey name="Higgsfield" anchor="higgsfield" /> : null}
                      {s.stage === "frame_ready" ? (
                        <span className="self-center text-xs text-amber-300">
                          {s.hook?.scene === "car" ? "对照选的人：是 TA、坐在车里、画面里没有三轮车才算通过" : "对照 3D 构图：机位、产品朝向、大小一致才算通过"}
                        </span>
                      ) : null}
                      {(() => {
                        const fc = s.frameCheck?.jobId === s.frameJobId ? s.frameCheck : undefined;
                        const bad = !!fc && !fc.pass && !fc.failed;
                        // 没做自动检查（没填 Gemini Key / 检查出错）：要用户自己对照产品照看过再通过
                        const unchecked = !fc || !!fc.failed;
                        return (
                          <>
                            {gate(bad ? "frame_ok_force" : "frame_ok", bad ? (fc?.product?.length ? "管理员：确认是误报，放行" : "我看过了，仍然通过") : unchecked ? "没自动检查：我对照产品照看过了，通过" : "首帧通过", s.stage === "frame_ready")}
                            {fc && (s.stage === "frame_ready" || s.stage === "frame_ok") ? (
                              fc.pass ? (
                                <span className="self-center text-xs text-emerald-300">看图检查通过：图和提示词、3D 对得上</span>
                              ) : (
                                <div className={`w-full rounded border p-2 text-xs ${fc.failed ? "border-amber-400/40 text-amber-200" : "border-rose-400/50 bg-rose-400/5 text-rose-200"}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-medium">{fc.failed ? "看图检查" : `看图检查发现 ${fc.issues.length} 个问题，先看图再决定`}</p>
                                    <button
                                      type="button"
                                      className="rounded border border-white/20 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-40"
                                      disabled={busy || runBusy || rechecking === s.id}
                                      title="检查规则更新过：只重新看图，不重新出图；Gemini 约 $0.01，换 K3 约 $0.05–$0.10"
                                      onClick={async () => {
                                        setRechecking(s.id);
                                        apply(await recheckFrameAction(v.id, s.id));
                                        setRechecking(null);
                                      }}
                                    >
                                      {rechecking === s.id ? "正在重新检查…" : "用最新规则重新检查（$0.01–$0.10）"}
                                    </button>
                                  </div>
                                  {fc.product?.length ? (() => {
                                    const tries = rule1Tries(js, s.compFile);
                                    return (
                                      <div className="mt-1 space-y-1">
                                        <p className="font-semibold text-rose-100">车和实物不一样（规则 #1），不能直接通过</p>
                                        {tries < RULE1_MAX ? (
                                          <button
                                            type="button"
                                            className={primary}
                                            disabled={busy || runBusy || s.stage !== "frame_ready"}
                                            onClick={async () => {
                                              const r = await shotStageAction(v.id, s.id, "frame_reject");
                                              apply(r);
                                              if (!r.error) open("frame", `${RULE1_REDO}：${fc.product!.join("；")}`.slice(0, 300));
                                            }}
                                          >
                                            车不对，重出首帧（第 {tries + 1}/{RULE1_MAX} 次）
                                          </button>
                                        ) : (
                                          <p className="text-rose-100">因为车不对已经重出了 {tries} 次，还是不对：别再花钱重出。换一个能看清产品的 3D 角度、补同角度的实物照，或者向工厂要 STEP</p>
                                        )}
                                      </div>
                                    );
                                  })() : null}
                                  {fc.issues.map((x, i) => (
                                    <p key={i}>· {x}</p>
                                  ))}
                                </div>
                              )
                            ) : null}
                          </>
                        );
                      })()}
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
                    {s.layout ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400" title="和 3D 页的运镜是同一个设置，改哪边都行">
                        运镜
                        <select
                          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                          value={s.layout.move?.kind ?? "static"}
                          disabled={busy}
                          onChange={(e) => act(() => setShotMoveAction(v.id, s.id, e.target.value, s.layout?.move?.amount || 0.5), "运镜已保存")}
                        >
                          {MOVES.filter((m) => !s.hook?.selfie || m.id === "static" || m.id === "handheld").map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        {s.layout.move && s.layout.move.kind !== "static" ? (
                          <select
                            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
                            value={s.layout.move.amount > 0.66 ? "0.85" : s.layout.move.amount > 0.33 ? "0.5" : "0.25"}
                            disabled={busy}
                            onChange={(e) => act(() => setShotMoveAction(v.id, s.id, s.layout?.move?.kind ?? "static", Number(e.target.value)), "运镜已保存")}
                          >
                            <option value="0.25">轻</option>
                            <option value="0.5">中</option>
                            <option value="0.85">强</option>
                          </select>
                        ) : null}
                      </div>
                    ) : null}
                    {s.hook?.selfie ? (
                      <>
<label className="flex items-center gap-2 text-xs text-neutral-400">
                      自拍台词
                      <input
                        key={`line-${s.id}-${s.hook.line ?? ""}`}
                        className={`min-w-0 flex-1 rounded border bg-neutral-950 px-2 py-1 text-xs text-neutral-100 ${s.hook.line?.trim() ? "border-neutral-700" : "border-red-500"}`}
                        defaultValue={s.hook.line ?? ""}
                        placeholder="自拍台词（必填，英文）"
                        disabled={busy}
                        onBlur={(e) => {
                          const t = e.target.value.trim();
                          if (t !== (s.hook?.line ?? "").trim()) act(() => setHookSelfieAction(v.id, s.id, true, t), "台词已保存");
                        }}
                      />
                      </label>
                      {s.hook.lineZh ? <p className="text-xs text-neutral-500">中文意思：{s.hook.lineZh}</p> : s.hook.line?.trim() ? <p className="text-xs text-neutral-500">台词改过了，中文意思要自己对一下</p> : null}
                      {(() => {
                        // 按约 2.6 个英文词 / 秒估算：台词比这一段用的秒数长，切镜时会被切断
                        const words = (s.hook?.line ?? "").trim().split(/\s+/).filter(Boolean).length;
                        const need = Math.round((words / 2.6) * 10) / 10;
                        return words && need > s.useSeconds + 0.2 ? (
                          <p className="text-xs text-amber-300">
                            台词说完约 {need} 秒，这一段只用 {s.useSeconds} 秒，切镜时会被切断：缩短台词，或把「用几秒」改长（最多到生成的 {s.genSeconds} 秒）
                          </p>
                        ) : null;
                      })()}
                      </>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {s.stage === "frame_ok" || s.stage === "video_ready" ? (
                      <button
                        className={mainAct === "video" ? primary : btn}
                        disabled={
                          busy ||
                          dirty ||
                          (!arkReady && !shotHasPeople(s)) ||
                          (!hfReady && shotHasPeople(s)) ||
                          wait > 0 ||
                          runBusy ||
                          (s.hook?.selfie && !s.hook.line?.trim())
                        }
                        onClick={() => open("video")}
                      >
                        {s.stage === "video_ready" ? "重做视频…" : "生成视频…"}
                      </button>
                      ) : null}
                      {(s.stage === "frame_ok" || s.stage === "video_ready") && (shotHasPeople(s) ? !hfReady : !arkReady) ? (
                        shotHasPeople(s) ? <NeedKey name="Higgsfield" anchor="higgsfield" /> : <NeedKey name="火山方舟" anchor="ark" />
                      ) : null}
                      {(() => {
                        const vc = s.videoCheck?.jobId === s.videoJobId ? s.videoCheck : undefined;
                        const bad = !!vc && !vc.pass && !vc.failed;
                        const still = (s.issues ?? []).some((x) => x.status === "still");
                        const unchecked = (s.issues ?? []).some((x) => x.status === "open");
                        return (
                          <>
                            {gate(bad || still ? "accept_force" : "accept", still ? "问题还在，仍然采用" : bad ? "我看过了，仍然采用" : vc && !vc.failed ? "采用" : "没自动检查：我逐秒看过了，采用", s.stage === "video_ready", unchecked)}
                            {vc && s.stage === "video_ready" ? (
                              vc.pass ? (
                                <span className="self-center text-xs text-emerald-300">视频检查通过：每 0.5 秒对照产品照，没看到变形{vc.note ? `。${vc.note}` : ""}</span>
                              ) : (
                                <div className={`w-full rounded border p-2 text-xs ${vc.failed ? "border-amber-400/40 text-amber-200" : "border-rose-400/50 bg-rose-400/5 text-rose-200"}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-medium">{vc.failed ? "视频检查" : `视频检查发现 ${vc.issues.length} 个问题，先看视频再决定`}</p>
                                    <button
                                      type="button"
                                      className="rounded border border-white/20 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-40"
                                      disabled={busy || runBusy || rechecking === s.id}
                                      title="只重新看视频，不重新出视频"
                                      onClick={async () => {
                                        setRechecking(s.id);
                                        apply(await recheckVideoAction(v.id, s.id));
                                        setRechecking(null);
                                      }}
                                    >
                                      {rechecking === s.id ? "正在重新检查…" : "重新检查（约 $0.05）"}
                                    </button>
                                  </div>
                                  {vc.issues.map((x, i) => (
                                    <p key={i}>· {x}</p>
                                  ))}
                                  {vc.note ? <p className="mt-1 text-amber-200">{vc.note}</p> : null}
                                </div>
                              )
                            ) : null}
                          </>
                        );
                      })()}
                      {(s.stage === "video_ready" || s.stage === "accepted") && s.videoJobId && s.frameJobId && s.hook?.scene !== "car" ? (
                        <LogoLockPanel videoId={v.id} shot={s} busy={busy} onResult={apply} />
                      ) : null}
                      {s.stage === "video_ready" && (s.issues ?? []).some((x) => x.status === "open") ? (
                        <span className="text-xs text-amber-300">先在下面逐条点「已解决」或「仍存在」，才能采用</span>
                      ) : null}
                      {s.stage === "video_ready" || s.stage === "accepted" ? (
                      <button
                        className={btn}
                        disabled={
                          busy ||
                          dirty ||
                          !saved
                        }
                        onClick={async () => {
                          const note = await askPrompt(
                            "这一版哪里不对？多条用分号隔开。新版出来后会逐条对照",
                          );
                          if (note === null) return;
                          if (!note.trim()) {
                            setMsg({ tone: "err", text: "没写哪里不对，所以没退回：再点「退回返工」写一句问题" });
                            return;
                          }
                          const all = await askConfirm(
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
                                      : it.status === "still"
                                        ? "text-rose-300"
                                        : "text-amber-200"
                                  }
                                >
                                  {it.status === "fixed" ? "已解决" : it.status === "still" ? "仍存在" : "待对照"}
                                </span>
                                <span className="text-neutral-200">
                                  {it.text}
                                </span>
                                <button
                                  className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-neutral-300 hover:bg-white/5"
                                  disabled={busy}
                                  title="点一下切换：只管这一镜 / 后面的镜头也提醒"
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
                                    ? "范围：整条视频"
                                    : "范围：只这一镜"}
                                </button>
                                {it.fromJobId ? (
                                  <a
                                    className="text-sky-300 underline"
                                    href={`/api/shorts/${it.fromJobId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    看出问题的那版
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
                                            "still",
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

      {(
      <section className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
        <h2 className="mb-2 text-sm font-semibold text-amber-300/90">
          预览与导出（免费，本机合成）
        </h2>
        <p className="mb-2 text-xs text-neutral-500">
          正式导出：每个勾选的开头各出一条「开头 + 正文」，裁成 1080×1920；预览只出一条（打开的那个开头，没打开就用勾选的第一个）。
          {exp.length ? ` 现在勾选了：${hookList.filter((h) => exp.includes(h.id)).map((h) => h.hook?.name).join("、")}。` : ""}
        </p>
        <label className="mb-1 flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={v.captions !== false}
            disabled={busy || dirty}
            onChange={(e) => act(() => saveShortVideoAction(v.id, { captions: e.target.checked }))}
          />
          整条视频加字幕（开头按 Hook 效果，正文用同款样式）
        </label>
        <label className="mb-1 flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={v.exportSound !== false}
            disabled={busy || dirty}
            onChange={(e) => act(() => saveShortVideoAction(v.id, { exportSound: e.target.checked }))}
          />
          成片带声音（关掉 = 整条静音；生成时没开声音的那几段本来就没声音）
        </label>
        {v.captions !== false && shots.some((s) => !s.hook && !s.caption.trim()) ? (
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-300">
            这几镜的字幕还空着，导出时不显示：
            {shots.filter((s) => !s.hook && !s.caption.trim()).map((s) => (
              <button key={s.id} className="underline hover:text-amber-100" onClick={() => setFocus(s.id)}>
                #{shots.indexOf(s) + 1}
              </button>
            ))}
          </p>
        ) : null}
        {shots.some((s) => !s.hook && s.stage !== "accepted") ? (
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-300">
            正文还没采用的镜头不会进成片，这次导出的不是完整版：
            {shots
              .filter((s) => !s.hook && s.stage !== "accepted")
              .map((s) => (
                <button key={s.id} className="underline hover:text-amber-100" onClick={() => setFocus(s.id)}>
                  #{shots.indexOf(s) + 1}
                </button>
              ))}
          </p>
        ) : null}
        {!v.shots.some((s) => s.stage === "accepted") ? (
          <p className="mb-2 text-xs text-neutral-400">还没有采用的镜头：先在镜头里点「采用」，才能导出</p>
        ) : null}
        <ExportGate
          videoId={v.id}
          projectId={v.projectId}
          report={exportReport(v, adFacts)}
          busy={busy}
          hasAccepted={v.shots.some((s) => s.stage === "accepted")}
          count={Math.max(1, exp.length)}
          run={(preview) =>
            new Promise<string>((done) =>
              start(async () => {
                const r = await renderShortAction(v.id, preview, focus);
                apply(r, preview ? "预览已更新（不完整）" : "成片已更新");
                if (!r.error && !preview) setFinalAt(new Date().toISOString());
                done(r.error ?? "");
              }),
            )
          }
        />
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
                  className="max-h-[35rem] rounded-lg"
                />
              </figure>
            ))}
          </div>
        ) : null}
        <ExportHistory videoId={v.id} refreshKey={finalAt} />
      </section>
      )}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {Object.entries(running).filter(([id]) => shots.some((x) => x.id === id)).map(([id, r]) => {
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
          videoId={v.id}
          pending={pending}
          shotIndex={shots.findIndex((s) => s.id === pending.shotId) + 1}
          busy={busy}
          onChange={(p) =>
            // 改原因时保留旧报价，不让审批框重绘、输入框失焦；300ms 后重新估价，服务器批准时还会再查一次
            setPending((cur) => (cur ? { ...cur, ...p, ...("reason" in p ? {} : { quote: null }) } : cur))
          }
          onCancel={() => setPending(null)}
          onFix={(c, ai) => fixConflict(pending.shotId, c, ai)}
          onApprove={async () => {
            const p = pending;
            if (!p.quote) return;
            const cur = shots.find((x) => x.id === p.shotId);
            const loss = cur ? replaceLoss(st.jobs, cur, p.kind) : 0;
            if (loss > 0 && !await askConfirm(`这一镜已经有${p.kind === "video" ? "视频" : "首帧"}，新的出来后会替换掉它：会丢掉 ${usd(loss)} 的结果。\n\n旧的进回收站，可以恢复。确定生成吗？`)) return;
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
          {job.status === "failed" ? "失败·不收费" : job.status === "unknown" ? "结果不确定·可能已扣费" : job.status === "abandoned" ? "已放弃·按已扣费记账" : "生成中"}
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
  videoId,
  pending,
  shotIndex,
  busy,
  onChange,
  onCancel,
  onFix,
  onApprove,
}: {
  videoId: string;
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
        {!q && pending.quoteErr ? (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-red-300">还不能生成：{pending.quoteErr}</p>
        ) : !q ? (
          <p className="text-neutral-400">估价中（免费）…</p>
        ) : (
          <div className="space-y-1 rounded-lg border border-white/10 p-3 text-xs">
            {row("模型", videoModelLabel(q.model))}
            {row("分辨率", q.resolution)}
            {pending.kind === "video" ? row("时长", `${q.seconds} 秒`) : null}
            {row(
              "单价",
              pending.kind === "video"
                ? `$${q.unitUsd}/秒`
                : `$${q.unitUsd}/张`,
            )}
            {row("本次费用", usd(q.costUsd), "text-amber-300 font-semibold")}
            {pending.kind === "frame"
              ? row("看图检查", "出图后自动看 1 次：对照提示词和 3D（Gemini 约 $0.01；Gemini 不能用时换 K3，约 $0.05–$0.10；另算）")
              : null}
            {row("这是本镜第几次", `第 ${q.attempt} 次`)}
            {row("本镜累计（含本次）", usd(q.shotSpent + q.costUsd))}
            {row(q.extraHook ? "这个开头累计（含本次）" : "本条视频累计（含本次）", usd(q.videoSpent + q.costUsd))}
            {row(
              q.extraHook ? "这个开头的预算 / 余量" : "预算 / 余量",
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
          <OverLimitApproval videoId={videoId} shotId={pending.shotId} kind={pending.kind} usd={q.costUsd} approved={pending.overLimit} onApproved={(ok) => onChange({ overLimit: ok })} />
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
