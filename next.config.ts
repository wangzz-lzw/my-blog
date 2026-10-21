import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 生成 standalone 单文件部署产物（.next/standalone/server.js）
  output: "standalone",
};

export default nextConfig;
