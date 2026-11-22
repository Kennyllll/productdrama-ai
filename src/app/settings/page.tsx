import { Card, PageHeader } from "@/components/ui";
import { KeyChecklist } from "@/components/workbench/KeyChecklist";
import { AiSettingsForm } from "@/components/workbench/AiSettingsForm";
import { ElevenLabsSettingsForm } from "@/components/workbench/ElevenLabsSettingsForm";
import { FalSettingsForm } from "@/components/workbench/FalSettingsForm";
import { ArkSettingsForm } from "@/components/workbench/ArkSettingsForm";
import { arkPublicInfo } from "@/lib/ark";
import { HiggsfieldSettingsForm } from "@/components/workbench/HiggsfieldSettingsForm";
import { VisionSettingsForm } from "@/components/workbench/VisionSettingsForm";
import { BrainSettingsForm } from "@/components/workbench/BrainSettingsForm";
import { brainPublicInfo } from "@/lib/brain/kimi";
import { aiPublicInfo } from "@/lib/ai/settings";
import { elevenLabsPublicInfo } from "@/lib/elevenlabs";
import { falPublicInfo } from "@/lib/fal";
import { hfPublicInfo } from "@/lib/higgsfield";
import { visionPublicInfo } from "@/lib/vision-qa";
import { IdentityPanel } from "@/components/admin/IdentityPanel";
import { NeedAdmin } from "@/components/admin/AdminContext";
import { currentActor } from "@/lib/admin";


export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = (await currentActor()).role === "admin";
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="模型设置" description="工具级设置：文字模型（故事、剧本、分镜、声音设计）、画面生成平台（Higgsfield）与声音（ElevenLabs）。凭证只保存在本机。" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <IdentityPanel />
          <KeyChecklist />
          {!admin ? (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              下面的模型 Key 新手只能看，不能改。 <NeedAdmin />
            </p>
          ) : null}
          <fieldset disabled={!admin} className="space-y-6 disabled:opacity-70">
          <div id="kimi" className="scroll-mt-4"><BrainSettingsForm initial={brainPublicInfo()} /></div>
          <div id="deepseek" className="scroll-mt-4"><AiSettingsForm initial={aiPublicInfo()} /></div>
          <div id="higgsfield" className="scroll-mt-4"><HiggsfieldSettingsForm initial={hfPublicInfo()} /></div>
          <div id="ark" className="scroll-mt-4"><ArkSettingsForm initial={arkPublicInfo()} /></div>
          <div id="fal" className="scroll-mt-4"><FalSettingsForm initial={falPublicInfo()} /></div>
          <div id="gemini" className="scroll-mt-4"><VisionSettingsForm initial={visionPublicInfo()} /></div>
          <div id="elevenlabs" className="scroll-mt-4"><ElevenLabsSettingsForm initial={elevenLabsPublicInfo()} /></div>
          </fieldset>
        </div>
        <Card title="数据与费用">
          <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
            <li>API Key 只保存在本机数据库 data/productdrama.db，不进 git，页面只显示末 4 位。</li>
            <li>点 AI 按钮时，会把产品文字资料、创意选择、提案和选角文字档案发送给 DeepSeek；不发送照片。</li>
            <li>费用由你的 DeepSeek 账户承担，每次调用后显示 token 用量。</li>
            <li>AI 结果先预览，确认后才替换现有内容。</li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
