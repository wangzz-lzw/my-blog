import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  // 只允许站内相对路径（防开放重定向）：允许 /admin 与文章页等回跳
  const safeReturnTo =
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.startsWith("/login")
      ? returnTo
      : "/admin";

  return <LoginForm returnTo={safeReturnTo} />;
}
