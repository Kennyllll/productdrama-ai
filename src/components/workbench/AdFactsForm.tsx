"use client";

// 产品资料第 5 步：广告里会出现的数字和说法，每个都要写依据。Hook 和字幕里出现时拿这里对照。
import { useActionState, useState } from "react";
import { saveAdFactsAction } from "@/app/actions";
import { factsErrors, type AdFacts } from "@/lib/ad-compliance";
import type { FormState } from "@/lib/types";

const inp = "w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none";
const ROWS: { k: keyof AdFacts; label: string; ph: string; srcPh: string }[] = [
  { k: "price", label: "现价", ph: "59.99", srcPh: "店铺链接或截图文件名" },
  { k: "was", label: "原价（划线价）", ph: "89.99", srcPh: "真实卖过这个价的截图（哪天、哪个店）" },
  { k: "stock", label: "库存", ph: "50", srcPh: "后台库存截图" },
  { k: "rating", label: "评分", ph: "4.8", srcPh: "店铺评分截图" },
  { k: "reviews", label: "评论数", ph: "1200", srcPh: "店铺评论数截图" },
  { k: "safety", label: "安全认证", ph: "ASTM F963", srcPh: "检测报告编号或文件名" },
];

export function AdFactsForm({ projectId, initial }: { projectId: string; initial: AdFacts }) {
  const [f, setF] = useState(initial);
  const [st, action, saving] = useActionState<FormState, FormData>(saveAdFactsAction, {});
  const errs = factsErrors(f);
  const bad = Object.keys(errs).length > 0;
  return (
    <section id="ad-facts" className="scroll-mt-4 rounded-xl border border-white/10 bg-neutral-900/70 p-5">
      <h2 className="flex items-center gap-3 text-base font-semibold text-white"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">5</span>广告里的数字和说法<span className="text-xs font-normal text-neutral-500">可选</span></h2>
      <p className="mt-1 text-xs text-neutral-400">
        Hook 和字幕里写价格、原价、库存、评分、评论数、安全认证，都要先在这里填真实数字和依据。没依据的，导出时会拦下。不打算写就空着。
      </p>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="projectId" value={projectId} />
        {ROWS.map((r) => {
          const src = `${r.k}Source` as keyof AdFacts;
          const err = errs[r.k] ?? errs[src];
          return (
            <div key={r.k} className="grid items-start gap-2 rounded-lg bg-white/5 p-2 sm:grid-cols-[7rem_8rem_1fr]">
              <label htmlFor={`ad-${r.k}`} className="pt-1.5 text-sm text-neutral-300">
                {r.label}
              </label>
              <input id={`ad-${r.k}`} name={r.k} value={f[r.k]} onChange={(e) => setF({ ...f, [r.k]: e.target.value })} placeholder={r.ph} className={inp} />
              <div>
                <input name={src} value={f[src]} onChange={(e) => setF({ ...f, [src]: e.target.value })} placeholder={`依据：${r.srcPh}`} aria-label={`${r.label}依据`} className={inp} />
                {err ? <p className="mt-1 text-xs text-rose-300">{err}</p> : null}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={saving || bad} className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "保存中…" : "保存依据"}
          </button>
          {bad ? <span className="text-xs text-amber-300">先改掉红字才能保存</span> : null}
          {st.ok ? <span className="text-sm text-emerald-300">{st.ok}</span> : null}
          {st.error ? <span className="text-sm text-rose-300">{st.error}</span> : null}
        </div>
      </form>
    </section>
  );
}
