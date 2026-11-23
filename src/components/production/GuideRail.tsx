"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { rememberDecisionAction, sendGuideMessageAction } from "@/app/production-actions";
import type { Decision, GuideMessage } from "@/lib/production-repo";

const PAGE_NAMES: Record<string, string> = {
  product: "产品",
  shorts: "短视频",
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

export function GuideRail({
  projectId,
  initialMessages,
  decisions,
  videoTitles = {},
}: {
  projectId: string;
  initialMessages: GuideMessage[];
  decisions: Decision[];
  videoTitles?: Record<string, string>;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<"page" | "all">("page");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const parts = pathname.split("/");
  const page = parts[3] ?? "";
  const shot = search.get("shot") ?? "";
  const videoTitle = page === "shorts" && parts[4] ? (videoTitles[parts[4]] ?? "") : "";
  const pageLabel = videoTitle || (PAGE_NAMES[page] ?? "项目总览");
  const context = [shot ? `E2-${shot}` : "", videoTitle ? `短视频 · ${videoTitle}` : pageLabel].filter(Boolean).join(" · ");

  const shown = useMemo(
    () => (scope === "page" ? messages.filter((m) => m.origin !== "import" && m.context.includes(shot ? shot : pageLabel)) : messages),
    [messages, scope, shot, pageLabel],
  );

  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem("guide-open", v ? "1" : "0");
    } catch {}
  };
  useEffect(() => {
    try {
      if (localStorage.getItem("guide-open") === "1") setOpenState(true);
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenState(true);
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
        className="fixed right-4 top-2 z-30 rounded-full border border-amber-400/40 bg-neutral-900 px-3 py-1 text-xs text-amber-200 hover:bg-amber-400/10"
        title="打开 AI 大脑（⌘K / Ctrl+K）"
      >
        问 AI 大脑
      </button>
    );
  }

  return (
    <aside aria-label="AI 大脑" className="sticky top-12 flex h-[calc(100vh-3rem)] w-[340px] shrink-0 flex-col border-l border-amber-400/30 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-amber-200">AI 大脑</p>
          <p className="text-[11px] text-neutral-500">⌘K 随时呼出</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-white/15 px-2 py-0.5 text-xs text-neutral-300 hover:bg-white/5">
          收起 ›
        </button>
      </div>
      <p className="border-b border-white/10 px-4 py-2 text-xs text-neutral-400">
        正在看：<span className="text-sky-200">{context}</span>
      </p>
      <details className="border-b border-white/10 px-4 py-2 text-xs">
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
        <button type="button" onClick={() => setScope("page")} className={`rounded px-2 py-0.5 ${scope === "page" ? "bg-white/10 text-white" : "text-neutral-400"}`}>
          只看这一页
        </button>
        <button type="button" onClick={() => setScope("all")} className={`rounded px-2 py-0.5 ${scope === "all" ? "bg-white/10 text-white" : "text-neutral-400"}`}>
          全部对话（{messages.length}）
        </button>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {shown.length === 0 ? <p className="text-xs text-neutral-500">这一页还没有对话。</p> : null}
        {shown.map((m) => (
          <div key={m.id} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-6 bg-sky-400/10 text-sky-50" : "mr-6 bg-white/5 text-neutral-200"}`}>
            <p className="mb-1 flex flex-wrap items-center gap-1 text-[10px] text-neutral-500">
              <span>{m.role === "user" ? "你" : "AI 大脑"}</span>
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
          placeholder="跟 AI 大脑说你的意思，比如“这里让爸爸慢一点”"
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
