import { PageHeader } from "@/components/ui";
import { HookLibrary } from "@/components/shorts/HookLibrary";
import { listHooks } from "@/lib/hooks-repo";

export const dynamic = "force-dynamic";

export default function HooksPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="Hook 库" description="所有产品共用的开头套路。这里只定属性有哪几项和示例值；实际的价格、主张在每条视频里填。节日、家庭、场地跟整条视频走，不在这里。" />
      <HookLibrary hooks={listHooks()} />
    </main>
  );
}
