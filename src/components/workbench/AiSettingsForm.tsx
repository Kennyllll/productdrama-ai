"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useState, useTransition } from "react";
import { saveAiSettingsAction, testAiAction } from "@/app/ai-actions";
import { Card } from "@/components/ui";
import { AI_MODEL_LABELS, AI_MODELS, type AiModel, type AiPublicInfo } from "@/lib/ai/models";
import type { FormState } from "@/lib/types";

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";
const btn = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/10 disabled:opacity-40";

function ModelSelect({ label, value, onChange }: { label: string; value: AiModel; onChange: (m: AiModel) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as AiModel)} className={`${field} mt-1`} aria-label={label}>
        {AI_MODELS.map((m) => (
          <option key={m} value={m}>
            {AI_MODEL_LABELS[m]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AiSettingsForm({ initial }: { initial: AiPublicInfo }) {
  const [info, setInfo] = useState(initial);
  const [model, setModel] = useState<AiModel>(initial.model);
  const [storyModel, setStoryModel] = useState<AiModel>(initial.storyModel);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  const save = (clearKey: boolean) =>
    startTransition(async () => {
      const res = await saveAiSettingsAction({ model, storyModel, apiKey, clearKey });
      setStatus(res);
      if (res.info) {
        setInfo(res.info);
        setApiKey("");
      }
    });

  const test = () =>
    startTransition(async () => {
      setStatus({});
      setStatus(await testAiAction());
    });

  return (
    <Card title="文字模型 · DeepSeek">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <ModelSelect label="故事模型（故事内核 / 提案 / 剧本 / 审稿）" value={storyModel} onChange={setStoryModel} />
          <ModelSelect label="分镜模型（分镜 / 测试连接）" value={model} onChange={setModel} />
        </div>
        <label className="block text-sm">
          <span className="text-neutral-400">
            API Key {info.configured ? <span className="text-emerald-300">（已配置 {info.keyHint}，留空则不修改）</span> : <span className="text-amber-200">（未配置）</span>}
          </span>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            aria-label="API Key"
            className={`${field} mt-1 font-mono`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40"
          >
            保存
          </button>
          <button type="button" onClick={test} disabled={pending || !info.configured} className={btn}>
            测试连接
          </button>
          <button
            type="button"
            onClick={async () => await askConfirm("清除本机保存的 API Key？") && save(true)}
            disabled={pending || !info.configured}
            className={btn}
          >
            清除 Key
          </button>
        </div>
        <p role="status" className="min-h-5 text-sm">
          {pending ? <span className="text-neutral-400">处理中…</span> : null}
          {!pending && status.ok ? <span className="text-emerald-300">{status.ok}</span> : null}
          {!pending && status.error ? <span className="text-rose-300">{status.error}</span> : null}
        </p>
      </div>
    </Card>
  );
}
