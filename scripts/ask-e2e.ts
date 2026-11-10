// 流式接口验证（openspec: add-ai-qa，任务 4.1 / 4.2 / 3.2）
// 跑法：npx tsx --env-file=.env scripts/ask-e2e.ts
export {};
const BASE = "http://127.0.0.1:3000";

// 每次运行换一个来源 IP：限流状态存在 dev server 进程内存里，
// 不换的话上一轮 4.2 打满的额度会污染这一轮的所有用例。
const RUN_IP = `10.99.${Date.now() % 200}.${1 + (Date.now() % 250)}`;
const HEADERS = { "Content-Type": "application/json", "x-forwarded-for": RUN_IP };

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

type Evt = Record<string, unknown>;

/** 读 SSE 流，记录事件到达的时间点以证明"流式"而非一次性返回 */
async function ask(question: string): Promise<{
  status: number;
  events: Evt[];
  deltas: string[];
  text: string;
  firstDeltaMs: number;
  totalMs: number;
  timings: number[];
}> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ question }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    return { status: res.status, events: [], deltas: [], text: err, firstDeltaMs: 0, totalMs: Date.now() - t0, timings: [] };
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const events: Evt[] = [];
  const deltas: string[] = [];
  const timings: number[] = [];
  let firstDeltaMs = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const e = JSON.parse(line.slice(5).trim()) as Evt;
        events.push(e);
        if (e.type === "delta") {
          deltas.push(String(e.text));
          timings.push(Date.now() - t0);
          if (!firstDeltaMs) firstDeltaMs = Date.now() - t0;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { status: res.status, events, deltas, text: deltas.join(""), firstDeltaMs, totalMs: Date.now() - t0, timings };
}

async function main() {
  /* ---------- 4.1 流式 + 事件顺序（站内能答的问题）---------- */
  console.log("=== 4.1 站内问题（应正常作答）===");
  const r1 = await ask("如何创建智能体");
  const kinds = r1.events.map((e) => String(e.type) + (e.stage ? `:${e.stage}` : ""));
  console.log("  事件序列:", kinds.join(" → "));
  console.log(`  首个 delta: ${r1.firstDeltaMs}ms   总耗时: ${r1.totalMs}ms   delta 数: ${r1.deltas.length}`);
  console.log(`  答案前 120 字: ${r1.text.slice(0, 120).replace(/\n/g, " ")}`);

  check("返回 200 且是流", r1.status === 200 && r1.deltas.length > 0, { status: r1.status });
  check("先发 stage:retrieving", kinds[0] === "stage:retrieving", { first: kinds[0] });
  check("发过 sources 事件", r1.events.some((e) => e.type === "sources"), {});
  const srcEvent = r1.events.find((e) => e.type === "sources") as { sources?: { title: string }[] } | undefined;
  check("引用列表非空", (srcEvent?.sources?.length ?? 0) > 0, { sources: srcEvent?.sources });
  check("末尾有 stage:done", kinds[kinds.length - 1] === "stage:done", { last: kinds[kinds.length - 1] });
  check(
    "是流式（多个 delta 且分散在不同时刻）",
    r1.deltas.length > 3 && r1.timings[r1.timings.length - 1] - r1.timings[0] > 30,
    { deltas: r1.deltas.length, span: r1.timings[r1.timings.length - 1] - r1.timings[0] }
  );
  check("答案带引用编号 [1]", /\[\d\]/.test(r1.text), { snippet: r1.text.slice(0, 80) });

  /* ---------- 3.2 拒答（站外问题）---------- */
  console.log("\n=== 3.2 站外问题（应拒答）===");
  const r2 = await ask("今天北京的天气怎么样");
  const kinds2 = r2.events.map((e) => String(e.type) + (e.stage ? `:${e.stage}` : ""));
  console.log("  事件序列:", kinds2.join(" → "));
  console.log(`  拒答文案: ${r2.text.slice(0, 80).replace(/\n/g, " ")}`);
  const topicsEvent = r2.events.find((e) => e.type === "topics") as { topics?: { title: string }[] } | undefined;

  check("触发 stage:refused", r2.events.some((e) => e.type === "topics"), { kinds: kinds2 });
  check("拒答文案明确说不知道", /没有能回答|不知道/.test(r2.text), { text: r2.text.slice(0, 60) });
  check("拒答时引用为空", ((r2.events.find((e) => e.type === "sources") as { sources?: unknown[] })?.sources?.length ?? -1) === 0, {});
  check("给出可答话题列表", (topicsEvent?.topics?.length ?? 0) > 0, {
    count: topicsEvent?.topics?.length,
    sample: topicsEvent?.topics?.slice(0, 2).map((t) => t.title),
  });

  /* ---------- 4.2 限流 ---------- */
  console.log("\n=== 4.2 限流 ===");
  let lastStatus = 0;
  let retryAfter = 0;
  for (let i = 0; i < 14; i++) {
    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ question: "限流测试" }),
    });
    lastStatus = res.status;
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      retryAfter = j.retryAfter ?? 0;
      break;
    }
    // 别把流读完，只要状态码
    await res.body?.cancel();
  }
  check("连续请求触发 429", lastStatus === 429, { status: lastStatus });
  check("429 带 retryAfter", retryAfter > 0, { retryAfter });

  /* ---------- 4.3 校验 ---------- */
  console.log("\n=== 4.3 输入校验 ===");
  const empty = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ question: "" }),
  });
  check("空问题返回 400", empty.status === 400, { status: empty.status });
  await empty.body?.cancel();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
