import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalStoryboardWorkbench } from "@/components/workbench/LocalStoryboardWorkbench";
import { StoryboardWorkbench } from "@/components/workbench/StoryboardWorkbench";
import { VisualSpecCard } from "@/components/workbench/VisualSpecCard";
import { Card, DemoNotice, PageHeader } from "@/components/ui";
import { getEgg, getProjectEggId, listCharacters } from "@/lib/cast-repo";
import { DEMO_PROJECT_ID, filmStyles } from "@/lib/mock/demo";
import { findLocalProject, getCreative, getScript } from "@/lib/repo";
import { getStoryboard } from "@/lib/storyboard-repo";

export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const header = <PageHeader title="分镜工作台" description="每集 6–8 个镜头，逐镜头设计景别、焦距、机位、构图、光线、转场与声音；关键帧先审核再转视频。" />;
  if (id === DEMO_PROJECT_ID) {
    return (
      <>
        {header}
        <DemoNotice />
        <VisualSpecCard />
        <StoryboardWorkbench />
      </>
    );
  }
  if (!findLocalProject(id)) notFound();

  const script = getScript(id);
  if (!script) {
    return (
      <>
        {header}
        <Card title="还没有剧本">
          <p className="text-sm text-neutral-300">
            分镜按剧本的节拍生成。请先到
            <Link href={`/projects/${id}/script`} className="mx-1 text-amber-200 underline">
              剧本工作台
            </Link>
            生成四集剧本骨架。
          </p>
        </Card>
      </>
    );
  }

  const creative = getCreative(id);
  const style = filmStyles.find((f) => f.id === creative.styleId) ?? filmStyles[0];
  const eggId = getProjectEggId(id);
  const egg = eggId ? getEgg(eggId) : null;
  return (
    <>
      {header}
      <LocalStoryboardWorkbench
        projectId={id}
        script={script}
        style={style}
        cast={listCharacters(id)}
        egg={egg ? { id: egg.id, name: egg.name } : null}
        initial={getStoryboard(id)}
      />
    </>
  );
}
