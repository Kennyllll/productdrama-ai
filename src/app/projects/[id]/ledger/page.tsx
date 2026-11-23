import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Tag } from "@/components/ui";
import { listLedger, type LedgerEntry } from "@/lib/production-repo";
import { findLocalProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { first_frame: "首帧", video: "视频", video_edit: "视频编辑", sound: "声音", model3d: "3D 建模" };
const usd = (n: number) => `$${n.toFixed(2)}`;
const sum = (xs: LedgerEntry[]) => xs.reduce((s, x) => s + x.usd, 0);

const FILTERS = [
  ["all", "全部"],
  ["shorts", "短视频"],
  ["long", "长视频"],
] as const;

export default async function LedgerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  const { id } = await params;
  const { f: fRaw } = await searchParams;
  if (!findLocalProject(id)) notFound();
  const f = fRaw === "shorts" || fRaw === "long" ? fRaw : "all";
  const every = listLedger(id);
  const all = every.filter((l) => (f === "shorts" ? l.episode === 0 && l.kind !== "usage_day" : f === "long" ? l.episode !== 0 || l.kind === "usage_day" : true));
  const jobs = all.filter((l) => l.kind !== "usage_day");
  const usage = all.filter((l) => l.kind === "usage_day");
  const tracked = jobs.filter((l) => l.episode !== 0);
  const used = tracked.filter((l) => l.used);
  const unknown = jobs.filter((l) => l.model === "kling").length;
  const byShot = new Map<string, LedgerEntry[]>();
  for (const j of jobs) byShot.set(j.shotCode || "（不属于镜头）", [...(byShot.get(j.shotCode || "（不属于镜头）") ?? []), j]);
  const kinds = [...new Set(jobs.map((j) => j.kind))];

  return (
    <>
      <PageHeader title="费用" description="每个生成任务一条记录：属于哪个镜头、用的什么模型、花了多少。" />
      <div className="mb-4 flex gap-1">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k === "all" ? "?" : `?f=${k}`} className={`rounded-lg px-3 py-1 text-sm ${f === k ? "bg-amber-400/15 text-amber-200" : "text-neutral-400 hover:bg-white/5"}`}>
            {label}
          </Link>
        ))}
      </div>
      {jobs.length === 0 ? (
        <Card title="还没有记录">
          <p className="text-sm text-neutral-300">这个项目还没有生成任务。</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card title="按任务估算 · 合计">
              <p className="text-2xl text-white">{usd(sum(jobs))}</p>
              <p className="mt-1 text-xs text-neutral-400">{jobs.length} 个任务{unknown ? `，其中 ${unknown} 个 Kling 测试没有单价` : ""}</p>
            </Card>
            {tracked.length ? (
              <>
                <Card title="长视频：用上的">
                  <p className="text-2xl text-emerald-200">{usd(sum(used))}</p>
                  <p className="mt-1 text-xs text-neutral-400">{used.length} 个任务的结果进了定稿</p>
                </Card>
                <Card title="长视频：没用上">
                  <p className="text-2xl text-rose-200">{usd(sum(tracked) - sum(used))}</p>
                  <p className="mt-1 text-xs text-neutral-400">废片和测试，占长视频的 {Math.round(((sum(tracked) - sum(used)) / Math.max(sum(tracked), 0.01)) * 100)}%</p>
                </Card>
              </>
            ) : (
              <Card title="用上了多少">
                <p className="text-sm text-neutral-300">短视频还不统计哪些任务用上了，先看合计和下面按镜头的花费。</p>
              </Card>
            )}
          </div>

          <details>
          <summary className="cursor-pointer select-none text-sm text-neutral-400">怎么算的、每日用量</summary>
          <div className="mt-3 space-y-6">
          <Card title="怎么算的">
            <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
              <li>单价用 Higgsfield 估价接口的标准价：Seedance 2.5 720p 每秒 $0.2647，首帧约 $0.10 一张。时长读每个任务的输入参数，读不到按 5 秒算</li>
              <li>“用上了”是按输出文件和定稿素材的文件大小对上的，个别任务可能对错</li>
              <li>提交记录只到 11/11 0 点；之后的 6c v2、6d 等任务只出现在下面 Higgsfield 的每日用量里</li>
              <li>11/9 以前的视频编辑和 ElevenLabs 声音是按时长估的，单价没核实</li>
              <li>精确金额以 Higgsfield 后台账单为准</li>
            </ul>
          </Card>

          {usage.length ? (
            <Card title="Higgsfield 每日用量（精确，来自用量接口）">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-1">日期 · 次数</th>
                    <th>模型</th>
                    <th className="text-right">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.id} className="border-t border-white/5">
                      <td className="py-1">{u.note}</td>
                      <td className="text-neutral-400">{u.model}</td>
                      <td className="text-right">{usd(u.usd)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 font-medium text-white">
                    <td className="py-1">合计</td>
                    <td />
                    <td className="text-right">{usd(sum(usage))}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          ) : null}
          </div>
          </details>

          <Card title="按镜头">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1">镜头</th>
                  {kinds.map((k) => (
                    <th key={k} className="text-right">
                      {KIND[k] ?? k}
                    </th>
                  ))}
                  <th className="text-right">合计</th>
                  <th className="text-right">用上的</th>
                </tr>
              </thead>
              <tbody>
                {[...byShot.entries()]
                  .sort((a, b) => sum(b[1]) - sum(a[1]))
                  .map(([shot, xs]) => (
                    <tr key={shot} className="border-t border-white/5">
                      <td className="py-1">
                        {/^[0-9A-Za-z]+$/.test(shot) ? (
                          <Link href={`/projects/${id}/shots#shot-${shot}`} className="text-amber-200 underline">
                            E2-{shot}
                          </Link>
                        ) : (
                          shot
                        )}
                      </td>
                      {kinds.map((k) => {
                        const ks = xs.filter((x) => x.kind === k);
                        return (
                          <td key={k} className="text-right text-neutral-400">
                            {ks.length ? `${ks.length} 个 · ${usd(sum(ks))}` : "—"}
                          </td>
                        );
                      })}
                      <td className="text-right">{usd(sum(xs))}</td>
                      <td className="text-right text-emerald-200">{xs.some((x) => x.episode !== 0) ? usd(sum(xs.filter((x) => x.used))) : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>

          <details>
          <summary className="cursor-pointer select-none text-sm text-neutral-400">全部任务明细（{jobs.length}）</summary>
          <Card className="mt-3">
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-900 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-1">时间</th>
                    <th>镜头</th>
                    <th>类型</th>
                    <th>模型</th>
                    <th className="text-right">约</th>
                    <th className="pl-3">用上</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-white/5">
                      <td className="py-1 text-neutral-400">{j.createdAt.slice(5, 16).replace("T", " ")}</td>
                      <td>{j.shotCode}</td>
                      <td>{KIND[j.kind] ?? j.kind}</td>
                      <td className="text-neutral-400">{j.model}</td>
                      <td className="text-right">{usd(j.usd)}</td>
                      <td className="pl-3">{j.used ? <Tag tone="emerald">用上</Tag> : <span className="text-neutral-600">—</span>}</td>
                      <td className="text-xs text-neutral-500">{j.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          </details>
        </div>
      )}
    </>
  );
}
