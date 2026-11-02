import { StoryboardWorkbench } from "@/components/workbench/StoryboardWorkbench";
import { DemoNotice, PageHeader } from "@/components/ui";

export default function StoryboardPage() {
  return (
    <>
      <PageHeader title="分镜工作台" description="每集 6–8 个镜头，逐镜头编辑关键帧、时长、镜头运动、台词与产品出场；关键帧先审核再转视频。" />
      <DemoNotice />
      <StoryboardWorkbench />
    </>
  );
}
