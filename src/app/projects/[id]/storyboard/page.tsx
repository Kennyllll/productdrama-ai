import { StoryboardWorkbench } from "@/components/workbench/StoryboardWorkbench";
import { VisualSpecCard } from "@/components/workbench/VisualSpecCard";
import { DemoNotice, PageHeader } from "@/components/ui";

export default function StoryboardPage() {
  return (
    <>
      <PageHeader title="分镜工作台" description="每集 6–8 个镜头，逐镜头设计景别、焦距、机位、构图、光线、转场与声音；关键帧先审核再转视频。" />
      <DemoNotice />
      <VisualSpecCard />
      <StoryboardWorkbench />
    </>
  );
}
