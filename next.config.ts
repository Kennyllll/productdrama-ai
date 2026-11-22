import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  // 开发模式左下角的 Next 图标对用户是干扰
  devIndicators: false,
};

export default nextConfig;
