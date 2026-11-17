"use client";

// 产品资料里的建模素材：白底 10 面照 → AI 建白模；车身贴纸（多张 + 位置）；颜色款（实物照 → 给白模贴色）。
// 花钱的两步（建白模、贴色）都先看价格、点同意才提交；结果先进「待审核」。
import { askConfirm } from "@/components/ConfirmHost";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addColorAction,
  clearUnknownJobAction,
  deleteCandidateAction,
  deleteColorAction,
  pollModelJobAction,
  quoteModelAction,
  reuseAssetAction,
  startModelAction,
  type ModelQuote,
} from "@/app/model-actions";
import { Tag } from "@/components/ui";
import { COLOR_REQUIRED, PROVIDERS, STICKER_SPOTS, WHITE_ANGLES, type Target } from "@/lib/fal-catalog";
import type { KitAsset, KitData } from "@/lib/product-kit";

const btn = "rounded-md border border-white/15 px-2.5 py-1 text-xs text-neutral-200 hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40";
const field = "rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none";

const MODEL_STATUS: Record<string, string> = { review: "待审核", approved: "在用", rejected: "不通过" };
const JOB_STATUS: Record<string, string> = { submitting: "提交中", submitted: "生成中", done: "已完成", failed: "失败", unknown: "状态不明" };

async function uploadOne(projectId: string, kind: string, angle: string, files: FileList | File[], extra: Record<string, string> = {}): Promise<string> {
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("angle", angle);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  Array.from(files).forEach((f) => fd.append("file", f));
  try {
    const res = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: fd });
    const d = (await res.json()) as { added: number; errors: string[] };
    return d.errors.length ? d.errors.join("；") : "";
  } catch {
    return "上传失败：无法连接本地服务";
  }
}

async function removeAsset(id: string) {
  await fetch(`/api/assets/${id}`, { method: "DELETE" });
}

