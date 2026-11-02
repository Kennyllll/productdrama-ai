import Link from "next/link";
import { DEMO_PROJECT_ID } from "@/lib/mock/demo";
import { stepHref, workflowSteps } from "@/lib/navigation";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm text-amber-300">本地原型 · TASK-001</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">ProductDrama AI</h1>
      <p className="mt-3 max-w-2xl text-lg text-neutral-300">
        为电商品牌打造电影级产品连续短剧：从真实产品照片出发，经过创意、选角、剧本与分镜，最终制作四集、每集约 45 秒的短剧。
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/dashboard" className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300">
          进入项目中心
        </Link>
        <Link href={stepHref(DEMO_PROJECT_ID, "product")} className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
          打开示例项目
        </Link>
      </div>
      <p className="mt-4 text-xs text-sky-200">当前阶段只有可交互的前端与示例数据，未接入任何 AI / 视频生成服务。</p>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-neutral-400">制作流程</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workflowSteps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={stepHref(DEMO_PROJECT_ID, s.key)}
              className="block h-full rounded-xl border border-white/10 bg-neutral-900/70 p-4 hover:border-amber-400/50"
            >
              <span className="text-xs text-amber-300">步骤 {i + 1}</span>
              <p className="mt-1 font-medium text-white">{s.label}</p>
              <p className="mt-1 text-sm text-neutral-400">{s.description}</p>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
