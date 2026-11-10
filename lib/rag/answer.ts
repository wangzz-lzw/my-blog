/**
 * 站内问答的作答逻辑（见 openspec: add-ai-qa 的 D4 / D5）。
 *
 * 两件事：
 *   1. 拒答判定 —— 检索分数不够时**不调用模型**，直接给固定文案 + 可答话题。
 *      这是代码的确定性行为，不依赖模型自觉说"我不知道"。
 *   2. 流式生成 —— 依据命中的块作答，逐段吐出。
 */
import type { RetrievedChunk, Topic } from "@/lib/rag/retrieve";

/** 拒答时的固定文案：不道歉、不模糊，说清"没有"与"能答什么" */
export const REFUSAL_TEXT =
  "站上的文章里没有能回答这个问题的内容。\n\n" +
  "我只根据这个博客已发布的文章回答，不会用别处的知识补充——所以不知道就是不知道。";

/**
 * 模型判断"资料不足以回答"时只输出这个标记，代码据此转成标准拒答。
 *
 * 为什么要有这层：阈值只能挡住"完全无关"的问题。有些问题话题相近、检索分数够高，
 * 但命中的块里恰好没有答案（实测：问"Agent 和 Chain 有什么区别"，召回的块分数 0.536，
 * 内容却在讲别的）。这时模型最自然的反应是复述一遍资料再说"没有"，读起来很啰嗦。
 * 让它只吐一个固定标记，代码统一换成拒答文案——输出可控、可断言。
 */
export const NOT_ENOUGH_MARKER = "[[NOT_ENOUGH]]";

export type AnswerEvent =
  | { type: "stage"; stage: "retrieving" | "generating" | "refused" | "done" }
  | { type: "sources"; sources: { title: string; slug: string }[] }
  | { type: "topics"; topics: Topic[] }
  | { type: "delta"; text: string }
  | { type: "error"; message: string };

const SYSTEM_PROMPT = [
  "你是一个博客站内的问答助手。你只能依据「参考资料」里给出的文章片段回答。",
  "",
  "硬性规则：",
  "1. 只使用参考资料中的信息。资料里没有的，一律回答不知道，禁止用你自己的知识补充、",
  "   禁止推测、禁止举例说明站外内容。",
  `2. **如果参考资料里没有能直接回答这个问题的内容，只输出 ${NOT_ENOUGH_MARKER} 这一个标记，`,
  "   不要写任何解释。** 话题相近但没有答案，也属于这种情况。",
  "3. 每个实质性结论后面用 [1] [2] 这样的编号标注它来自第几条资料。",
  "4. 如果资料只部分覆盖了问题，就回答被覆盖的部分，并明确说其余部分资料里没有。",
  "5. 用中文、平实的语气，直接给答案；不要复述问题，也不要用「根据资料」这类开场白。",
  "6. 长度控制在 300 字以内，除非问题本身需要更长的解释。",
].join("\n");

/** 把命中的块编号后拼成参考资料 */
function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => {
      const head = c.heading ? `（小节：${c.heading}）` : "";
      return `[${i + 1}] 文章《${c.postTitle}》${head}\n${c.text}`;
    })
    .join("\n\n---\n\n");
}

/** 命中的文章去重后作为引用来源，按首次出现顺序 */
export function sourcesOf(chunks: RetrievedChunk[]): { title: string; slug: string }[] {
  const seen = new Set<string>();
  const out: { title: string; slug: string }[] = [];
  for (const c of chunks) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    out.push({ title: c.postTitle, slug: c.slug });
  }
  return out;
}

export type StreamChunk = { text: string };

/**
 * 调用 OpenAI 兼容的流式 `/chat/completions`，逐块产出文本。
 *
 * 用原生 fetch + ReadableStream，不引 AI SDK：这里只需要一个 SSE 解析循环，
 * 二十行就够，而 SDK 会带来额外的依赖与协议层。
 */
export async function* streamAnswer(
  question: string,
  chunks: RetrievedChunk[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const key = process.env.AI_API_KEY?.trim();
  const base = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!key || !base || !model) {
    throw new Error("AI 未配置：请在 .env 中填写 AI_API_KEY / AI_BASE_URL / AI_MODEL");
  }

  const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.2, // 低温度：这个场景要的是忠实，不是创意
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `参考资料：\n\n${buildContext(chunks)}\n\n---\n\n问题：${question}`,
        },
      ],
    }),
    signal,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`AI 服务返回 ${res.status}${detail ? "：" + detail : ""}`);
  }
  if (!res.body) throw new Error("AI 服务没有返回流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE：事件以空行分隔，每行 data: ...
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield { text };
        } catch {
          // 单行解析失败不该中断整个流
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
