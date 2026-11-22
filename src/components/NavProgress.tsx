"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** 点站内链接后页面顶部马上出现一条琥珀色进度条，新页面出来就消失 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [on, setOn] = useState(false);
  useEffect(() => setOn(false), [pathname, search]);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const u = new URL(a.href, window.location.href);
      if (u.origin !== window.location.origin || u.pathname.startsWith("/api/")) return;
      if (u.pathname === window.location.pathname && u.search === window.location.search) return;
      setOn(true);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), 15_000);
    return () => clearTimeout(t);
  }, [on]);
  if (!on) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-amber-400/20">
      <div className="pd-nav-bar h-full w-1/3 bg-amber-400" />
    </div>
  );
}
