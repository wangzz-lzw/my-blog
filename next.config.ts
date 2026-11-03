import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 生成 standalone 单文件部署产物（.next/standalone/server.js）
  output: "standalone",
  // 允许通过 127.0.0.1 访问（部分浏览器/工具访问 localhost 时走 IPv6）
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // ali-oss（Node SDK，依赖动态 require）不打进 bundle，运行时从 node_modules 加载
  serverExternalPackages: ["ali-oss"],
};

export default nextConfig;
