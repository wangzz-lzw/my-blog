import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 注意：Docker 部署用完整 node_modules + `next start`（容器启动时还要跑
  // prisma migrate/seed），因此不要开 output: "standalone"——standalone
  // 产物必须用 node .next/standalone/server.js 启动，与 next start 冲突。
  // 允许通过 127.0.0.1 访问（部分浏览器/工具访问 localhost 时走 IPv6）
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // ali-oss（Node SDK，依赖动态 require）不打进 bundle，运行时从 node_modules 加载
  serverExternalPackages: ["ali-oss"],
  // 欢迎页已经搬到根路径，旧地址用 301 收口（永久，且不产生重复内容）
  async redirects() {
    return [{ source: "/welcome", destination: "/", statusCode: 301 }];
  },
};

export default nextConfig;
