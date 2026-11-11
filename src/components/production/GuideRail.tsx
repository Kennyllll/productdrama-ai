"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { rememberDecisionAction, sendGuideMessageAction } from "@/app/production-actions";
import type { Decision, GuideMessage } from "@/lib/production-repo";

const PAGE_NAMES: Record<string, string> = {
  product: "产品",
  creative: "创意",
  casting: "选角",
  script: "剧本",
  storyboard: "分镜",
  sound: "声音",
  video: "视频制作",
  shots: "镜头卡",
  timeline: "时间线",
  set: "3D 布景",
  ledger: "费用账本",
  rules: "规则库",
};

export function GuideRail({ projectId, initialMessages, decisions }: { projectId: string; initialMessages: GuideMessage[]; decisions: Decision[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [onlyShot, setOnlyShot] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const page = pathname.split("/")[3] ?? "";
  const shot = search.get("shot") ?? "";
  const context = [shot ? `E2-${shot}` : "", PAGE_NAMES[page] ?? "项目总览"].filter(Boolean).join(" · ");

  const shown = useMemo(() => (onlyShot && shot ? messages.filter((m) => m.context.includes(shot)) : messages), [messages, onlyShot, shot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [shown.length, open]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setError("");
    startTransition(async () => {
      const r = await sendGuideMessageAction(projectId, t, context);
      if (r.error) return setError(r.error);
      setMessages((m) => [...m, ...(r.messages ?? [])]);
      setText("");
    });
  };

  const remember = (m: GuideMessage) =>
    startTransition(async () => {
      const r = await rememberDecisionAction(projectId, m.text, m.context);
      if (r.error) setError(r.error);
      else router.refresh();
    });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sticky top-14 mt-8 shrink-0 rounded-l-lg border border-r-0 border-amber-400/40 bg-neutral-900 px-1.5 py-3 text-xs text-amber-200 [writing-mode:vertical-rl]"
        title="打开 AI 导演向导（⌘K / Ctrl+K）"
      >
        AI 导演向导 ‹
      </button>
    );
  }

  return (
    <aside aria-label="AI 导演向导" className="sticky top-12 flex h-[calc(100vh-3rem)] w-[340px] shrink-0 flex-col border-l border-amber-400/30 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-amber-200">AI 导演向导</p>
          <p className="text-[11px] text-neutral-500">整个项目一条对话 · ⌘K 随时呼出</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-white/15 px-2 py-0.5 text-xs text-neutral-300 hover:bg-white/5">
          收起 ›
        </button>
      </div>
      <p className="border-b border-white/10 px-4 py-2 text-xs text-neutral-400">
        正在看：<span className="text-sky-200">{context}</span>
      </p>
      <details className="border-b border-white/10 px-4 py-2 text-xs" open>
        <summary className="cursor-pointer text-neutral-300">决定记录（{decisions.length}）</summary>
        <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-neutral-400">
          {decisions.slice(-8).map((d) => (
            <li key={d.id}>
              · {d.text}
              {d.context ? <span className="ml-1 text-neutral-600">（{d.context}）</span> : null}
            </li>
          ))}
        </ul>
        <Link href={`/projects/${projectId}/rules`} className="mt-1 inline-block text-amber-200/80 underline">
          全部决定和规则
        </Link>
      </details>
      <div className="flex gap-2 px-4 pt-2 text-[11px]">
        <button type="button" onClick={() => setOnlyShot(false)} className={`rounded px-2 py-0.5 ${!onlyShot ? "bg-white/10 text-white" : "text-neutral-400"}`}>
          全部对话
        </button>
        <button
          type="button"
          disabled={!shot}
          onClick={() => setOnlyShot(true)}
          className={`rounded px-2 py-0.5 disabled:opacity-40 ${onlyShot ? "bg-white/10 text-white" : "text-neutral-400"}`}
        >
          只看{shot ? ` E2-${shot}` : "当前镜头"}
        </button>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {shown.length === 0 ? <p className="text-xs text-neutral-500">还没有对话。</p> : null}
        {shown.map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-6 bg-sky-400/10 text-sky-50" : "mr-6 bg-white/5 text-neutral-200"}`}>
            <p className="mb-1 flex flex-wrap items-center gap-1 text-[10px] text-neutral-500">
              <span>{m.role === "user" ? "你" : "向导"}</span>
              {m.context ? <span className="rounded bg-sky-400/15 px-1 text-sky-200">{m.context}</span> : null}
              {m.origin === "import" ? <span className="rounded bg-white/10 px-1">E2 历史</span> : null}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
            {m.role === "user" && m.origin !== "import" ? (
              <button type="button" disabled={pending} onClick={() => remember(m)} className="mt-1 text-[11px] text-amber-200/80 underline disabled:opacity-50">
                记成决定
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <form
        className="border-t border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="跟向导说你的意思，比如“这里让爸爸慢一点”"
          className="w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-amber-400/60 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">{error || "向导还没接模型：消息会存进项目对话"}</span>
          <button type="submit" disabled={pending || !text.trim()} className="rounded-lg bg-amber-400 px-3 py-1 text-sm font-medium text-black disabled:opacity-40">
            发送
          </button>
        </div>
      </form>
    </aside>
  );
}
