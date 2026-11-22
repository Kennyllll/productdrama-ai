import { PageHeader } from "@/components/ui";
import { TrashList } from "@/components/admin/TrashList";
import { listTrash } from "@/lib/trash-repo";
import { listLocalProjects } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function TrashPage() {
  const items = listTrash();
  const names = Object.fromEntries(listLocalProjects().map((p) => [p.id, p.name]));
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="回收站" description="删掉或被新结果替换掉的付费内容都在这里，点“恢复”放回原处。费用记录和操作日志一直保留。永久删除只有管理员能做。" />
      <TrashList items={items} projectNames={names} />
    </main>
  );
}
