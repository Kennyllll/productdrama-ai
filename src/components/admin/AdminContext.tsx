"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@/lib/admin-labels";

export interface ActorView {
  role: Role;
  name: string;
  pinSet: boolean;
}

const Ctx = createContext<ActorView>({ role: "novice", name: "新手", pinSet: false });

export function AdminProvider({ actor, children }: { actor: ActorView; children: ReactNode }) {
  return <Ctx.Provider value={actor}>{children}</Ctx.Provider>;
}

export const useActor = () => useContext(Ctx);
export const useIsAdmin = () => useContext(Ctx).role === "admin";

/** 放在点不了的按钮旁边：为什么点不了 + 去哪切换 */
export function NeedAdmin({ className = "" }: { className?: string }) {
  if (useIsAdmin()) return null;
  return (
    <Link href="/settings#identity" className={`text-xs text-amber-300 underline decoration-dotted ${className}`} title="到「设置 → 身份」输入管理员 PIN">
      需要管理员
    </Link>
  );
}
