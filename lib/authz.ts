import { auth } from "@/auth";

/** 已登录且为管理员才返回 session，否则 null */
export async function getAdminSession() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}
