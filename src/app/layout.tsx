import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ConfirmHost } from "@/components/ConfirmHost";
import { NavProgress } from "@/components/NavProgress";
import { Suspense } from "react";
import { listLocalProjects } from "@/lib/repo";
import { currentActor } from "@/lib/admin";
import { AdminProvider } from "@/components/admin/AdminContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProductDrama AI · 产品短剧工作台",
  description: "产品电影级连续短剧制作工作台（本地原型）",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const projects = listLocalProjects().map((p) => ({ id: p.id, name: p.name, kind: p.kind }));
  const actor = await currentActor();
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AdminProvider actor={actor}>
          <AppShell projects={projects}>{children}</AppShell>
        </AdminProvider>
        <ConfirmHost />
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
      </body>
    </html>
  );
}
