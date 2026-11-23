import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { listLogs, logFacets } from "@/lib/audit-repo";
import { listLocalProjects } from "@/lib/repo";
import { getShortVideoAny } from "@/lib/shorts-repo";

const ACTION_LABEL: Record<string, string> = {
  frame_model: "换首帧模型",
  frame_product_override: "管理员放行车不一致",
  job_refs: "参考图存档",
  model_cad_calibrate: "2D 图纸校准模型"
};

export const dynamic = "force-dynamic";

const field = "rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const dayEnd = (d: string) => (d ? new Date(new Date(`${d}T00:00:00`).getTime() + 86400_000).toISOString() : undefined);
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = { projectId: one(sp.project), videoId: one(sp.video), action: one(sp.action), actor: one(sp.actor), q: one(sp.q), from: one(sp.from), to: one(sp.to) };
  const rows = listLogs({ ...f, from: dayStart(f.from), to: dayEnd(f.to), limit: 500 });
  const facets = logFacets();
  const projects = listLocalProjects();
  const pName = new Map(projects.map((p) => [p.id, p.name]));
  const vName = new Map<string, string>();
  for (const r of rows) if (r.videoId && !vName.has(r.videoId)) vName.set(r.videoId, getShortVideoAny(r.videoId)?.title ?? "（已删除的视频）");
  const total = rows.reduce((s, r) => s + (r.usd && r.action.startsWith("提交生成") ? r.usd : 0), 0);
  const q = (patch: Record<string, string>) => `/logs?${new URLSearchParams(Object.entries({ ...f, ...patch }).filter(([, v]) => v)).toString()}`;
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader title="操作日志" description="谁、什么时候、对哪个视频哪一镜、做了什么、花多少、走哪家。只追加，不能改、不能删。" />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-xs text-neutral-400" action="/logs">
        <label className="flex flex-col gap-1">
          产品
          <select name="project" defaultValue={f.projectId} className={field}>
            <option value="">全部</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          做了什么
          <select name="action" defaultValue={f.action} className={field}>
            <option value="">全部</option>
            {facets.actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          谁
          <select name="actor" defaultValue={f.actor} className={field}>
            <option value="">全部</option>
            {facets.actors.map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          从
          <input type="date" name="from" defaultValue={f.from} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          到
          <input type="date" name="to" defaultValue={f.to} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          关键字
          <input name="q" defaultValue={f.q} placeholder="镜头、原因、模型…" className={`${field} w-48`} />
        </label>
        {f.videoId ? <input type="hidden" name="video" value={f.videoId} /> : null}
        <button className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black">筛选</button>
        <Link href="/logs" className="px-2 py-1.5 text-sm text-neutral-300 underline">
          清空
        </Link>
        <span className="ml-auto text-sm text-neutral-300">
          {rows.length} 条{rows.length === 500 ? "（只显示最近 500 条，请缩小范围）" : ""} · 其中提交生成共 ${total.toFixed(2)}
        </span>
      </form>
      {f.videoId ? (
        <p className="mb-2 text-sm text-neutral-300">
          只看视频「{vName.get(f.videoId) ?? getShortVideoAny(f.videoId)?.title ?? f.videoId}」{" "}
          <Link className="text-sky-300 underline" href={q({ video: "" })}>
            看全部
          </Link>
        </p>
      ) : null}
      {!rows.length ? (
        <p className="rounded-xl border border-white/10 p-6 text-sm text-neutral-400">没有符合条件的记录。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">时间</th>
                <th>谁</th>
                <th>产品 / 视频</th>
                <th>镜头</th>
                <th>做了什么</th>
                <th>详情</th>
                <th className="text-right">金额</th>
                <th className="px-3">走哪家</th>
              </tr>
            </thead>
            <tbody className="text-neutral-200">
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs text-neutral-400">{new Date(r.at).toLocaleString("zh-CN")}</td>
                  <td className="whitespace-nowrap text-xs">
                    {["新手", "管理员", "系统"].includes(r.actor) ? null : r.actor}
                    <span className={`${["新手", "管理员", "系统"].includes(r.actor) ? "" : "ml-1 "}rounded px-1 ${r.role === "admin" ? "bg-amber-400/20 text-amber-200" : r.role === "system" ? "bg-white/5 text-neutral-500" : "bg-white/10 text-neutral-300"}`}>{r.role === "admin" ? "管理员" : r.role === "system" ? "系统" : "新手"}</span>
                  </td>
                  <td className="min-w-[10rem] text-xs">
                    {r.projectId ? <div className="text-neutral-400">{pName.get(r.projectId) ?? "—"}</div> : null}
                    {r.videoId ? (
                      <Link className="text-sky-300 underline" href={q({ video: r.videoId })}>
                        {vName.get(r.videoId)}
                      </Link>
                    ) : null}
                  </td>
                  <td className="text-xs">{r.shotLabel}</td>
                  <td className="whitespace-nowrap">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="max-w-md text-xs text-neutral-300">{r.detail}</td>
                  <td className="whitespace-nowrap text-right text-xs">{r.usd == null ? "" : `${r.usd < 0 ? "-" : ""}$${Math.abs(r.usd).toFixed(2)}`}</td>
                  <td className="whitespace-nowrap px-3 text-xs text-neutral-400" title={r.model}>
                    {r.provider}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
