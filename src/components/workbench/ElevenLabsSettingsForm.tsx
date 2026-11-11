"use client";

import { useState, useTransition } from "react";
import { saveElevenLabsKeyAction, testElevenLabsAction } from "@/app/sound-actions";
import { Card } from "@/components/ui";
import type { FormState } from "@/lib/types";

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm focus:border-amber-400 focus:outline-none";
const btn = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/10 disabled:opacity-40";

export function ElevenLabsSettingsForm({ initial }: { initial: { configured: boolean; keyHint: string } }) {
  const [info, setInfo] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  const save = (clear: boolean) =>
    startTransition(async () => {
      const res = await saveElevenLabsKeyAction({ apiKey, clear });
      setStatus(res);
      if (res.info) {
        setInfo(res.info);
        setApiKey("");
      }
    });

  const test = () =>
    startTransition(async () => {
      setStatus({});
      setStatus(await testElevenLabsAction());
    });

  return (
    <Card title="声音 · ElevenLabs">
      <div className="space-y-4">
        <p className="text-xs text-neutral-400">
          在 elevenlabs.io → Developers → API Keys 创建 Key（勾选 Text to Speech、Music、Sound Effects、Voices 和 User: Read）。用于角色对白、旁白、配乐和音效。按字符 / 时长计费，由你的 ElevenLabs 账户承担。Key 只保存在本机数据库。
        </p>
        <p className="text-sm text-neutral-400">
          状态：{info.configured ? <span className="text-emerald-300">已配置（{info.keyHint}）</span> : <span className="text-amber-200">未配置</span>}
        </p>
        <label className="block text-sm text-neutral-400">
          API Key
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" aria-label="ElevenLabs API Key" placeholder={info.configured ? "留空则不修改" : ""} className={`${field} mt-1`} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save(false)} disabled={pending} className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40">
            保存
          </button>
          <button type="button" onClick={test} disabled={pending || !info.configured} className={btn}>
            测试连接
          </button>
          <button type="button" onClick={() => window.confirm("清除本机保存的 ElevenLabs Key？") && save(true)} disabled={pending || !info.configured} className={btn}>
            清除
          </button>
        </div>
        <div role="status" className="min-h-5 text-sm">
          {pending ? <span className="text-neutral-400">处理中…</span> : null}
          {!pending && status.ok ? <span className="text-emerald-300">{status.ok}</span> : null}
          {!pending && status.error ? <span className="text-rose-300">{status.error}</span> : null}
        </div>
      </div>
    </Card>
  );
}