/** 10 个格子，每格一面；点空格子上传，已传的可替换 / 删除 */
export function PhotoSlots({
  projectId,
  kind,
  colorId,
  assets,
  required,
  library = [],
}: {
  projectId: string;
  kind: "white_photo" | "color_photo";
  colorId?: string;
  assets: KitAsset[];
  required: string[];
  library?: KitAsset[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [pickId, setPickId] = useState(library[0]?.id ?? "");
  const [pickAngle, setPickAngle] = useState<string>(WHITE_ANGLES.find((a) => !assets.some((x) => x.angle === a)) ?? WHITE_ANGLES[0]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const got = assets.length;
  return (
    <div>
      <p className="mb-2 text-xs text-neutral-400">
        已传 {got}/10 · <span className="text-amber-200">★</span> 必传{got < 10 ? "，其余选传，多传审核和出首帧更准" : ""}
      </p>
      <ul className="grid max-w-2xl grid-cols-5 gap-2">
        {WHITE_ANGLES.map((a) => {
          const f = assets.find((x) => x.angle === a);
          return (
            <li key={a} className="text-center">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => inputs.current[a]?.click()}
                title={f ? "点击替换" : "点击上传"}
                className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-white/5 text-[11px] ${f ? "border-white/10" : required.includes(a) ? "border-dashed border-amber-400/60 text-amber-200" : "border-dashed border-white/15 text-neutral-500"}`}
              >
                {f ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/assets/${f.id}`} alt={a} className="h-full w-full bg-white object-contain" />
                ) : busy === a ? (
                  "上传中…"
                ) : (
                  "＋ 上传"
                )}
              </button>
              <input
                ref={(el) => {
                  inputs.current[a] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const fl = e.target.files;
                  if (!fl?.length) return;
                  setBusy(a);
                  setErr(await uploadOne(projectId, kind, a, fl, colorId ? { colorId } : {}));
                  e.target.value = "";
                  setBusy(null);
                  router.refresh();
                }}
              />
              <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-neutral-400">
                {required.includes(a) ? <span className="text-amber-200">★</span> : null}
                {a}
                {f ? (
                  <button
                    type="button"
                    className="text-rose-300"
                    aria-label={`删除${a}`}
                    onClick={async () => {
                      if (!await askConfirm(`删除「${a}」这张？`)) return;
                      await removeAsset(f.id);
                      router.refresh();
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      {library.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-2 text-xs text-neutral-400">
          <span>从已传的产品照片里选</span>
          {pickId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${pickId}`} alt="" className="h-10 w-10 rounded bg-white object-contain" />
          ) : null}
          <select value={pickId} onChange={(e) => setPickId(e.target.value)} className={field} aria-label="选已传的照片">
            {library.map((p) => (
              <option key={p.id} value={p.id}>
                {p.angle || "未标角度"}
              </option>
            ))}
          </select>
          <span>放进</span>
          <select value={pickAngle} onChange={(e) => setPickAngle(e.target.value)} className={field} aria-label="放进哪一面">
            {WHITE_ANGLES.map((a) => (
              <option key={a} value={a}>
                {a}
                {assets.some((x) => x.angle === a) ? "（替换）" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btn}
            disabled={!!busy || !pickId}
            onClick={async () => {
              setBusy(pickAngle);
              const r = await reuseAssetAction(pickId, kind, pickAngle, colorId ?? null);
              setErr(r.error ?? "");
              setBusy(null);
              router.refresh();
            }}
          >
            放进去（免费）
          </button>
        </div>
      ) : null}
      {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
    </div>
  );
}

/** 建白模 / 贴色：选服务 → 看价格 → 同意才提交 → 自动查进度 → 待审核 */
export function ModelBuilder({ kit, target, colorId = null, refAngles = [] }: { kit: KitData; target: Target; colorId?: string | null; refAngles?: string[] }) {
  const router = useRouter();
  const providers = PROVIDERS.filter((p) => p.target === target);
  const [provider, setProvider] = useState(providers[0].id);
  const [refAngle, setRefAngle] = useState(refAngles.includes("左前 45°") ? "左前 45°" : (refAngles[0] ?? ""));
  const [quote, setQuote] = useState<ModelQuote | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const scope = target === "color" ? colorId : null;
  const jobs = kit.jobs.filter((j) => j.target === target && j.colorId === scope).slice(0, 3);
  const running = jobs.find((j) => j.status === "submitted");
  const candidates = kit.models.filter((m) => m.colorId === scope && m.status !== "approved");

  // 生成中：每 10 秒查一次进度（免费）
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const r = await pollModelJobAction(running.id);
      if (r.error) setMsg({ tone: "err", text: r.error });
      else if (r.result?.status === "done" || r.result?.status === "failed") router.refresh();
      else if (r.result) setMsg({ tone: "ok", text: `fal：${r.result.status}（每 10 秒自动查一次，可以离开这页）` });
    }, 10_000);
    return () => clearInterval(t);
  }, [running, router]);

  return (
    <div className="space-y-2 rounded-lg bg-white/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={field} aria-label="建模服务" disabled={pending || !!quote}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} · ${p.usd.toFixed(2)}
            </option>
          ))}
        </select>
        {target === "color" ? (
          <label className="text-xs text-neutral-400">
            按哪张照片贴色{" "}
            <select value={refAngle} onChange={(e) => setRefAngle(e.target.value)} className={field} disabled={pending || !!quote}>
              {refAngles.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className={primary}
          disabled={pending || !!quote || !!running || !kit.falReady}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await quoteModelAction(kit.projectId, target, colorId, provider, refAngle);
              if (r.error) setMsg({ tone: "err", text: r.error });
              else setQuote(r.result!);
            })
          }
        >
          {target === "shape" ? "用角度照建模" : "给白模贴这个颜色"}
        </button>
      </div>
      <p className="text-xs text-neutral-500">{providers.find((p) => p.id === provider)?.note}。只建一次，所有视频共用。</p>
      {!kit.falReady ? (
        <p className="text-xs text-amber-200">
          还没配置 fal Key：到{" "}
          <Link href="/settings" className="underline">
            模型设置
          </Link>{" "}
          填写。
        </p>
      ) : null}
      {quote ? (
        <div role="dialog" aria-label="建模审批" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="font-medium text-amber-100">
            要花钱：{quote.label}
            {quote.colorName ? ` · 颜色款「${quote.colorName}」` : ""} · ${quote.usd.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-neutral-300">会上传：{quote.uses.join("、")}。结果先进「待审核」，你看过通过才会用到视频里。网络断了只查原任务，不会重复扣费。</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={primary}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await startModelAction(kit.projectId, target, colorId, provider, refAngle, quote.usd);
                  setQuote(null);
                  setMsg(r.error ? { tone: "err", text: r.error } : { tone: "ok", text: "已提交，通常 1–5 分钟。完成后会出现在下面的「待审核」里。" });
                  router.refresh();
                })
              }
            >
              {pending ? "提交中，正在上传照片…（别关页面、别再点）" : `同意，提交（$${quote.usd.toFixed(2)}）`}
            </button>
            <button type="button" className={btn} disabled={pending} onClick={() => setQuote(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <p className={`text-xs ${msg.tone === "ok" ? "text-sky-200" : "text-rose-300"}`}>{msg.text}</p> : null}
      {jobs.length ? (
        <ul className="space-y-1 text-xs text-neutral-400">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2">
              <span suppressHydrationWarning>
                {new Date(j.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {PROVIDERS.find((p) => p.id === j.provider)?.label ?? j.provider} · 约 ${j.estUsd.toFixed(2)} ·{" "}
                <span className={j.status === "failed" || j.status === "unknown" ? "text-rose-300" : j.status === "done" ? "text-emerald-300" : "text-sky-200"}>{JOB_STATUS[j.status] ?? j.status}</span>
              </span>
              {j.error ? <span className="text-rose-300/80">{j.error}</span> : null}
              {j.status === "submitted" ? (
                <button
                  type="button"
                  className={btn}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await pollModelJobAction(j.id);
                      setMsg(r.error ? { tone: "err", text: r.error } : { tone: "ok", text: `fal：${r.result?.status}` });
                      router.refresh();
                    })
                  }
                >
                  查看进度（免费）
                </button>
              ) : null}
              {j.status === "unknown" ? (
                <button
                  type="button"
                  className={btn}
                  disabled={pending}
                  onClick={async () =>
                    await askConfirm("先到 fal.ai 后台的 Requests 里确认这次没有扣费、没有在跑。确认没提交成功？") &&
                    start(async () => {
                      await clearUnknownJobAction(j.id);
                      router.refresh();
                    })
                  }
                >
                  确认没提交成功
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {candidates.length ? (
        <ul className="space-y-1 text-xs">
          {candidates.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 text-neutral-300">
              <Tag tone={m.status === "review" ? "amber" : "neutral"}>{MODEL_STATUS[m.status]}</Tag>
              <span>{m.name}</span>
              {m.note ? <span className="text-neutral-500">「{m.note}」</span> : null}
              <Link href={`/projects/${kit.projectId}/product/models/${m.id}`} className="text-amber-300 underline">
                {m.status === "review" ? "去审核" : "查看"}
              </Link>
              {m.status === "rejected" ? (
                <button
                  type="button"
                  className="text-rose-300"
                  onClick={async () =>
                    await askConfirm("删除这个不通过的模型？") &&
                    start(async () => {
                      await deleteCandidateAction(m.id);
                      router.refresh();
                    })
                  }
                >
                  删除
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function StickersBody({ kit }: { kit: KitData }) {
  const router = useRouter();
  const [spot, setSpot] = useState(STICKER_SPOTS[0]);
  const [other, setOther] = useState("");
  const [type, setType] = useState("贴纸原图");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const where = spot === "其他" ? other.trim() : spot;
  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white/5 p-3 text-sm">
        <label className="text-xs text-neutral-400">
          贴在哪
          <select value={spot} onChange={(e) => setSpot(e.target.value)} className={`${field} mt-1 block`}>
            {STICKER_SPOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {spot === "其他" ? <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={20} placeholder="例如：后轮罩" className={field} aria-label="其他位置" /> : null}
        <label className="text-xs text-neutral-400">
          这张是
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${field} mt-1 block`}>
            <option>贴纸原图</option>
            <option>贴在车上的实拍</option>
          </select>
        </label>
        <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/webp" className="text-xs text-neutral-300" aria-label="贴纸图片" />
        <button
          type="button"
          className={primary}
          disabled={busy || !where}
          onClick={async () => {
            const fl = file.current?.files;
            if (!fl?.length) return setErr("请先选择图片");
            setBusy(true);
            setErr(await uploadOne(kit.projectId, "sticker", where, fl, { note: type }));
            if (file.current) file.current.value = "";
            setBusy(false);
            router.refresh();
          }}
        >
          {busy ? "上传中…" : "上传贴纸"}
        </button>
      </div>
      {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
      {kit.stickers.length ? (
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {kit.stickers.map((s) => (
            <li key={s.id} className="text-xs text-neutral-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${s.id}`} alt={s.angle} className="aspect-square w-full rounded-md border border-white/10 bg-[repeating-conic-gradient(#2a2a2a_0_25%,#1a1a1a_0_50%)] bg-[length:16px_16px] object-contain" />
              <p className="mt-1 flex justify-between gap-1">
                <span>
                  {s.angle} · {s.note || "贴纸原图"}
                </span>
                <button
                  type="button"
                  className="text-rose-300"
                  onClick={async () => {
                    if (!await askConfirm("删除这张贴纸？")) return;
                    await removeAsset(s.id);
                    router.refresh();
                  }}
                >
                  删除
                </button>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 颜色款：产品页管理；视频设定里也用它（selected / onSelect 选这条视频用哪个颜色） */
export function ColorKits({ kit, hasBase, selected, onSelect, locked }: { kit: KitData; hasBase: boolean; selected?: string | null; onSelect?: (id: string | null) => void; locked?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(selected ?? null);
  const pick = (id: string | null) => onSelect && !locked && onSelect(id);
  return (
    <div id="colors" className="space-y-3">
      {onSelect ? (
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input type="radio" checked={!selected} disabled={!!locked} onChange={() => pick(null)} />
          原色（用产品原来的模型和照片）
        </label>
      ) : null}
      {kit.colors.map((c) => {
        const photos = kit.colorPhotos.filter((p) => p.colorId === c.id);
        const missing = COLOR_REQUIRED.filter((a) => !photos.some((p) => p.angle === a));
        return (
          <div key={c.id} className="rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {onSelect ? <input type="radio" aria-label={`用${c.name}`} checked={selected === c.id} disabled={!!locked} onChange={() => pick(c.id)} /> : null}
              <span className="font-medium text-white">{c.name}</span>
              <Tag tone={missing.length ? "amber" : "emerald"}>{missing.length ? `还缺 ${missing.join("、")}` : "实物照齐了"}</Tag>
              <span className="text-xs text-neutral-500">实物照 {photos.length}/10</span>
              <button type="button" className={btn} onClick={() => setOpen(open === c.id ? null : c.id)}>
                {open === c.id ? "收起" : "上传实物照"}
              </button>
              {!onSelect ? (
                <button
                  type="button"
                  className="text-xs text-rose-300"
                  onClick={async () =>
                    await askConfirm(`删除颜色款「${c.name}」？它的实物照会删掉。`) &&
                    start(async () => {
                      const r = await deleteColorAction(c.id);
                      setMsg(r.error ?? "");
                      router.refresh();
                    })
                  }
                >
                  删除
                </button>
              ) : null}
            </div>
            {open === c.id ? (
              <div className="mt-3 space-y-3">
                <PhotoSlots projectId={kit.projectId} kind="color_photo" colorId={c.id} assets={photos} required={COLOR_REQUIRED} library={kit.library} />
                <p className="text-xs text-neutral-400">
                  不做 AI 贴色：3D 和构图用{hasBase ? "产品模型" : "白色方块"}定形状和角度，出首帧时颜色、Logo、贴纸都按这些实物照。
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
      {locked ? <p className="text-xs text-neutral-400">{locked}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="新颜色款名称，例如：薄荷绿" className={field} aria-label="新颜色款名称" />
        <button
          type="button"
          className={btn}
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              const r = await addColorAction(kit.projectId, name);
              setMsg(r.error ?? "");
              if (r.result) {
                setName("");
                setOpen(r.result);
              }
              router.refresh();
            })
          }
        >
          ＋ 新建颜色款
        </button>
      </div>
      {msg ? <p className="text-xs text-rose-300">{msg}</p> : null}
    </div>
  );
}
