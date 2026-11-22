// 设置页顶部：哪几个 Key 必填、各管什么、去哪拿。服务端组件，DeepSeek 顺便查余额（免费接口）。
import { Card, Tag } from "@/components/ui";
import { deepseekBalance } from "@/lib/ai/balance";
import { aiPublicInfo, getAiSettings } from "@/lib/ai/settings";
import { arkPublicInfo } from "@/lib/ark";
import { brainPublicInfo } from "@/lib/brain/kimi";
import { elevenLabsPublicInfo } from "@/lib/elevenlabs";
import { falPublicInfo } from "@/lib/fal";
import { hfPublicInfo } from "@/lib/higgsfield";
import { visionPublicInfo } from "@/lib/vision-qa";

interface Row {
  id: string;
  name: string;
  need: "必填" | "建议" | "可选";
  does: string;
  where: string;
  ok: boolean;
  extra?: string;
}

export async function KeyChecklist() {
  const ai = getAiSettings();
  const bal = ai.apiKey && ai.baseUrl.includes("deepseek.com") ? await deepseekBalance(ai.baseUrl, ai.apiKey) : null;
  const rows: Row[] = [
    { id: "deepseek", name: "DeepSeek", need: "必填", does: "写创意、剧本、分镜", where: "platform.deepseek.com → API keys", ok: aiPublicInfo().configured, extra: bal ? `余额 ${bal.text}${bal.ok ? "" : "，不够了，先充值"}` : undefined },
    { id: "higgsfield", name: "Higgsfield", need: "必填", does: "出首帧；有人的镜头出视频", where: "console.higgsfield.ai → API 凭证（Key ID + Secret）", ok: hfPublicInfo().configured, extra: "余额请到 Higgsfield 网站看（没有查余额接口）" },
    { id: "ark", name: "火山方舟", need: "必填", does: "只拍产品的镜头出视频（Seedance）", where: "火山引擎控制台 → 火山方舟 → API Key 管理", ok: arkPublicInfo().configured, extra: "Seedance 2.x 要求账户余额超过 200 元，请到火山引擎控制台看" },
    { id: "gemini", name: "Gemini", need: "建议", does: "首帧自动质检；不填就靠你自己看", where: "aistudio.google.com → Get API key", ok: visionPublicInfo().configured },
    { id: "fal", name: "fal.ai", need: "可选", does: "没有 3D 文件时用照片建 3D 模型", where: "fal.ai → Dashboard → Keys", ok: falPublicInfo().configured },
    { id: "kimi", name: "Kimi（项目大脑）", need: "可选", does: "项目对话框里给建议", where: "platform.kimi.ai → API Keys", ok: brainPublicInfo().configured },
    { id: "elevenlabs", name: "ElevenLabs", need: "可选", does: "配音和音效", where: "elevenlabs.io → 个人设置 → API Keys", ok: elevenLabsPublicInfo().configured },
  ];
  const missing = rows.filter((r) => r.need === "必填" && !r.ok);
  return (
    <Card title="先看这里：要填哪些 Key">
      <p className={`mb-3 text-sm ${missing.length ? "text-amber-200" : "text-emerald-200"}`}>
        {missing.length ? `做短视频还差 ${missing.map((r) => r.name).join("、")} 的 Key。` : "做短视频要的 3 个 Key 都填了。"}
      </p>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-1 rounded-lg bg-white/5 p-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
            <span className="flex items-center gap-2">
              <Tag tone={r.need === "必填" ? "amber" : undefined}>{r.need}</Tag>
              <a href={`#${r.id}`} className="text-white underline decoration-white/20 underline-offset-4 hover:text-amber-200">
                {r.name}
              </a>
            </span>
            <span className="text-neutral-300">
              {r.does}
              <span className="block text-xs text-neutral-500">去哪拿：{r.where}</span>
              {r.extra && r.ok ? <span className="block text-xs text-neutral-400">{r.extra}</span> : null}
            </span>
            <span className={`text-xs ${r.ok ? "text-emerald-300" : r.need === "必填" ? "text-rose-300" : "text-neutral-500"}`}>{r.ok ? "✓ 已填" : "没填"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
