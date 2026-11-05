import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { ProfileForm } from "@/components/ProfileForm";
import { BindEmailForm } from "@/components/auth/BindEmailForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "个人资料" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?returnTo=%2Fprofile");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) redirect("/login");

  return (
    <>
      <ProfileForm
        user={{
          username: user.username ?? "",
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
          joinedAt: formatDate(user.createdAt),
        }}
      />
      {!user.email && <BindEmailForm />}
    </>
  );
}
