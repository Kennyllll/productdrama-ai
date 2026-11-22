"use client";

import { useEffect, useRef, useState } from "react";
import { runPulseAction } from "@/app/run-actions";
import { pollDelay, pulseKey, type RunPulse } from "@/lib/run-poll";

/**
 * 有任务在跑才轮询（on=true）：每次只取轻量戳，有变化才调 onChange 去取完整状态；
 * 切到别的标签页就暂停，切回来马上查一次；间隔 2 秒 → 4 秒 → 8 秒逐步放慢。
 */
export function useRunPoll(videoId: string, on: boolean, onChange: () => void): RunPulse["typical"] {
  const [typical, setTypical] = useState<RunPulse["typical"]>({});
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  useEffect(() => {
    if (!on) return;
    let alive = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: string | null = null;
    const t0 = Date.now();
    const schedule = () => {
      const d = pollDelay(Date.now() - t0, document.hidden);
      if (alive && d !== null) timer = setTimeout(tick, d);
    };
    const tick = async () => {
      timer = undefined;
      if (busy || document.hidden) return;
      busy = true;
      const p = await runPulseAction(videoId).catch(() => null);
      busy = false;
      if (!alive) return;
      if (p) {
        setTypical(p.typical);
        const k = pulseKey(p);
        if (last !== null && k !== last) cb.current();
        last = k;
      }
      schedule();
    };
    const vis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = undefined;
      } else if (!timer && !busy) {
        // 切回来先取一次完整状态：后台那段时间可能已经好了
        cb.current();
        void tick();
      }
    };
    void tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [videoId, on]);
  return typical;
}
