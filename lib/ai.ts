// AI 客户端（仅服务端使用，API key 不会下发到浏览器）
// 使用 OpenAI 兼容的 /chat/completions 接口，通过 .env 切换供应商：
//   AI_API_KEY / AI_BASE_URL / AI_MODEL
// 示例（DeepSeek）：AI_BASE_URL="https://api.deepseek.com/v1"  AI_MODEL="deepseek-chat"

export type AiSummaryResult = {
  excerpt: string;
  tags: string[];
};

export function isAiConfigured(): boolean {
  return Boolean(
    process.env.AI_API_KEY?.trim() &&
      process.env.AI_BASE_URL?.trim() &&
      process.env.AI_MODEL?.trim()
  );
}

function extractJson(raw: string): Record<string, unknown> {
  const text = raw.trim();
  // 容忍模型返回 ```json ... ``` 之类的包裹
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 返回格式不正确");
  }
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

/**
 * 根据标题 + Markdown 正文，生成一句话摘要（≤300 字）和最多 5 个标签。
 *
 * 标签是「受控词表」：只能从 `allowedTags`（站上已存在的标签）里挑，
 * 不许发明新词。prompt 里给出白名单，返回值再按白名单过滤一次——
 * 模型不听话的时候由代码兜住。
 */
export async function summarizePost(input: {
  title: string;
  content: string;
  tags?: string;
  allowedTags: string[];
}): Promise<AiSummaryResult> {
  const key = process.env.AI_API_KEY?.trim();
  const base = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!key || !base || !model) {
    throw new Error("AI 未配置：请在 .env 中填写 AI_API_KEY / AI_BASE_URL / AI_MODEL");
  }

  const allowed = Array.from(new Set(input.allowedTags.map((t) => t.trim()))).filter(
    Boolean
  );

  const system = [
    "你是一名中文博客编辑助手。根据用户提供的文章标题和正文，生成：",
    "1. excerpt：用于列表页展示的一句话摘要，不超过 80 个汉字；",
    "2. tags：从「可用标签」中挑选最多 5 个最贴合文章主题的标签。",
    "   规则：只能从可用标签里原样挑选，禁止发明新标签、禁止改写写法；",
    "   可用标签都不贴切时就返回空数组，不要勉强凑数。",
    '严格只输出一个 JSON 对象，不要任何解释或代码块：{"excerpt": "...", "tags": ["...", "..."]}',
  ].join("\n");

  const user = [
    `标题：${input.title}`,
    `可用标签：${allowed.length > 0 ? allowed.join("、") : "（暂无可用标签，tags 必须返回空数组）"}`,
    input.tags ? `当前已选：${input.tags}` : "当前已选：（无）",
    `正文（截取前 8000 字符）：\n${input.content.slice(0, 8000)}`,
  ].join("\n\n");

  const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`AI 服务返回 ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(raw);

  const excerpt = String(parsed.excerpt ?? "").trim().slice(0, 300);
  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];

  // 只留白名单里的标签，并把写法归一到库里的那个（大小写/空格差异都算命中）
  const canon = new Map(allowed.map((t) => [t.toLowerCase(), t]));
  const tags = Array.from(
    new Set(
      rawTags
        .filter((t): t is string => typeof t === "string")
        .map((t) => canon.get(t.trim().toLowerCase()))
        .filter((t): t is string => Boolean(t))
    )
  ).slice(0, 5);

  if (!excerpt) throw new Error("AI 未返回有效摘要");
  return { excerpt, tags };
}
