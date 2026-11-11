import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { Set3D, type SetShot } from "@/components/production/Set3D";
import { getProductModel } from "@/lib/model-repo";
import { getSetMap, listEpisodesWithCards, listLibrary, listSetLayouts, listShotCards } from "@/lib/production-repo";
import { findLocalProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function SetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ep?: string; shot?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!findLocalProject(id)) notFound();
  const ep = Number(sp.ep) || listEpisodesWithCards(id)[0] || 2;
  const layouts = new Map(listSetLayouts(id, ep).map((l) => [l.code, l]));
  const library = listLibrary(id, ep);
  const cards = listShotCards(id, ep);
  const ordered = [...cards].sort((a, b) => (a.inFinal?.start ?? 1e3 + a.sort) - (b.inFinal?.start ?? 1e3 + b.sort));
  const shots: SetShot[] = ordered
    .filter((c) => layouts.has(c.code))
    .map((c) => {
      const l = layouts.get(c.code)!;
      const files = library.filter((f) => f.shotCode === c.code);
      const pickOne = (pred: (f: (typeof files)[number]) => boolean) => files.find(pred);
      const refs = [
        pickOne((f) => f.kind === "comp"),
        pickOne((f) => f.kind === "first_frame"),
        pickOne((f) => f.status === "final") ?? pickOne((f) => f.kind === "video"),
      ]
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
        .map((f) => ({ label: `${f.kind === "comp" ? "构图" : f.kind === "first_frame" ? "首帧" : "视频"} · ${f.label}`, fileId: f.id, video: f.mime.startsWith("video/") }));
      return { code: c.code, title: `${c.title}${c.status === "final" ? "" : "（没用进定稿）"}`, original: l.original, edited: l.edited, refs };
    });
  const model = getProductModel(id);
  const header = (
    <PageHeader
      title="3D 布景"
      description="按当时的数据还原每个镜头的机位、焦段和车的位置。俯视地图和摄影机画面联动，可以直接拖动机位、看向点和车，看画面怎么变。"
    />
  );
  if (shots.length === 0) {
    return (
      <>
        {header}
        <Card title="还没有布景数据">
          <p className="text-sm text-neutral-300">这个项目还没有能还原的机位数据。</p>
        </Card>
      </>
    );
  }
  return (
    <>
      {header}
      <p className="mb-4 rounded-lg border border-sky-400/30 bg-sky-400/5 px-4 py-2 text-xs text-sky-100">
        地图里的房子、车道、树是当时 Blender 构图用的简化方块；KB002 是真实 CAD 模型。人物先用一个人偶代替，路线和动作编辑在下一轮做。E2-3 当时用的是另一套跟拍数据，这里还原不了。
      </p>
      <Set3D projectId={id} episode={ep} shots={shots} mapProps={getSetMap(id, ep)} glbUrl={model ? `/api/models/${model.id}` : null} initialCode={sp.shot ?? ""} />
    </>
  );
}
