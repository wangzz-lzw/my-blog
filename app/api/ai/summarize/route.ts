import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authz";
import { isAiConfigured, summarizePost } from "@/lib/ai";

// 简单限流：每个用户每分钟最多 10 次（单实例部署够用）
const requests = new Map<string, number[]>();
const LIMIT = 10;
const WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI 未配置：请在 .env 中填写 AI_API_KEY / AI_BASE_URL / AI_MODEL" },
      { status: 503 }
    );
  }

  const uid = session.user.id;
  const now = Date.now();
  const recent = (requests.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429 }
    );
  }
  recent.push(now);
  requests.set(uid, recent);

  const body = await req.json().catch(() => null);
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const content = body && typeof body.content === "string" ? body.content.trim() : "";
  const tags =
    body && typeof body.tags === "string" ? body.tags.trim().slice(0, 100) : "";

  if (!title || !content) {
    return NextResponse.json(
      { error: "标题和正文不能为空" },
      { status: 400 }
    );
  }

  try {
    const result = await summarizePost({ title, content, tags });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 生成失败";
    const configured = msg.includes("未配置");
    return NextResponse.json(
      { error: configured ? msg : "AI 生成失败，请稍后重试" },
      { status: configured ? 503 : 502 }
    );
  }
}
