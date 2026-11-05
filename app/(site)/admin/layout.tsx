import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login?returnTo=%2Fadmin");
  // 仅管理员可进入后台（普通注册用户重定向回首页）
  if (session.user.role !== "ADMIN") redirect("/");

  const who = session.user.username || session.user.email || "admin";
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link href="/admin" className="admin-brand">
          ADMIN<span>.SYS</span>
        </Link>

        <nav className="admin-links" aria-label="后台导航">
          <Link href="/admin">概览</Link>
          <Link href="/admin/posts">文章</Link>
          <Link href="/admin/posts/new">写文章</Link>
          <Link href="/admin/tags">标签</Link>
          <Link href="/admin/comments">评论</Link>
          <Link href="/profile">个人资料</Link>
        </nav>

        <div className="admin-side-foot">
          <span className="admin-user">{who}</span>
          <div className="admin-side-actions">
            <ThemeSwitcher />
            <LogoutButton />
          </div>
          <Link href="/" className="admin-back">
            ← 返回前台
          </Link>
        </div>
      </aside>

      <div className="admin-body">
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
