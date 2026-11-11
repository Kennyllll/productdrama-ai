import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { TimelineView } from "@/components/production/TimelineView";
import { getTimeline, listEpisodesWithCards, listShotCards } from "@/lib/production-repo";
import { findLocalProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function TimelinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ep?: string; t?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!findLocalProject(id)) notFound();
  const ep = Number(sp.ep) || listEpisodesWithCards(id)[0] || 2;
  const data = getTimeline(id, ep);
  const header = <PageHeader title="时间线" description="定稿的剪辑表：每个镜头的入点和出点、字幕、音乐、环境声和音效分层。点任意一段跳过去播放。" />;
  if (!data) {
    return (
      <>
        {header}
        <Card title="还没有时间线">
          <p className="text-sm text-neutral-300">这个项目还没有导入或剪辑出时间线。</p>
        </Card>
      </>
    );
  }
  const cards = Object.fromEntries(listShotCards(id, ep).map((c) => [c.code, { title: c.title, purpose: c.purpose }]));
  const t = Math.max(0, Math.min(data.total, Number(sp.t) || 0));
  return (
    <>
      {header}
      <p className="mb-4 text-sm text-neutral-400">
        第 {ep} 集 · {data.version} · {data.total} 秒 · {data.cuts.length} 个镜头
      </p>
      <TimelineView projectId={id} data={data} cards={cards} initialT={t} />
    </>
  );
}
