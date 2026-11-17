import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ConfirmHost } from "@/components/ConfirmHost";
import { listLocalProjects } from "@/lib/repo";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProductDrama AI · 产品短剧工作台",
  description: "产品电影级连续短剧制作工作台（本地原型）",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const projects = listLocalProjects().map((p) => ({ id: p.id, name: p.name, kind: p.kind }));
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppShell projects={projects}>{children}</AppShell>
        <ConfirmHost />
      </body>
    </html>
  );
}
