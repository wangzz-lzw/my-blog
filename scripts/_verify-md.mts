// 浏览器验证 Markdown 渲染（openspec: fix-markdown-inline-html）
export {};
const CDP = "http://127.0.0.1:9260";
const BASE = "http://127.0.0.1:3000";
const SLUG = "__md-render-test__";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t: { type: string }) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise<void>((res) => ws.addEventListener("open", () => res(), { once: true }));
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
ws.addEventListener("message", (ev: MessageEvent) => {
  const m = JSON.parse(ev.data as string);
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
async function js<T = unknown>(e: string): Promise<T> {
  const r = (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })) as {
    exceptionDetails?: { exception?: { description?: string } };
    result: { value: T };
  };
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
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

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

const url = `${BASE}/posts/${encodeURIComponent(SLUG)}`;
await open(url);

const probe = await js<Record<string, unknown>>(`(() => {
  const prose = document.querySelector('.prose');
  if (!prose) return { error: 'no .prose' };
  const html = prose.innerHTML;
  const text = prose.textContent ?? '';

  // 标题
  const h2s = [...prose.querySelectorAll('h2')].map(h => h.textContent.trim());

  // 代码块
  const codes = [...prose.querySelectorAll('pre code')].map(c => ({
    cls: c.className,
    text: (c.textContent ?? '').slice(0, 120),
  }));

  // 危险元素
  const scripts = prose.querySelectorAll('script').length;
  const iframes = prose.querySelectorAll('iframe').length;
  const onerrorAttrs = [...prose.querySelectorAll('*')].filter(el => el.hasAttribute('onerror')).length;
  const jsHrefs = [...prose.querySelectorAll('a')].filter(a => (a.getAttribute('href') ?? '').startsWith('javascript:')).length;

  // 展示性标签
  const hasTable = !!prose.querySelector('table');
  const hasSup = !!prose.querySelector('sup');
  const hasBr = !!prose.querySelector('br');
  const hasMark = !!prose.querySelector('mark');

  // 外链
  const ext = [...prose.querySelectorAll('a')].find(a => (a.getAttribute('href') ?? '').includes('example.com'));
  const int = [...prose.querySelectorAll('a')].find(a => (a.getAttribute('href') ?? '') === '/blog');

  // 行内代码
  const inlineCode = [...prose.querySelectorAll('code')].filter(c => !c.closest('pre')).map(c => c.textContent);

  return {
    h2s,
    codes,
    scripts, iframes, onerrorAttrs, jsHrefs,
    hasTable, hasSup, hasBr, hasMark,
    extTarget: ext?.getAttribute('target') ?? null,
    extRel: ext?.getAttribute('rel') ?? null,
    intTarget: int?.getAttribute('target') ?? null,
    inlineCode,
    xssFlag: (window).__XSS_EXECUTED === true,
    textHasFontSource: text.includes('<font'),
    htmlHasFontTag: html.includes('<font'),
    htmlHasStyleAttr: [...prose.querySelectorAll("[style]")].filter(el => !el.closest("[data-overlayscrollbars]")).length > 0,
    styleSamples: [...prose.querySelectorAll("[style]")].slice(0,5).map(el => el.tagName + " style=" + el.getAttribute("style")),
  };
})()`);

console.log("探针结果:", JSON.stringify(probe, null, 1).slice(0, 2000));

console.log("\n=== 1.3 内联 HTML 渲染 ===");
check("标题里的 <font> 不再是源码文本", probe.textHasFontSource === false, { textHasFontSource: probe.textHasFontSource });
check("actions.js 文字出现", JSON.stringify(probe.h2s).includes("actions.js"), { h2s: probe.h2s });
check("没有 style 属性残留", probe.htmlHasStyleAttr === false, { htmlHasStyleAttr: probe.htmlHasStyleAttr });

console.log("\n=== 2.1 危险 HTML ===");
check("没有 script 元素", probe.scripts === 0, { scripts: probe.scripts });
check("没有 iframe 元素", probe.iframes === 0, { iframes: probe.iframes });
check("没有 onerror 属性", probe.onerrorAttrs === 0, { onerrorAttrs: probe.onerrorAttrs });
check("没有 javascript: 链接", probe.jsHrefs === 0, { jsHrefs: probe.jsHrefs });
check("XSS 未执行", probe.xssFlag === false, { xssFlag: probe.xssFlag });

console.log("\n=== 2.2 展示性标签 ===");
check("<table> 渲染", probe.hasTable === true, {});
check("<sup> 渲染", probe.hasSup === true, {});
check("<br> 渲染", probe.hasBr === true, {});
check("<mark> 渲染", probe.hasMark === true, {});

console.log("\n=== 1.4 既有行为 ===");
check("外链 target=_blank", probe.extTarget === "_blank", { extTarget: probe.extTarget });
check("外链 rel 含 noopener", String(probe.extRel).includes("noopener"), { extRel: probe.extRel });
check("站内链接无 target", probe.intTarget === null, { intTarget: probe.intTarget });

const codes = probe.codes as { cls: string; text: string }[];
check("代码块有 hljs 类", codes.some((c) => c.cls.includes("hljs")), { classes: codes.map((c) => c.cls) });
check("代码块有 language-py 类", codes.some((c) => c.cls.includes("language-py")), {});

console.log("\n=== 3.1/3.2 代码块禁区 ===");
const pyCode = codes.find((c) => c.cls.includes("language-py"));
check(
  "Python <class '...'> 原样保留",
  (pyCode?.text ?? "").includes("<class 'langchain_deepseek"),
  { text: pyCode?.text?.slice(0, 100) }
);
const htmlCode = codes.find((c) => c.cls.includes("language-html"));
check(
  "代码里的 <div> 是文本不是元素",
  (htmlCode?.text ?? "").includes("<div>这是代码里的 div"),
  { text: htmlCode?.text?.slice(0, 100) }
);
check("代码里的 script 是文本", (htmlCode?.text ?? "").includes("<script>"), {});

const inlineCode = probe.inlineCode as string[];
check("行内代码里的 <span> 原样显示", inlineCode.some((t) => t.includes("<span>")), { inlineCode });

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
ws.close();
