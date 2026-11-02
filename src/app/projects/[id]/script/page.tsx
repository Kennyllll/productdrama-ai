import { ScriptWorkbench } from "@/components/workbench/ScriptWorkbench";
import { DemoNotice, PageHeader } from "@/components/ui";

export default function ScriptPage() {
  return (
    <>
      <PageHeader title="剧本工作台" description="四集完整剧本，每集目标 45 秒。可按集、场景与台词修改，并提示受影响的角色与后续集数。" />
      <DemoNotice />
      <ScriptWorkbench />
    </>
  );
}
