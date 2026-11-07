// 粘贴与拖入的真实行为验证（openspec: localize-import-assets，任务 5.2）
// 跑法：npx tsx --env-file=.env scripts/paste-drop-test.ts
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const CDP = "http://127.0.0.1:9251";
const BASE = "http://127.0.0.1:3000";
const TMP = join(process.cwd(), ".tmp-paste-test");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

function makePng(w: number, h: number, seed: string): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(13, 0);
  return Buffer.concat([sig, len, Buffer.from("IHDR", "ascii"), ihdr, Buffer.alloc(4), Buffer.from(seed)]);
}

async function login(): Promise<string> {
  const jar: string[] = [];
  const save = (res: Response) => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) jar.push(c.split(";")[0]);
  };
  const ck = () => jar.join("; ");
  const env = Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      })
  );
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: ck() } });
  save(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { cookie: ck(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      identifier: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
      csrfToken,
      callbackUrl: BASE + "/admin",
      json: "true",
    }),
    redirect: "manual",
  });
  save(loginRes);
  return ck();
}

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
        await sleep(1800);
        return;
      }
      await sleep(200);
    }
    throw new Error("timeout");
  }
  return { ws, send, js, open, errors };
}

async function main() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const seed = String(Date.now());
  writeFileSync(join(TMP, "drop.png"), makePng(320, 240, seed + "-drop"));

  const cookie = await login();
  const c = await connect();
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  await c.send("Network.enable");
  await c.send("DOM.enable");
  for (const pair of cookie.split("; ")) {
    const i = pair.indexOf("=");
    await c.send("Network.setCookie", {
      name: pair.slice(0, i),
      value: pair.slice(i + 1),
      domain: "127.0.0.1",
      path: "/",
    });
  }
  await c.send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await c.open(`${BASE}/admin/posts/new`);
  // 清空正文，保证插入位置可预期
  await c.js(`(() => {
    const ta = document.querySelector('.editor-textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '起始文本\\n');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return true;
  })()`);
  await sleep(600);

  /* ---------- 拖入一张纯图片（无 md）：应走"插入图片"路径 ---------- */
  // 用 CDP 构造真实的 drop 事件：DataTransfer 里放一个从磁盘读来的 File
  const b64 = readFileSync(join(TMP, "drop.png")).toString("base64");
  const dropResult = await c.js<{ ok: boolean; err?: string }>(`(async () => {
    try {
      const bin = atob(${JSON.stringify(b64)});
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'drop.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const form = document.querySelector('form.editor');
      const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      form.dispatchEvent(ev);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  })()`);
  check("拖入事件已派发", dropResult.ok, dropResult);

  await sleep(7000);

  const afterDrop = await c.js<{ content: string; hasLocalRef: boolean; hasImgRef: boolean }>(`(() => {
    const content = document.querySelector('.editor-textarea')?.value ?? '';
    return {
      content,
      hasLocalRef: /!\\([^)]*\\)\\(.*drop\\.png/.test(content),
      hasImgRef: /!\\[[^\\]]*\\]\\(\\/img\\/[0-9a-f]+/.test(content),
    };
  })()`);
  check("5.2 拖入图片后插入了站内地址的引用", afterDrop.hasImgRef, {
    content: afterDrop.content.slice(0, 160),
  });
  check("5.2 拖入图片不产生本地路径引用", !afterDrop.hasLocalRef, {});
  check("5.2 原有正文保留（插入而非覆盖）", afterDrop.content.includes("起始文本"), {
    content: afterDrop.content.slice(0, 80),
  });

  console.log("\nconsole errors:", c.errors.length ? c.errors.slice(0, 3) : "none");
  rmSync(TMP, { recursive: true, force: true });

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
  c.ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
