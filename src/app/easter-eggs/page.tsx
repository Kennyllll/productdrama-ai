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
        description="工具级设置：添加宠物、吉祥物、玩偶等彩蛋角色并上传真实参考照。保存后可在任意本地项目的选角页选用或更换。"
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
          <p className="mt-3 text-xs text-neutral-500">参考照只保存在本机 uploads/_eggs/ 目录，不上传云端。</p>
        </Card>
      </div>
    </main>
  );
}
