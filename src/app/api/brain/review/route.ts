// 本机开发用：让大脑检查某条短视频的第 N 镜（只读，不改数据）。生产环境关闭。
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { reviewShot } from "@/lib/brain/review";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const off = () => process.env.NODE_ENV === "production";

export async function GET() {
  if (off()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = getDb().prepare("SELECT id, project_id, title FROM short_videos ORDER BY updated_at DESC").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  if (off()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { videoId?: string; shot?: number };
  try {
    return NextResponse.json(await reviewShot(String(b.videoId ?? ""), Number(b.shot)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "失败" }, { status: 500 });
  }
}
