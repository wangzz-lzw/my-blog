import { auth } from "@/auth";
import { NextResponse } from "next/server";

// 守卫后台：未登录访问 /admin/* 时，跳转到登录页并携带 returnTo
// （JWT 策略下 middleware 只解析会话，不会触发 prisma；本项目为 Docker
//  自托管，middleware 运行在 Node 运行时，lib/prisma 的引入没有 edge 问题）
export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set(
      "returnTo",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
