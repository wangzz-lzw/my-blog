import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getRetriever,
  listTopics,
  minScoreFor,
  TOP_K,
  type RetrievedChunk,
} from "@/lib/rag/retrieve";
import {
  NOT_ENOUGH_MARKER,
  REFUSAL_TEXT,
  sourcesOf,
  streamAnswer,
  type AnswerEvent,
} from "@/lib/rag/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- 限流：未登录按来源、登录按账号，两条独立窗口 ---------- */

const WINDOW_MS = 5 * 60_000;
const LIMIT_ANON = 10;
const LIMIT_USER = 20;
const hits = new Map<string, number[]>();

function take(key: string, limit: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    const oldest = recent[0];
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - oldest)) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfter: 0 };
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/* ---------- SSE 工具 ---------- */

function encodeEvent(e: AnswerEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`);
}

export async function POST(req: NextRequest) {
  /* ---------- 1) 校验问题（先于限流：格式错的不该消耗额度） ---------- */
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) {
    return Response.json({ error: "请先输入问题" }, { status: 400 });
  }

  /* ---------- 2) 取会话与限流 ---------- */
  let userId: string | null = null;
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    userId = session?.user?.id ?? null;
  } catch {
    // 会话读取失败按未登录处理，不影响问答
  }

  const rl = take(userId ? `u:${userId}` : `ip:${clientIp(req)}`, userId ? LIMIT_USER : LIMIT_ANON);
  if (!rl.ok) {
    return Response.json(
      { error: `提问太频繁了，请 ${rl.retryAfter} 秒后再试`, retryAfter: rl.retryAfter },
      { status: 429 }
    );
  }

  /* ---------- 3) AI 未配置：直接告知，不走检索 ---------- */
  if (!process.env.AI_API_KEY?.trim() || !process.env.AI_BASE_URL?.trim() || !process.env.AI_MODEL?.trim()) {
    return Response.json(
      {
        error:
          "问答功能未配置：请在 .env 填写 AI_API_KEY / AI_BASE_URL / AI_MODEL",
      },
      { status: 503 }
    );
  }

  /* ---------- 4) 站上一篇文章都没有 ---------- */
  const publishedCount = await prisma.post.count({ where: { published: true } });
  if (publishedCount === 0) {
    return Response.json(
      { error: "站上还没有已发布的文章，暂时没有可以回答的内容" },
      { status: 503 }
    );
  }

  /* ---------- 5) 流式响应 ---------- */
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AnswerEvent) => {
        try {
          controller.enqueue(encodeEvent(e));
        } catch {
          // 客户端已断开
        }
      };

      try {
        send({ type: "stage", stage: "retrieving" });

        const retriever = await getRetriever();
        let chunks: RetrievedChunk[] = [];
        try {
          chunks = await retriever.retrieve(question, TOP_K);
        } catch (e) {
          send({ type: "error", message: e instanceof Error ? e.message : "检索失败" });
          controller.close();
          return;
        }

        const top = chunks[0]?.score ?? 0;
        const threshold = minScoreFor(retriever.mode);

        // 【关键】分数不够就不调模型 —— 拒答是代码的确定性行为
        if (chunks.length === 0 || top < threshold) {
          const topics = await listTopics();
          send({ type: "sources", sources: [] });
          send({ type: "stage", stage: "refused" });
          send({ type: "topics", topics });
          send({ type: "delta", text: REFUSAL_TEXT });
          send({ type: "stage", stage: "done" });
          controller.close();
          return;
        }

        // 命中：先发来源，让引用块立刻渲染出来，正文再逐字填
        send({ type: "sources", sources: sourcesOf(chunks) });
        send({ type: "stage", stage: "generating" });

        /**
         * 缓冲前若干字符，判断模型是不是吐了 NOT_ENOUGH 标记。
         *
         * 为什么要缓冲而不是直接转发：模型如果判断"资料里没有"，会输出那个标记。
         * 直接转发的话用户会先看到 `[[NOT_ENOUGH` 再被替换，闪一下很难看。
         * 缓冲到能判定为止（标记很短），之后要么整段换成拒答、要么把缓冲内容放出去继续流式。
         */
        const MARKER = NOT_ENOUGH_MARKER;
        let pending = "";
        let decided: "answer" | "refuse" | null = null;

        for await (const piece of streamAnswer(question, chunks, req.signal)) {
          if (decided === "answer") {
            send({ type: "delta", text: piece.text });
            continue;
          }
          if (decided === "refuse") break;

          pending += piece.text;

          // 一旦出现标记前缀就继续等；如果已确定不是标记（长度超过标记仍无匹配）就放行
          if (pending.trimStart().startsWith(MARKER.slice(0, Math.min(pending.trimStart().length, MARKER.length)))) {
            if (pending.includes(MARKER)) {
              decided = "refuse";
              break;
            }
            // 还可能是标记的开头，继续缓冲
            continue;
          }

          // 已经不可能是指标了：把缓冲整段放出去，转入正常流式
          decided = "answer";
          if (pending) send({ type: "delta", text: pending });
          pending = "";
        }

        // 流结束但还没判定（输出很短、可能就是标记本身）
        if (decided === null) {
          if (pending.includes(MARKER)) decided = "refuse";
          else if (pending) {
            decided = "answer";
            send({ type: "delta", text: pending });
          }
        }

        if (decided === "refuse") {
          const topics = await listTopics();
          send({ type: "sources", sources: [] });
          send({ type: "stage", stage: "refused" });
          send({ type: "topics", topics });
          send({ type: "delta", text: REFUSAL_TEXT });
        }

        send({ type: "stage", stage: "done" });
        controller.close();
      } catch (e) {
        const message = e instanceof Error ? e.message : "生成失败";
        send({ type: "error", message });
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 让 Nginx 不要缓冲这条响应（现有配置已全局 proxy_buffering off，这里再声明一次）
      "X-Accel-Buffering": "no",
    },
  });
}
