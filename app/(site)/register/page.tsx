import { AuthCard } from "@/components/AuthCard";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const safeReturnTo =
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.startsWith("/login") &&
    !returnTo.startsWith("/register")
      ? returnTo
      : "/";

  return <AuthCard initialTab="register" returnTo={safeReturnTo} />;
}
