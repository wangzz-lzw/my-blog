import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        identifier: { label: "用户名或邮箱", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const identifier = (
          credentials?.identifier as string | undefined
        )?.trim();
        const password = credentials?.password as string | undefined;
        if (!identifier || !password) return null;

        // 支持用户名或邮箱登录
        const user = await prisma.user.findFirst({
          where: {
            OR: [{ username: identifier }, { email: identifier }],
          },
        });
        if (!user) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name ?? user.username ?? null,
          email: user.email ?? null,
          username: user.username ?? null,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session: sessionUpdate }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username ?? null;
        token.name = user.name ?? null;
        if (user.email !== undefined) token.email = user.email ?? undefined;
      }
      // unstable_update() 触发：把资料修改同步到当前 JWT。
      // 注意：头像可能是 data URL（几十 KB），绝不放进 JWT/cookie——
      // 否则 cookie 超 4KB 直接 431/浏览器崩溃；头像由 /api/me 单独读取。
      if (trigger === "update" && sessionUpdate?.user) {
        const u = sessionUpdate.user as {
          name?: string | null;
          email?: string | null;
        };
        if (u.name !== undefined) token.name = u.name;
        if (u.email !== undefined) token.email = u.email ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "READER";
        session.user.username = (token.username as string | null) ?? null;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
});
