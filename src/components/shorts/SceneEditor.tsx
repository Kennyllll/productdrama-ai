"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { aiSceneAction, createSceneAction, saveSceneVersionAction, sceneConflictsAction, setShotSceneAction } from "@/app/scene-actions";
import { quoteJobAction, runJobAction } from "@/app/short-actions";
import type { Quote } from "@/lib/shorts";
import { findItemType, ITEM_TYPES, newItem, sceneBounds, THEMES, type Scene, type SceneItem, type ShotScene } from "@/lib/shorts-scenes";

export interface ShotBinding {
  code: string;
  label: string;
  scene: ShotScene;
  family: number;
  special: string;
  /** 有值 = 不能改（顺序未到 / 构图已确认） */
  locked?: string;
}

const inp = "rounded border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white disabled:opacity-50";
const hex = (c: number[]) => `#${c.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
const rgbOf = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

export function SceneEditor({ projectId, videoId, shot, scenes, onDraft }: { projectId: string; videoId: string; shot: ShotBinding; scenes: Scene[]; onDraft: (items: SceneItem[] | null) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const sc = scenes.find((s) => s.id === shot.scene.id) ?? scenes[0];
  const ver = sc.versions.find((v) => v.v === shot.scene.v) ?? sc.versions[sc.versions.length - 1];
  const latestV = sc.versions[sc.versions.length - 1].v;
  const [family, setFamily] = useState(shot.family);
  const [special, setSpecial] = useState(shot.special);
  const [edit, setEdit] = useState<SceneItem[] | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [meta, setMeta] = useState({ name: sc.name, description: sc.description, special: sc.special });
  const [sel, setSel] = useState<string | null>(null);
  const [ai, setAi] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState<Quote | null>(null);
  const [reason, setReason] = useState("");
  const locked = shot.locked;
  const openQuote = (r = reason) =>
    start(async () => {
      const x = await quoteJobAction(videoId, shot.code, "scene", 0, r, false);
      if (x.error || !x.result) return setMsg(`⚠ ${x.error}`);
      setQ(x.result);
    });

  useEffect(() => {
    setFamily(shot.family);
    setSpecial(shot.special);
    setEdit(null);
    setIsNew(false);
    setMeta({ name: sc.name, description: sc.description, special: sc.special });
  }, [shot.code, shot.family, shot.special, sc.id, sc.name, sc.description, sc.special, ver.v]);

  useEffect(() => onDraft(edit ? edit.filter((i) => !i.theme || i.theme === shot.scene.theme) : null), [edit, shot.scene.theme, onDraft]);

  const run = (f: () => Promise<{ error?: string }>, ok?: string) =>
    start(async () => {
      setMsg("");
      const r = await f();
      if (r.error) setMsg(`⚠ ${r.error}`);
      else {
        if (ok) setMsg(ok);
        router.refresh();
      }
    });

  const bind = (patch: Parameters<typeof setShotSceneAction>[2]) => run(() => setShotSceneAction(videoId, shot.code, patch), "已保存本镜场地设置");

  const saveVersion = () =>
    start(async () => {
      if (!edit) return;
      setMsg("");
      const c = await sceneConflictsAction(sc.id, edit);
      if (c.error) return setMsg(`⚠ ${c.error}`);
      if (c.result?.length && !await askConfirm(`这些已锁定镜头的画面里能看到被改动的物件（它们继续用旧版本，不受影响，但新旧画面会对不上）：\n${c.result.join("\n")}\n\n仍然存成新版本吗？取消后可以改用「另存为新场地」。`)) return;
      const r = await saveSceneVersionAction(sc.id, edit, `修改（基于 v${ver.v}）`, meta, locked ? undefined : { videoId, shotId: shot.code });
      if (r.error) return setMsg(`⚠ ${r.error}`);
      setMsg(`已存为 v${r.result}${locked ? "" : "，本镜已改用新版本（3D 构图需要重新保存）"}`);
      setEdit(null);
      router.refresh();
    });

  const saveNew = () =>
    run(async () => {
      if (!edit) return {};
      const r = await createSceneAction(projectId, { ...meta, outdoor: edit.some((i) => findItemType(i.type).outdoor), items: edit }, locked ? undefined : { videoId, shotId: shot.code });
      if (!r.error) {
        setEdit(null);
        setIsNew(false);
      }
      return r;
    }, "已存为新场地");

  const selItem = edit?.find((i) => i.id === sel) ?? null;
  const patchSel = (p: Partial<SceneItem>) => setEdit((e) => e && e.map((i) => (i.id === sel ? { ...i, ...p } : i)));

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-neutral-900/60 p-3 text-sm text-neutral-200">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-white">{shot.label} 的场地</b>
        <span className="text-[11px] text-neutral-500">（选完自动保存）</span>
        <select className={inp} disabled={pending || Boolean(locked)} value={sc.id} onChange={(e) => bind({ sceneId: e.target.value })}>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className={inp} disabled={pending || Boolean(locked)} value={ver.v} onChange={(e) => bind({ v: Number(e.target.value) })}>
          {sc.versions.map((v) => (
            <option key={v.v} value={v.v}>
              v{v.v} · {v.note}
            </option>
          ))}
        </select>
        <span className="rounded border border-white/10 px-2 py-1 text-xs text-neutral-300" title="节日跟整条视频走，在视频页「视频设定」里改">
          节日：{THEMES.find((t) => t.id === shot.scene.theme)?.label ?? "无节日"}
          {shot.scene.theme === "custom" && shot.scene.themeText ? `（${shot.scene.themeText}）` : ""}
          <span className="text-neutral-500">（整条视频统一）</span>
        </span>
        <select className={inp} disabled={pending || Boolean(locked)} value={family} onChange={(e) => bind({ family: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              家庭 {n}
            </option>
          ))}
        </select>
        {ver.v !== latestV && !locked ? <span className="text-xs text-amber-300">有新版本 v{latestV}，可在版本里切换</span> : null}
      </div>
      {locked ? <p className="text-xs text-neutral-500">{locked}（场地版本已锁定，仍可查看和另存新场地）</p> : null}
      <label className="flex items-start gap-2">
        <span className="pt-1">本镜特殊要求</span>
        <textarea className={`${inp} min-h-12 flex-1`} disabled={Boolean(locked)} value={special} onChange={(e) => setSpecial(e.target.value)} placeholder="例如：画面里不要出现宠物；窗外在下雪" />
        <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={pending || Boolean(locked) || special === shot.special} onClick={() => bind({ special })}>
          保存
        </button>
      </label>
      <p className="text-xs text-neutral-500">
        家庭：同一家庭沿用演员和服装；换成另一个家庭时，旧演员的画面不当参考，只保持同一个产品。回到用过的场地会参考该场地最后一个已采用镜头；全新场地{ver.refJobId ? "用它的空场景参考图" : "只靠描述和 3D 模型（可选生成 $0.10 空场景参考图）"}。
      </p>

      <div className="flex flex-wrap items-start gap-3 border-t border-white/10 pt-3">
        {ver.refJobId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/shorts/${ver.refJobId}`} alt="空场景参考图" className="h-40 rounded border border-white/10" />
        ) : null}
        <div className="flex-1 space-y-1">
          <b className="text-white">空场景参考图</b>
          <p className="text-xs text-neutral-400">
            {ver.refJobId
              ? `已有${ver.refFromV ? `（来自 v${ver.refFromV}，模型改过之后可能对不上）` : `（v${ver.v}）`}：这个场地还没有已采用镜头时，首帧用它锁住装修风格。`
              : "可选：按场地模型、描述和主题生成一张没人的房间照片，第一镜就锁住装修风格。不生成就只靠描述和 3D 模型。"}
          </p>
          {!q ? (
            <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={pending || Boolean(edit)} onClick={() => openQuote()}>
              {ver.refJobId ? "重新生成…（先看价格）" : "生成空场景参考图…（先看价格）"}
            </button>
          ) : (
            <div className="space-y-1 rounded border border-amber-400/40 bg-amber-400/5 p-2 text-xs">
              <b className="text-amber-200">花钱审批 · 场地参考图 · {sc.name} v{ver.v}（{THEMES.find((t) => t.id === shot.scene.theme)?.label}）</b>
              <div>
                Sunburst 2k 竖版 · 本次 <b>${q.costUsd.toFixed(2)}</b> · 本条视频已花 ${q.videoSpent.toFixed(2)} / 预算 ${q.budget.toFixed(2)}，花后剩 ${q.remainingAfter.toFixed(2)}，约 ${q.perSecondAfter.toFixed(2)}/秒
              </div>
              {q.needsReason ? (
                <input className={`${inp} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => openQuote()} placeholder="重做原因（至少 4 个字）" />
              ) : null}
              {q.warnings.map((w) => (
                <p key={w} className="text-amber-300">
                  ⚠ {w}
                </p>
              ))}
              {q.blocked.map((w) => (
                <p key={w} className="text-red-300">
                  ✕ {w}
                </p>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-amber-400 px-2 py-1 font-medium text-black disabled:opacity-40"
                  disabled={pending || q.blocked.length > 0}
                  onClick={() =>
                    start(async () => {
                      setMsg(`场地参考图生成中…（$${q.costUsd.toFixed(2)}）关掉页面也不会重复扣费`);
                      const r = await runJobAction(videoId, shot.code, "scene", 0, reason, false, q.costUsd);
                      setQ(null);
                      setMsg(r.error ? `⚠ ${r.error}（未完成的任务在工作台里「继续等待」，不要重复提交）` : "场地参考图已生成");
                      router.refresh();
                    })
                  }
                >
                  批准，花 ${q.costUsd.toFixed(2)} 生成
                </button>
                <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => setQ(null)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <b className="text-white">场地模型</b>
        {!edit ? (
          <>
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => (setEdit(ver.items.map((i) => ({ ...i }))), setIsNew(false))}>
              修改模型（存为新版本）
            </button>
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => (setEdit(ver.items.map((i) => ({ ...i }))), setIsNew(true), setMeta({ ...meta, name: `${sc.name} 副本` }))}>
              复制为新场地
            </button>
          </>
        ) : (
          <>
            <button type="button" className="rounded bg-amber-400 px-2 py-1 font-medium text-black disabled:opacity-40" disabled={pending} onClick={isNew ? saveNew : saveVersion}>
              {isNew ? "保存为新场地" : `存为 v${latestV + 1}`}
            </button>
            {!isNew ? (
              <button type="button" className="rounded bg-white/10 px-2 py-1" disabled={pending} onClick={() => setIsNew(true)}>
                改为另存新场地
              </button>
            ) : null}
            <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => (setEdit(null), setIsNew(false))}>
              放弃修改
            </button>
            <select
              aria-label="从某个版本开始改"
              className={inp}
              value=""
              onChange={(e) => {
                const from = sc.versions.find((x) => x.v === Number(e.target.value));
                if (from) setEdit(from.items.map((i) => ({ ...i })));
              }}
            >
              <option value="">从某个版本开始改…</option>
              {sc.versions.map((v) => (
                <option key={v.v} value={v.v}>
                  v{v.v} · {v.note}
                </option>
              ))}
            </select>
          </>
        )}
        <input className={`${inp} min-w-64 flex-1`} value={ai} onChange={(e) => setAi(e.target.value)} placeholder="一句话：沙发换到窗户下面，加一个书架 / 新建：木地板客厅，有楼梯" />
        <button
          type="button"
          className="rounded bg-sky-500/80 px-2 py-1 text-black disabled:opacity-40"
          disabled={pending || ai.trim().length < 2}
          onClick={() =>
            start(async () => {
              setMsg("AI 正在改模型（DeepSeek 文字调用，不出图）…");
              const r = await aiSceneAction(projectId, ai, sc.id, ver.v);
              if (r.error || !r.result) return setMsg(`⚠ ${r.error}`);
              setEdit(r.result.items);
              setMeta((m) => ({ ...m, description: r.result!.description || m.description }));
              setMsg("AI 改好了，看 3D 预览，满意再保存");
            })
          }
        >
          AI 改这个场地
        </button>
        <button
          type="button"
          className="rounded bg-sky-500/40 px-2 py-1 disabled:opacity-40"
          disabled={pending || ai.trim().length < 2}
          onClick={() =>
            start(async () => {
              setMsg("AI 正在生成新场地模型…");
              const r = await aiSceneAction(projectId, ai);
              if (r.error || !r.result) return setMsg(`⚠ ${r.error}`);
              setEdit(r.result.items);
              setIsNew(true);
              setMeta({ name: r.result.name, description: r.result.description, special: "" });
              setMsg("新场地已生成，满意后点「保存为新场地」");
            })
          }
        >
          AI 新建场地
        </button>
      </div>
      {msg ? <p className="text-xs text-amber-200">{msg}</p> : null}

      {edit ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <TopMap items={edit} theme={shot.scene.theme} sel={sel} onSel={setSel} onMove={(id, x, y) => setEdit((e) => e && e.map((i) => (i.id === id ? { ...i, x, y } : i)))} />
          <div className="space-y-2">
            <label className="block">
              场地名称 <input className={`${inp} w-full`} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
            </label>
            <label className="block">
              描述（写进提示词）<textarea className={`${inp} w-full`} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </label>
            <label className="block">
              场地特殊要求 <textarea className={`${inp} w-full`} value={meta.special} onChange={(e) => setMeta({ ...meta, special: e.target.value })} placeholder="每一镜都要遵守" />
            </label>
            <div className="flex gap-2">
              <select id="add-type" className={`${inp} flex-1`} defaultValue="sofa">
                {ITEM_TYPES.filter((t) => t.id !== "box").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded bg-white/10 px-2 py-1"
                onClick={async () => {
                  const t = (document.getElementById("add-type") as HTMLSelectElement).value;
                  const it = newItem(t, 1.5, 1.5, shot.scene.theme !== "none" && await askConfirm(`作为「${THEMES.find((x) => x.id === shot.scene.theme)?.label}」主题装饰（换主题时不出现）？`) ? shot.scene.theme : undefined);
                  setEdit((e) => e && [...e, it]);
                  setSel(it.id);
                }}
              >
                添加
              </button>
            </div>
            {selItem ? (
              <div className="space-y-1 rounded border border-white/10 p-2">
                <div className="flex items-center justify-between">
                  <b>{findItemType(selItem.type).label}{selItem.theme ? `（${THEMES.find((t) => t.id === selItem.theme)?.label ?? selItem.theme}装饰）` : ""}</b>
                  <button type="button" className="text-red-300" onClick={() => (setEdit((e) => e && e.filter((i) => i.id !== sel)), setSel(null))}>
                    删除
                  </button>
                </div>
                {(["x", "y", "z", "w", "d", "h", "yaw"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-16">{{ x: "东西 x", y: "南北 y", z: "离地 z", w: "宽", d: "深", h: "高", yaw: "朝向°" }[k]}</span>
                    <input
                      type="range"
                      className="flex-1"
                      min={k === "yaw" ? -180 : k === "x" || k === "y" ? -12 : 0}
                      max={k === "yaw" ? 180 : k === "x" || k === "y" ? 12 : k === "z" ? 3 : 8}
                      step={k === "yaw" ? 5 : 0.05}
                      value={selItem[k]}
                      onChange={(e) => patchSel({ [k]: Number(e.target.value) })}
                    />
                    <span className="w-10 text-right">{selItem[k].toFixed(k === "yaw" ? 0 : 2)}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-xs">
                  颜色 <input type="color" value={hex(selItem.rgb)} onChange={(e) => patchSel({ rgb: rgbOf(e.target.value) })} />
                </label>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">点俯视图里的物件选中，拖动挪位置；右边滑块改尺寸和朝向。左边 3D 画面实时预览，保存前不影响任何镜头。</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopMap({ items, theme, sel, onSel, onMove }: { items: SceneItem[]; theme: string; sel: string | null; onSel: (id: string | null) => void; onMove: (id: string, x: number, y: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const shown = useMemo(() => [...items].filter((i) => !i.theme || i.theme === theme).sort((a, b) => (a.type === "floor" || a.type === "lawn" || a.type === "path" ? -1 : 0) - (b.type === "floor" || b.type === "lawn" || b.type === "path" ? -1 : 0)), [items, theme]);
  const b = sceneBounds(items);
  const pad = 1;
  const vb = `${b.x0 - pad} ${-b.y1 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`;
  const pt = (e: React.PointerEvent) => {
    const m = ref.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: -p.y };
  };
  return (
    <svg
      ref={ref}
      viewBox={vb}
      className="h-[420px] w-full touch-none rounded-lg bg-neutral-950"
      onPointerMove={(e) => {
        if (!drag.current) return;
        const p = pt(e);
        onMove(drag.current.id, Math.round((p.x - drag.current.dx) * 20) / 20, Math.round((p.y - drag.current.dy) * 20) / 20);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
      onPointerDown={(e) => e.target === ref.current && onSel(null)}
    >
      {shown.map((i) => (
        <g
          key={i.id}
          transform={`translate(${i.x} ${-i.y}) rotate(${-i.yaw})`}
          onPointerDown={(e) => {
            e.stopPropagation();
            const p = pt(e);
            onSel(i.id);
            drag.current = { id: i.id, dx: p.x - i.x, dy: p.y - i.y };
          }}
          className="cursor-move"
        >
          <rect x={-i.w / 2} y={-i.d / 2} width={i.w} height={Math.max(i.d, 0.04)} fill={hex(i.rgb)} fillOpacity={i.type === "floor" || i.type === "lawn" ? 0.35 : 0.85} stroke={i.id === sel ? "#fbbf24" : i.theme ? "#f472b6" : "#000"} strokeWidth={i.id === sel ? 0.06 : 0.02} />
          {i.w > 0.5 && i.type !== "floor" && i.type !== "wall" ? (
            <text x={0} y={0.08} fontSize={0.22} textAnchor="middle" fill="#fff" pointerEvents="none" transform={`rotate(${i.yaw})`}>
              {findItemType(i.type).label}
            </text>
          ) : null}
        </g>
      ))}
      <circle cx={0} cy={0} r={0.18} fill="#ef4444" pointerEvents="none" />
      <text x={0} y={0.5} fontSize={0.22} textAnchor="middle" fill="#fca5a5" pointerEvents="none">
        产品
      </text>
      <text x={b.x0 - 0.8} y={-b.y1 - 0.5} fontSize={0.25} fill="#888">
        北 ↑
      </text>
    </svg>
  );
}
