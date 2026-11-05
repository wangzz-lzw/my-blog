import { RegisterForm } from "@/components/RegisterForm";

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

  return <RegisterForm returnTo={safeReturnTo} />;
}
