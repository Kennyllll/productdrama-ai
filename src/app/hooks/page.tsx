import { RevisionHistory } from "@/components/admin/RevisionHistory";
import { PageHeader } from "@/components/ui";
import { HookLibrary } from "@/components/shorts/HookLibrary";
import { listHooks } from "@/lib/hooks-repo";

export const dynamic = "force-dynamic";

export default function HooksPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="Hook 库" description="所有产品共用的视频开头套路。价格、卖点这些具体内容在每条视频里填。" />
      <HookLibrary hooks={listHooks()} />
      <RevisionHistory entityType="hook" />
    </main>
  );
}
