import { PageHeader } from "@/components/ui";
import { FamilyLibrary } from "@/components/shorts/FamilyLibrary";
import { listFamilies } from "@/lib/families-repo";

export const dynamic = "force-dynamic";

export default function FamiliesPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="家庭库" description="所有产品共用。短视频里每个人偶绑定一个成员：3D 按身高缩放，首帧提示词写这个人的长相和衣服（衣服跟着视频的节日）。" />
      <FamilyLibrary families={listFamilies()} />
    </main>
  );
}
