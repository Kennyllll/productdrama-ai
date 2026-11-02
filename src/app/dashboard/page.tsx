import Link from "next/link";
import { Card, MockBadge, PageHeader, Tag } from "@/components/ui";
import { DeleteProjectButton, NewProjectForm } from "@/components/workbench/NewProjectForm";
import { demoEpisodes, demoProject, totalSeconds } from "@/lib/mock/demo";
import { stepHref, workflowSteps } from "@/lib/navigation";
import { listLocalProjects } from "@/lib/repo";

export const dynamic = "force-dynamic";

const statusLabel = { done: "已完成", in_progress: "进行中", todo: "未开始" } as const;
const statusTone = { done: "text-emerald-300", in_progress: "text-amber-300", todo: "text-neutral-500" } as const;

const formatTime = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

export default function DashboardPage() {
  const p = demoProject;
  const projects = listLocalProjects();
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="项目中心" description="管理你的产品短剧项目。新建的项目保存在本机 data/ 目录的 SQLite 数据库中。" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="我的本地项目" aside={<Tag tone="emerald">保存在本机</Tag>}>
            {projects.length === 0 ? (
              <p className="text-sm text-neutral-500">还没有本地项目，在右侧新建一个。</p>
            ) : (
              <ul className="space-y-3">
                {projects.map((lp) => (
                  <li key={lp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-4">
                    <div>
                      <p className="text-lg font-medium text-white">{lp.name}</p>
                      <p className="text-sm text-neutral-400">
                        {lp.brand} · {lp.episodeCount} 集 × {lp.secondsPerEpisode} 秒 · 更新于 {formatTime(lp.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={stepHref(lp.id, "product")}
                        className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300"
                      >
                        继续制作
                      </Link>
                      <DeleteProjectButton id={lp.id} name={lp.name} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="示例项目（只读）" aside={<MockBadge />}>
            <div className="rounded-lg border border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-medium text-white">{p.name}</p>
                  <p className="text-sm text-neutral-400">
                    {p.brand} · {p.episodeCount} 集 × {p.secondsPerEpisode} 秒
                  </p>
                </div>
                <Link
                  href={stepHref(p.id, p.currentStep)}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/10"
                >
                  查看示例
                </Link>
              </div>
              <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {workflowSteps.map((s) => (
                  <li key={s.key}>
                    <Link href={stepHref(p.id, s.key)} className="block rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                      {s.label}
                      <span className={`block text-xs ${statusTone[p.stepStatus[s.key]]}`}>{statusLabel[p.stepStatus[s.key]]}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="新建项目">
            <NewProjectForm />
          </Card>
          <Card title="四集结构（示例）">
            <ul className="space-y-3">
              {demoEpisodes.map((ep) => (
                <li key={ep.number} className="rounded-lg bg-white/5 p-3">
                  <p className="text-sm text-white">
                    第 {ep.number} 集 · {ep.title}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {ep.shots.length} 个镜头 · {totalSeconds(ep.shots)} / {ep.targetSeconds} 秒
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}
