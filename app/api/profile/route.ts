import { NextRequest, NextResponse } from "next/server";
import { auth, unstable_update } from "@/auth";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AVATAR_LEN = 250_000; // data URL 长度上限（约 180KB 图片）

/** 当前用户资料 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }
  return NextResponse.json(user);
}

/** 更新昵称 / 邮箱 / 头像 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const data: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (name.length > 30) {
      return NextResponse.json({ error: "昵称最多 30 个字符" }, { status: 400 });
    }
    data.name = name || null;
  }

  if (body.email !== undefined) {
    const email = String(body.email ?? "").trim();
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }
    if (email) {
      const occupied = await prisma.user.findFirst({
        where: { email, NOT: { id: session.user.id } },
        select: { id: true },
      });
      if (occupied) {
        return NextResponse.json({ error: "邮箱已被其他账号使用" }, { status: 409 });
      }
    }
    data.email = email || null;
  }

  if (body.avatar !== undefined) {
    let avatar = String(body.avatar ?? "").trim();
    // 容错：允许省略协议的图片地址（如 bucket.oss-cn-beijing.aliyuncs.com/x.jpg）
    if (avatar && !/^(https?:\/\/|data:image\/|\/)/.test(avatar)) {
      if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(avatar)) {
        avatar = `https://${avatar}`;
      }
    }
    if (!avatar) {
      data.avatar = null;
    } else if (avatar.startsWith("data:image/")) {
      if (avatar.length > MAX_AVATAR_LEN) {
        return NextResponse.json(
          { error: "头像图片过大，请换一张（≤300KB）" },
          { status: 400 }
        );
      }
      if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(avatar)) {
        return NextResponse.json({ error: "头像格式不支持" }, { status: 400 });
      }
      data.avatar = avatar;
    } else if (/^https?:\/\//.test(avatar) || avatar.startsWith("/")) {
      if (avatar.length > 500) {
        return NextResponse.json({ error: "头像链接过长" }, { status: 400 });
      }
      data.avatar = avatar;
    } else {
      return NextResponse.json(
        { error: "头像需为图片地址（http/https）或上传文件" },
        { status: 400 }
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有需要保存的修改" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      createdAt: true,
    },
  });

  // 让当前 JWT 里的 name / email 立即刷新（头像不进 token，由 /api/me 提供）
  await unstable_update({
    user: {
      name: user.name,
      email: user.email,
    },
  });

  return NextResponse.json({ ok: true, user });
}
