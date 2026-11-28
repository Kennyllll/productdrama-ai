import { PageHeader } from "@/components/ui";
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
  const actor = await currentActor();
  const admin = actor.role === "admin";
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="设置" description="「必填」的 Key 都打勾，就能做短视频。Key 只有管理员能改。" />
      <div className="space-y-6">
        <div className="space-y-6">
          <IdentityPanel />
          <KeyChecklist />
          <details open={admin} className="group rounded-xl border border-white/10 bg-neutral-900/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-white">
            修改 Key 和模型 <span className="ml-1 text-xs font-normal text-neutral-500">{admin ? "管理员" : actor.pinSet ? "新手只能看，不能改" : "第一次用：先在上面设管理员 PIN"}</span>
          </summary>
          {!admin ? (
            <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {actor.pinSet ? <>要改 Key 请切换管理员。 <NeedAdmin /></> : "第一次用还没有管理员：在上面「身份」里设一个管理员 PIN，设好就能填 Key。"}
            </p>
          ) : null}
          <fieldset disabled={!admin} className="mt-4 space-y-6 disabled:opacity-70">
          <div id="kimi" className="scroll-mt-4"><BrainSettingsForm initial={brainPublicInfo()} /></div>
          <div id="deepseek" className="scroll-mt-4"><AiSettingsForm initial={aiPublicInfo()} /></div>
          <div id="higgsfield" className="scroll-mt-4"><HiggsfieldSettingsForm initial={hfPublicInfo()} /></div>
          <div id="ark" className="scroll-mt-4"><ArkSettingsForm initial={arkPublicInfo()} /></div>
          <div id="fal" className="scroll-mt-4"><FalSettingsForm initial={falPublicInfo()} /></div>
          <div id="gemini" className="scroll-mt-4"><VisionSettingsForm initial={visionPublicInfo()} /></div>
          <div id="elevenlabs" className="scroll-mt-4"><ElevenLabsSettingsForm initial={elevenLabsPublicInfo()} /></div>
          </fieldset>
          </details>
        </div>
        <details className="text-sm text-neutral-400">
          <summary className="cursor-pointer">Key 存在哪、会发什么数据</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>API Key 只存在服务器的数据库里，页面只显示末 4 位。</li>
            <li>点 AI 按钮时，会把产品文字资料、创意选择、提案和选角文字档案发送给 DeepSeek；不发送照片。</li>
            <li>费用由你的 DeepSeek 账户承担，每次调用后显示 token 用量。</li>
            <li>AI 结果先预览，确认后才替换现有内容。</li>
          </ul>
        </details>
      </div>
    </main>
  );
}
