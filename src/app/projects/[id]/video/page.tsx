import { Card, DemoNotice, LaterButton, PageHeader, Tag } from "@/components/ui";
import { demoEpisodes, totalSeconds } from "@/lib/mock/demo";

const pipeline = ["关键帧审核", "逐镜头视频生成", "配音 / 音效", "合成（FFmpeg / Remotion）", "质检 / 品牌保护", "导出"];
const providers = ["Higgsfield", "Kling", "Seedance", "其他供应商"];
const qcChecks = ["电影感：画幅、帧率、调色与视觉规范一致", "剪辑节奏与转场", "产品几何与颜色一致性", "Logo 保真", "角色一致性", "猫咪彩蛋时长（1–3 秒）", "版本与原版存档", "数字水印 / C2PA（规划中）"];

export default function VideoPage() {
  return (
    <>
      <PageHeader
        title="视频制作工作台"
        description="未来通过模型适配层逐镜头生成视频，再配音、合成、质检并导出。当前阶段尚未实现，不会产生任何生成任务或费用。"
        actions={<LaterButton task="TASK-006">开始生成</LaterButton>}
      />
      <DemoNotice />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="制作任务（全部未开始）">
          <div className="space-y-4">
            {demoEpisodes.map((ep) => (
              <div key={ep.number} className="rounded-lg border border-white/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-white">
                    第 {ep.number} 集 · {ep.title} · {totalSeconds(ep.shots)} 秒
                  </p>
                  <Tag>未生成</Tag>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-8">
                  {ep.shots.map((s) => (
                    <div key={s.id} title={s.description} className="rounded bg-white/5 px-2 py-1 text-center text-[11px] text-neutral-400">
                      镜头 {s.index}
                      <br />
                      未开始
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="制作流程">
            <ol className="space-y-2 text-sm">
              {pipeline.map((step, i) => (
                <li key={step} className="flex items-center justify-between gap-2">
                  <span>
                    {i + 1}. {step}
                  </span>
                  <Tag>后续实现</Tag>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="模型适配层（规划）">
            <ul className="space-y-2">
              {providers.map((p) => (
                <li key={p} className="flex items-center justify-between text-sm">
                  {p} <Tag>未连接</Tag>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-neutral-500">接入前会先显示预算、限制重试次数，并安全保管 API 密钥。</p>
          </Card>
          <Card title="成片质检清单（规划）">
            <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
              {qcChecks.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
