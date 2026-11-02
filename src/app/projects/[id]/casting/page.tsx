import { CastingStudio } from "@/components/workbench/CastingStudio";
import { DemoNotice, PageHeader } from "@/components/ui";

export default function CastingPage() {
  return (
    <>
      <PageHeader
        title="选角工作台 · AI Casting Studio"
        description="支持多位主角、配角、临时角色、群演、动物与幻想角色；建立 Character Bible 并追踪四集出场。"
      />
      <DemoNotice />
      <CastingStudio />
    </>
  );
}
