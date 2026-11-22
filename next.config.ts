import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  // 一键启动用 .next-app（scripts/app.mjs），开发模式仍用 .next：同时开着也不会互相弄坏
  distDir: process.env.PD_DIST || ".next",
  // 开发模式左下角的 Next「N」调试图标：新手看不懂，关掉
  devIndicators: false,
};

export default nextConfig;
