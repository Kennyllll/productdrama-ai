"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveShortAngleAction, saveShortCompAction, saveShortLayoutAction, setShotFilmerAction, setShotOperatorAction } from "@/app/short-actions";
import { OperatorPicker } from "@/components/shorts/OperatorPicker";
import { filmerScale } from "@/lib/families";
import type { SetLayout } from "@/lib/production-repo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductRig } from "@/lib/figures";
import { Set3D, type SetShot } from "@/components/production/Set3D";
import { SceneEditor, type ShotBinding } from "@/components/shorts/SceneEditor";
import { ShotSyncBox } from "@/components/shorts/ShotSyncBox";
import { StageEditor } from "@/components/shorts/StageEditor";

export interface StageProps {
  locked?: string;
  layout: SetLayout;
  scene: { id: string; name: string; v: number; theme: string; themeLabel: string };
  items: SceneItem[];
  members?: CastOption[];
}
import type { CastOption } from "@/lib/families";
import { activeItems, type Scene, type SceneItem } from "@/lib/shorts-scenes";
import type { FigureSpec } from "@/lib/figures";

export function ShortSet({
  projectId,
  videoId,
  shots,
  bindings,
  scenes,
  sceneItems,
  glbUrl,
  rig,
  initialCode,
  operators,
  filmers = {},
  autoCapture,
  nextCode,
  modelId,
  stage,
  initialSel,
}: {
  projectId: string;
  videoId: string;
  shots: SetShot[];
  bindings: ShotBinding[];
  scenes: Scene[];
  sceneItems: Record<string, SceneItem[]>;
  glbUrl: string | null;
  modelId: string | null;
  rig: ProductRig | null;
  initialCode: string;
  /** 每镜拍摄者入镜设置（空 = 不入镜） */
  operators: Record<string, string>;
  /** 每镜谁拿手机：value = 镜头自己设的；h = 现在拿手机的人身高（厘米）；dflt = 视频设定里的人 */
  filmers?: Record<string, { value: string; h?: number; dflt: string; options: { id: string; label: string }[] }>;
  autoCapture?: boolean;
  /** 自动保存完这一镜后接着自动保存哪一镜（开头切镜后的第二段） */
  nextCode?: string;
  title: string;
  /** 摆放编辑器每镜要用的数据 */
  stage: Record<string, StageProps>;
  initialSel?: string;
}) {
  const [code, setCode] = useState(shots.some((s) => s.code === initialCode) ? initialCode : shots[0]?.code ?? "");
  const [draft, setDraft] = useState<SceneItem[] | null>(null);
  const [live, setLive] = useState<{ figures: FigureSpec[]; bike?: [number, number]; bikeYaw: number; bikeLift: number; bikePitch: number; bikeRoll: number; bikeGround: number; items: SceneItem[] } | null>(null);
  const [cap, setCap] = useState(0);
  const [stageSave, setStageSave] = useState(0);
  const [tip, setTip] = useState(false);
  useEffect(() => setTip(!localStorage.getItem("pd-3d-tip")), []);
  const [stageDirty, setStageDirty] = useState(false);
  const [camDirty, setCamDirty] = useState(false);
  const dirty = stageDirty || camDirty;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // 点页面里的链接（返回镜头、左侧导航等）离开时也提醒
    const click = async (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      if (await askConfirm("摆放或机位有改动还没保存，离开会丢掉。确定离开？")) {
        window.removeEventListener("beforeunload", warn);
        window.location.href = a.href;
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("click", click, true);
    };
  }, [dirty]);
  const onDraft = useCallback((items: SceneItem[] | null) => setDraft(items), []);
  const onDocChange = useCallback((d: { figures: FigureSpec[]; bike?: [number, number]; bikeYaw: number; bikeLift: number; bikePitch: number; bikeRoll: number; bikeGround: number; items: SceneItem[] }) => setLive(d), []);
  const st = stage[code];
  const items = useMemo(() => {
    if (live && st) return { ...sceneItems, [code]: activeItems(live.items, st.scene.theme) };
    return draft ? { ...sceneItems, [code]: draft } : sceneItems;
  }, [draft, live, sceneItems, code, st]);
  const liveLayout = useMemo(() => (live ? { figures: live.figures, bike: live.bike, bikeYaw: live.bikeYaw, bikeLift: live.bikeLift, bikePitch: live.bikePitch, bikeRoll: live.bikeRoll, bikeGround: live.bikeGround } : null), [live]);
  const b = bindings.find((x) => x.code === code);
  const [ops, setOps] = useState(operators);
  const [opMsg, setOpMsg] = useState("");
  const router = useRouter();
  // 连续改几项时按顺序存，免得后发的请求先到、被旧值覆盖
  const opChain = useRef<Promise<unknown>>(Promise.resolve());
  // 拍摄者变了：服务器已清掉旧构图，先在本地放开“保存机位”，不用等页面刷新
  const [recap, setRecap] = useState<Record<string, boolean>>({});
  const shotsView = useMemo(() => shots.map((s) => (recap[s.code] ? { ...s, needsCapture: true } : s)), [shots, recap]);
  const saveOp = (c: string, op: string) => {
    setOps((o) => ({ ...o, [c]: op }));
    setOpMsg("");
    opChain.current = opChain.current.then(() => setShotOperatorAction(videoId, c, op)).then((r) => {
      setOpMsg(r.error ? `⚠ ${r.error}` : r.recapture ? "已保存。3D 构图里的拍摄者变了，点“保存机位”重新保存构图" : "已保存（写进首帧和视频提示词）");
      if (r.recapture) {
        setRecap((x) => ({ ...x, [c]: true }));
        router.refresh();
      }
    });
  };
  const [fv, setFv] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(filmers).map(([k, x]) => [k, x.value])));
  const saveFilmer = (c: string, val: string) => {
    setFv((o) => ({ ...o, [c]: val }));
    setOpMsg("");
    opChain.current = opChain.current.then(() => setShotFilmerAction(videoId, c, val)).then((r) => {
      setOpMsg(r.error ? `⚠ ${r.error}` : "已保存拿手机的人（写进首帧和视频提示词；选姿态时机位高度按他的身高）");
      if (!r.error) router.refresh();
    });
  };
  const operatorBox = (c: string, locked: boolean, api: { layout: SetLayout; setCamH: (h: number) => void }) => (
    <div className="block">
      拍摄者（先选姿态，露什么按机位自动算）<span className="ml-1 text-[11px] text-neutral-500">· 选完自动保存</span>
      {filmers[c]?.options.length ? (
        <label className="mt-1 flex items-center gap-1">
          谁拿手机：
          <select value={fv[c] ?? ""} disabled={locked} onChange={(e) => saveFilmer(c, e.target.value)} className="rounded border border-white/10 bg-neutral-950 px-1 py-0.5 text-white">
            <option value="">跟视频设定（{filmers[c].dflt}）</option>
            {filmers[c].options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="none">不指定（只写“拍摄的人”）</option>
          </select>
        </label>
      ) : null}
      <div className="mt-1">
        <OperatorPicker value={ops[c] ?? ""} disabled={locked} layout={api.layout} onChange={(v) => saveOp(c, v)} onPose={api.setCamH} scale={filmerScale(filmers[c]?.h)} />
      </div>
      <span className="mt-1 block text-[11px] text-neutral-500">选姿态会把机位高度设成这个姿态的默认值，改完记得保存机位和 3D 构图。拿手机的人最多露一只手，不露脸。{opMsg}</span>
    </div>
  );
  const stageKey = st ? `${code}:${st.scene.id}:${st.scene.v}:${JSON.stringify([st.layout.figures ?? null, st.layout.bike ?? null, st.layout.bikeYaw ?? 0, st.layout.bikeLift ?? 0, st.layout.bikePitch ?? 0, st.layout.bikeRoll ?? 0])}` : code;
  const cur = shotsView.find((s) => s.code === code);
  const lockedMsg = st?.locked ?? cur?.locked;
  const canSave = !lockedMsg && (dirty || Boolean(cur && (!cur.edited || cur.needsCapture)));
  const goShot = async (c: string) => {
    if (c === code) return;
    if (dirty && !await askConfirm("这个镜头的修改还没保存，切换会丢掉。确定切换？")) return;
    setCode(c);
  };
  const saveAll = () => (stageDirty ? setStageSave((n) => n + 1) : setCap((n) => n + 1));
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-neutral-950/95 p-2 backdrop-blur">
        <Link href={`/projects/${projectId}/shorts/${videoId}?shot=${code}`} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/5">
          ← 回到镜头
        </Link>
        <div className="flex flex-wrap gap-1">
          {shotsView.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => goShot(s.code)}
              className={`rounded-lg border px-3 py-1 text-sm ${s.code === code ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-white/10 text-neutral-400 hover:bg-white/5"}`}
            >
              {s.label ?? s.code}
              {s.locked ? <span className="ml-1 text-[10px] text-neutral-500">已确认</span> : null}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-neutral-400">{lockedMsg ? "" : dirty ? "有改动未保存" : canSave ? "这一镜的构图还没保存" : "已保存"}</span>
        <button type="button" disabled={!canSave} onClick={saveAll} className="rounded-lg bg-amber-400 px-5 py-1.5 text-sm font-medium text-black disabled:opacity-40">
          保存
        </button>
      </div>
      {lockedMsg ? (
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">这一镜已确认，只能看。要改请回到镜头，点「退回构图」。</p>
      ) : tip ? (
        <p className="flex items-center gap-3 rounded-lg border border-sky-400/30 bg-sky-400/5 px-3 py-2 text-sm text-sky-100">
          <span>① 左边「模型」：点人或车，拖箭头、选姿势　② 右边「镜头」：拖地图上的黄点调机位　③ 点「保存」</span>
          <button type="button" onClick={() => (localStorage.setItem("pd-3d-tip", "1"), setTip(false))} className="ml-auto text-xs text-neutral-400 hover:text-white">
            知道了
          </button>
        </p>
      ) : null}
      {b && st ? (
        <details className="rounded-xl border border-white/10 bg-neutral-900/60">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm text-neutral-300">
            场地：{st.scene.name} v{st.scene.v} · 主题：{st.scene.themeLabel} · 家庭 {b.family} <span className="ml-1 text-amber-300">更改</span>
          </summary>
          <SceneEditor projectId={projectId} videoId={videoId} shot={b} scenes={scenes} onDraft={onDraft} />
        </details>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 rounded-xl border border-white/10 p-3">
          <h2 className="mb-2 text-sm font-medium text-white">
            模型 <span className="text-xs font-normal text-neutral-400">人、车、家具放在哪、什么姿势</span>
          </h2>
          {st ? (
            <StageEditor
              key={stageKey}
              compact
              saveSignal={stageSave}
              videoId={videoId}
              shotCode={code}
              shotLabel={b?.label ?? ""}
              shots={[]}
              locked={st.locked}
              layout={st.layout}
              scene={st.scene}
              items={st.items}
              members={st.members}
              glbUrl={glbUrl}
              modelId={modelId}
              rig={rig}
              initialSel={initialSel}
              backHref={`/projects/${projectId}/shorts/${videoId}/set?shot=${code}`}
              onDocChange={onDocChange}
              onSaved={() => setCap((n) => n + 1)}
              onDirty={setStageDirty}
            />
          ) : null}
        </section>
        <section className="min-w-0 space-y-3 rounded-xl border border-sky-400/20 p-3">
          <h2 className="text-sm font-medium text-white">
            镜头 <span className="text-xs font-normal text-neutral-400">摄影机放在哪、拍成什么样</span>
          </h2>
          <Set3D
            compact
            activeCode={code}
            projectId={projectId}
            episode={0}
            shots={shotsView}
            mapProps={[]}
            sceneItems={items}
            glbUrl={glbUrl}
            rig={rig}
            initialCode={code}
            codePrefix="#"
            onShotChange={(c) => (setCode(c), setDraft(null), setLive(null), setStageDirty(false), window.history.replaceState(window.history.state, "", `?shot=${c}`))}
            onSave={(c, layout) => saveShortLayoutAction(videoId, c, layout)}
            onCapture={async (c, png) => {
              const r = await saveShortCompAction(videoId, c, png);
              if (autoCapture && nextCode && c === initialCode) window.location.href = `?shot=${nextCode}&capture=1`;
              return r;
            }}
            onCaptureProduct={(c, png) => saveShortAngleAction(videoId, c, png)}
            moveExtra={operatorBox}
            operators={ops}
            autoCapture={autoCapture && cap === 0}
            live={liveLayout}
            captureSignal={cap}
            onDirty={setCamDirty}
            otherDirty={stageDirty}
          />
          {code ? <ShotSyncBox videoId={videoId} shotId={code} label={b?.label ?? ""} figIds={(st?.layout.figures ?? []).map((f) => f.id)} /> : null}
          {cur ? (
            <details className="rounded-xl border border-white/10 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
              <summary className="cursor-pointer select-none">镜头描述</summary>
              <p className="mt-2 leading-relaxed text-neutral-300">{cur.title}</p>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}
