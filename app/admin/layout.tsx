import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="admin-shell">
      <nav className="admin-nav">
        <div className="container">
          <Link href="/admin">首页</Link>
          <Link href="/admin/posts">文章管理</Link>
          <Link href="/admin/posts/new">写文章</Link>
          <Link href="/admin/comments">评论管理</Link>
          <span className="spacer" />
          <Link href="/">前台</Link>
        </div>
      </nav>
      <main className="admin-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
