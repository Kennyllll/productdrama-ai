import { CreativeWorkbench } from "@/components/workbench/CreativeWorkbench";
import { DemoNotice, PageHeader } from "@/components/ui";

export default function CreativePage() {
  return (
    <>
      <PageHeader
        title="创意工作台"
        description="故事主题、电影视觉风格、产品在剧情中的角色是三个独立选项；然后从三个不同方向的提案中挑选。"
      />
      <DemoNotice />
      <CreativeWorkbench />
    </>
  );
}
