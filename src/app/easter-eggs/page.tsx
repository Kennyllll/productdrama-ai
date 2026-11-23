import { Card, PageHeader } from "@/components/ui";
import { EasterEggLibrary } from "@/components/workbench/EasterEggLibrary";
import { EGG_RULES } from "@/lib/cast";
import { listEggs } from "@/lib/cast-repo";

export const dynamic = "force-dynamic";

export default function EasterEggsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="彩蛋角色库"
        description="宠物、吉祥物、玩偶这类小角色，偶尔在视频里露个脸。加好后所有产品都能用。"
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EasterEggLibrary eggs={listEggs()} />
        </div>
        <Card title="彩蛋规则">
          <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
            {EGG_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

        </Card>
      </div>
    </main>
  );
}
