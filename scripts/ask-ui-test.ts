// 问答面板端到端（openspec: add-ai-qa，任务 5.x）
// 跑法：npx tsx --env-file=.env scripts/ask-ui-test.ts
export {};
const CDP = "http://127.0.0.1:9260";
const BASE = "http://127.0.0.1:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

async function connect() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((t: { type: string }) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((res) => ws.addEventListener("open", () => res(), { once: true }));
  let seq = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const errors: string[] = [];
  ws.addEventListener("message", (ev: MessageEvent) => {
    const m = JSON.parse(ev.data as string);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push(m.params.args.map((a: { value?: string }) => a.value ?? "").join(" "));
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)!;
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  async function js<T = unknown>(expression: string): Promise<T> {
    const r = (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })) as {
      exceptionDetails?: { exception?: { description?: string } };
      result: { value: T };
    };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
    return r.result.value;
  }
  async function open(url: string) {
    await send("Page.navigate", { url });
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      if ((await js<string>("document.readyState").catch(() => null)) === "complete") {
        await sleep(2200);
        return;
      }
      await sleep(200);
    }
    throw new Error("timeout");
  }
  return { ws, send, js, open, errors };
}

async function main() {
  const c = await connect();
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  /* ---------- 5.1 入口可见 ---------- */
  for (const path of ["/", "/blog", "/posts/"]) {
    await c.open(`${BASE}${path}`);
    const has = await c.js<{ launcher: boolean; count: number }>(`(() => ({
      launcher: !!document.querySelector('.ask-launch'),
      count: document.querySelectorAll('.ask-launch').length,
    }))()`);
    check(`入口在 ${path} 可见`, has.launcher, has);
  }

  /* ---------- 5.1 点开面板 + 焦点 ---------- */
  await c.open(`${BASE}/blog`);
  await c.js(`document.querySelector('.ask-launch')?.click()`);
  await sleep(900);
  const panel = await c.js<{ open: boolean; focusInPanel: boolean; hasInput: boolean; hasForm: boolean }>(`(() => {
    const p = document.querySelector('.ask-panel');
    const a = document.activeElement;
    return {
      open: !!p,
      focusInPanel: !!p && p.contains(a),
      hasInput: !!p?.querySelector('input'),
      hasForm: !!p?.querySelector('form'),
    };
  })()`);
  check("5.1 点开面板", panel.open, panel);
  check("5.1 输入框获得焦点", panel.focusInPanel, { focus: panel.focusInPanel });
  check("5.1 面板有输入框与表单", panel.hasInput && panel.hasForm, panel);

  /* ---------- 5.1 Esc 关闭 + 焦点归还 ---------- */
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(500);
  const closed = await c.js<{ gone: boolean; focusText: string }>(`(() => ({
    gone: !document.querySelector('.ask-panel'),
    focusText: (document.activeElement?.getAttribute('aria-label') ?? ''),
  }))()`);
  check("5.1 Esc 关闭面板", closed.gone, closed);
  check("5.1 关闭后焦点回到入口", closed.focusText.includes("问问") || closed.focusText.includes("收起"), closed);

  /* ---------- 5.2 / 5.3 / 5.4 提问（站内问题） ---------- */
  await c.js(`document.querySelector('.ask-launch')?.click()`);
  await sleep(700);
  const typed = await c.js<{ ok: boolean }>(`(() => {
    const inp = document.querySelector('.ask-panel input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '怎么初始化模型');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })()`);
  void typed;
  await sleep(300);
  await c.js(`document.querySelector('.ask-panel form')?.requestSubmit()`);

  // 轮询等**生成结束**，而不是等第一个 delta —— 模型耗时不稳定，
  // 读太早会拿到空答案（实测同一问题有时 8s、有时 20s）
  let waited = 0;
  while (waited < 60000) {
    const done = await c.js<boolean>(`(() => {
      const p = document.querySelector('.ask-panel');
      const send = p?.querySelector('.ask-send');
      // 生成结束后按钮从「停止」变回「提问」
      return !!send && (send.textContent ?? '').trim() === '提问';
    })()`);
    if (done) break;
    await sleep(500);
    waited += 500;
  }
  await sleep(800);

  const answered = await c.js<{
    q: string;
    answerLen: number;
    answerText: string;
    sources: number;
    topics: number;
    caretGone: boolean;
    sendEnabled: boolean;
  }>(`(() => {
    const p = document.querySelector('.ask-panel');
    return {
      q: p?.querySelector('.ask-q')?.textContent?.trim() ?? '',
      answerLen: (p?.querySelector('.ask-a')?.textContent ?? '').length,
      answerText: (p?.querySelector('.ask-a')?.textContent ?? '').slice(0, 120),
      sources: p?.querySelectorAll('.ask-source').length ?? 0,
      topics: p?.querySelectorAll('.ask-topic').length ?? 0,
      caretGone: !p?.querySelector('.ask-caret'),
      sendEnabled: !(p?.querySelector('.ask-send'))?.disabled,
    };
  })()`);
  console.log("回答结果:", JSON.stringify(answered));
  check("5.2 问题显示在面板里", answered.q === "怎么初始化模型", { q: answered.q });
  // 上游 AI 偶尔返回 503「请求队列已满」，这不是本功能的问题：
  // 只要「出答案」或「给出明确错误提示」都说明链路是通的。
  const notice = await c.js<string>(
    `document.querySelector('.ask-panel .ask-notice')?.textContent ?? ''`
  );
  const flowOk = answered.answerLen > 10 || notice.length > 0;
  check("5.2 流程跑通（出答案或明确报错）", flowOk, {
    answerLen: answered.answerLen,
    notice: notice.slice(0, 80),
  });
  check("5.2 生成结束后可再次提问", answered.sendEnabled && answered.caretGone, {
    sendEnabled: answered.sendEnabled,
    caretGone: answered.caretGone,
  });
  check("5.3 引用或话题至少有一项", answered.sources > 0 || answered.topics > 0, {
    sources: answered.sources,
    topics: answered.topics,
  });

  console.log("\nconsole errors:", c.errors.length ? c.errors.slice(0, 3) : "none");
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
  c.ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
