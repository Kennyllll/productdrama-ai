import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DemoNotice, PageHeader } from "@/components/ui";
import { LocalSoundWorkbench } from "@/components/workbench/LocalSoundWorkbench";
import { aiPublicInfo } from "@/lib/ai/settings";
import { DEMO_PROJECT_ID } from "@/lib/mock/demo";
import { findLocalProject, getScript } from "@/lib/repo";
import { getSoundPlan, listStems, toStemView } from "@/lib/sound-repo";
import { getStoryboard } from "@/lib/storyboard-repo";

export const dynamic = "force-dynamic";

const principles = [
  "钩子：只用环境声和一个引起好奇的细节音",
  "冲突：节奏加快，低频收紧",
  "转折 / 最低谷：音乐抽空，留白或只剩呼吸",
  "悬念：停在未解决的音上，引向下一集",
  "母题：主角有一段旋律，四集逐渐展开，第 4 集完整回收",
  "产品声音标志：来自产品真实的物理声音，只在关键转折出现",
  "混音：对白出现时压低音乐，响度统一到 -14 LUFS",
];

export default async function SoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const header = <PageHeader title="声音工作台" description="按剧情情绪曲线设计音乐、环境声、音效和留白；上传分轨后在视频页自动混音。" />;
  if (id === DEMO_PROJECT_ID) {
    return (
      <>
        {header}
        <DemoNotice />
        <Card title="声音如何推动剧情（方法说明）">
          <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
            {principles.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">示例项目不提供声音编辑。请新建本地项目体验。</p>
        </Card>
      </>
    );
  }
  if (!findLocalProject(id)) notFound();

  const script = getScript(id);
  const board = getStoryboard(id);
  if (!script || !board) {
    return (
      <>
        {header}
        <Card title="还没有剧本或分镜">
          <p className="text-sm text-neutral-300">
            声音按剧本节拍和分镜时间线设计。请先完成
            <Link href={`/projects/${id}/script`} className="mx-1 text-amber-200 underline">
              剧本
            </Link>
            和
            <Link href={`/projects/${id}/storyboard`} className="mx-1 text-amber-200 underline">
              分镜
            </Link>
            。
          </p>
        </Card>
      </>
    );
  }

  const episodes = board.episodes.map((ep) => {
    let t = 0;
    const shots = ep.shots.map((s) => {
      const start = t;
      t += s.seconds;
      return { index: s.index, start, seconds: s.seconds, description: s.description, sound: s.sound, dialogue: s.dialogue.trim() !== "" };
    });
    const sep = script.episodes.find((e) => e.number === ep.number);
    return { number: ep.number, title: sep?.title ?? "", total: t, beats: sep?.beats ?? [], shots };
  });

  return (
    <>
      {header}
      <LocalSoundWorkbench
        projectId={id}
        initial={getSoundPlan(id)}
        proposalId={script.proposalId}
        episodes={episodes}
        initialStems={listStems(id).map(toStemView)}
        aiReady={aiPublicInfo().configured}
      />
    </>
  );
}
