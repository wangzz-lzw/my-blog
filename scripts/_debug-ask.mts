// 点击页头「问问」后，截图看面板真实渲染情况
export {};
const CDP = "http://127.0.0.1:9260";
const BASE = "http://127.0.0.1:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/blog` });
await sleep(2500);

// 点击页头按钮
await js(`document.querySelector('.site-nav .ask-nav-btn')?.click()`);
await sleep(1000);

// 看面板的实际几何与样式
const info = await js<Record<string, unknown>>(`(() => {
  const p = document.querySelector('.ask-panel');
  if (!p) return { exists: false };
  const cs = getComputedStyle(p);
  const r = p.getBoundingClientRect();
  const btn = document.querySelector('.site-nav .ask-nav-btn');
  const btnR = btn?.getBoundingClientRect();
  return {
    exists: true,
    display: cs.display,
    position: cs.position,
    zIndex: cs.zIndex,
    rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    btnRect: btnR ? { left: Math.round(btnR.left), top: Math.round(btnR.top), width: Math.round(btnR.width), height: Math.round(btnR.height) } : null,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    // 关键：父级有没有创建 stacking context / overflow
    header: (() => { const h = p.closest('.site-header'); return h ? { overflow: getComputedStyle(h).overflow, zIndex: getComputedStyle(h).zIndex, position: getComputedStyle(h).position, backdropFilter: getComputedStyle(h).backdropFilter } : null; })(),
  };
})()`);
console.log(JSON.stringify(info, null, 1));

// 截图
const shot = await send("Page.captureScreenshot", { format: "png" }) as { data: string };
const fs = await import("node:fs");
fs.writeFileSync(".shots/ask-debug.png", Buffer.from(shot.data, "base64"));
console.log("截图已存 .shots/ask-debug.png");
ws.close();
