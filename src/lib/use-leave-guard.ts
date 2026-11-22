"use client";

import { useEffect } from "react";
import { askConfirm } from "@/components/ConfirmHost";

/** 有没保存的修改时：关标签页 / 刷新 / 点站内链接都先问一句 */
export function useLeaveGuard(dirty: boolean, message = "有没保存的修改，离开就丢了。确定离开吗？") {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const u = new URL(a.href, window.location.href);
      if (u.origin !== window.location.origin || (u.pathname === window.location.pathname && u.search === window.location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      void askConfirm(message).then((ok) => {
        if (ok) window.location.assign(u.toString());
      });
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, message]);
}
