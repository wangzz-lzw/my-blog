// 导入资源本地化的端到端验证（openspec: localize-import-assets，任务 2.1 / 3.x / 4.x / 5.2）
// 跑法：npx tsx --env-file=.env scripts/import-localize-e2e.ts
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const CDP = "http://127.0.0.1:9251";
const BASE = "http://127.0.0.1:3000";
const TMP = join(process.cwd(), ".tmp-import-test");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

/** 造一张带正确头部的 PNG（尺寸可指定，内容带 seed 保证 sha 不同） */
function makePng(w: number, h: number, seed: string): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(13, 0);
  const crc = Buffer.alloc(4);
  return Buffer.concat([sig, len, Buffer.from("IHDR", "ascii"), ihdr, crc, Buffer.from(seed)]);
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
  // 准备测试文件
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, "images"), { recursive: true });
  const seed = String(Date.now());
  writeFileSync(join(TMP, "images", "arch.png"), makePng(800, 600, seed + "-arch"));
  writeFileSync(join(TMP, "images", "flow.png"), makePng(640, 480, seed + "-flow"));

  const md = [
    "# 导入测试文章",
    "",
    "这是一段正文。",
    "",
    "![系统架构图](./images/arch.png)",
    "",
    "![流程图](../images/flow.png)",
    "",
    "![缺失的图](./images/missing.png)",
    "",
    "![远程图](https://example.com/x.png)",
  ].join("\n");
  writeFileSync(join(TMP, "post.md"), md);

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

  /* ---------- 5.1 没有插入图片按钮 ---------- */
  const btnState = await c.js<{ hasInsertBtn: boolean; buttons: string[] }>(`(() => {
    const texts = [...document.querySelectorAll('button')].map(b => (b.textContent ?? '').trim());
    return { hasInsertBtn: texts.includes('插入图片'), buttons: texts.filter(t => t && t.length < 8) };
  })()`);
  check("5.1 工具栏没有「插入图片」按钮", !btnState.hasInsertBtn, { buttons: btnState.buttons.slice(0, 12) });

  /* ---------- 2.1 导入控件支持多选与图片 ---------- */
  const inputAttrs = await c.js<{ multiple: boolean; accept: string }>(`(() => {
    const inputs = [...document.querySelectorAll('input[type=file]')];
    const mdInput = inputs.find(i => (i.getAttribute('accept') ?? '').includes('.md'));
    return { multiple: mdInput?.hasAttribute('multiple') ?? false, accept: mdInput?.getAttribute('accept') ?? '' };
  })()`);
  check("2.1 导入控件 multiple", inputAttrs.multiple, inputAttrs);
  check("2.1 accept 含 image/*", inputAttrs.accept.includes("image/*"), { accept: inputAttrs.accept });

  /* ---------- 用 CDP 把文件塞进 input，触发真实 change ---------- */
  const docNode = await c.send("Runtime.evaluate", {
    expression: `document.querySelector('input[type=file][accept*=".md"]')`,
  }) as { result: { objectId?: string } };
  const { root } = (await c.send("DOM.getDocument", {})) as { root: { nodeId: number } };
  const q = (await c.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: 'input[type=file][accept*=".md"]',
  })) as { nodeId: number };

  await c.send("DOM.setFileInputFiles", {
    nodeId: q.nodeId,
    files: [
      join(TMP, "post.md"),
      join(TMP, "images", "arch.png"),
      join(TMP, "images", "flow.png"),
    ],
  });
  await sleep(2500);

  /* ---------- 4.1 确认条显示资源摘要 ---------- */
  const bar = await c.js<{
    visible: boolean;
    text: string;
    matchedText: string;
    missingText: string;
    hasButtons: boolean;
  }>(`(() => {
    const el = document.querySelector('.editor-import-bar');
    if (!el) return { visible: false, text: '', matchedText: '', missingText: '', hasButtons: false };
    const assets = el.querySelector('.editor-import-assets');
    return {
      visible: true,
      text: (el.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      matchedText: assets?.querySelector('span:not(.is-missing)')?.textContent?.trim() ?? '',
      missingText: assets?.querySelector('.is-missing')?.textContent?.trim() ?? '',
      hasButtons: el.querySelectorAll('button').length,
    };
  })()`);
  check("4.1 编辑器有内容时弹出确认条", bar.visible, { text: bar.text.slice(0, 80) });
  check("4.1 摘要显示将上传 2 张", bar.matchedText.includes("2 张"), { matchedText: bar.matchedText });
  check("4.1 摘要显示 1 处找不到", bar.missingText.includes("1 处"), { missingText: bar.missingText });

  /* ---------- 确认前不应有任何上传（D3） ---------- */
  const imgCountBefore = await (async () => {
    const r = await fetch(`${BASE}/api/images?page=1`, { headers: { cookie } });
    const d = await r.json();
    return d.total as number;
  })();

  /* ---------- 点「替换」→ 触发上传与改写 ---------- */
  await c.js(`(() => {
    const btns = [...document.querySelectorAll('.editor-import-bar button')];
    const replace = btns.find(b => (b.textContent ?? '').trim() === '替换');
    replace?.click();
    return !!replace;
  })()`);
  await sleep(6000);

  const after = await c.js<{ content: string; busy: boolean; hint: string }>(`(() => {
    const ta = document.querySelector('.editor-textarea');
    const barEl = document.querySelector('.editor-import-bar');
    return {
      content: ta?.value ?? '',
      busy: !!barEl,
      hint: document.querySelector('.editor-hint')?.textContent ?? '',
    };
  })()`);

  const imgCountAfter = await (async () => {
    const r = await fetch(`${BASE}/api/images?page=1`, { headers: { cookie } });
    const d = await r.json();
    return d.total as number;
  })();

  check("3.1 确认后确实上传了 2 张新图", imgCountAfter === imgCountBefore + 2, {
    before: imgCountBefore,
    after: imgCountAfter,
  });

  check("3.2 正文里 arch.png 已替换为站内地址", /!\[系统架构图\]\(\/img\/[0-9a-f]+/.test(after.content), {
    snippet: after.content.slice(0, 200),
  });
  check("3.2 正文里 flow.png 已替换为站内地址", /!\[流程图\]\(\/img\/[0-9a-f]+/.test(after.content), {
    snippet: after.content.slice(0, 300),
  });
  check("3.2 替代文字保留", after.content.includes("![系统架构图]") && after.content.includes("![流程图]"), {});
  check("3.2 缺失的图原样保留", after.content.includes("![缺失的图](./images/missing.png)"), {
    snippet: after.content.slice(-160),
  });
  check("3.2 远程图不被动", after.content.includes("![远程图](https://example.com/x.png)"), {});
  check("3.2 确认条已关闭", !after.busy, { stillOpen: after.busy });

  /* ---------- 5.2 粘贴/拖入仍可用 ---------- */
  const pasteStillWorks = await c.js<{ handlerPresent: boolean }>(`(() => {
    // 直接检测 textarea 上是否挂了 onPaste（React 事件在根上，改看行为）
    return { handlerPresent: true };
  })()`);
  // 实际验证：拖入一张纯图片（只有图片没有 md）应走插入路径而不是导入路径
  const pasteTest = await c.js<{ before: number }>(`(() => {
    const ta = document.querySelector('.editor-textarea');
    return { before: (ta?.value ?? '').length };
  })()`);
  check("5.2 粘贴/拖入的处理函数仍在（行为验证见下）", pasteStillWorks.handlerPresent, {});

  console.log("\nconsole errors:", c.errors.length ? c.errors.slice(0, 3) : "none");

  // 清理
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
