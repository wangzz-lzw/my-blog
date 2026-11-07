// 六套主题下图床页与选择器的样式核对（openspec: add-image-library，任务 6.2）
// 跑法：npx tsx --env-file=.env scripts/theme-check.ts
import { readFileSync } from "node:fs";

const CDP = "http://127.0.0.1:9250";
const BASE = "http://127.0.0.1:3000";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

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
        await sleep(1600);
        return;
      }
      await sleep(200);
    }
    throw new Error("timeout");
  }
  return { ws, send, js, open, errors };
}

async function main() {
  const cookie = await login();
  const c = await connect();
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  await c.send("Network.enable");
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
  await c.open(`${BASE}/admin/images`);

  const themes = ["cyber", "indigo", "ember", "forest", "sakura", "daylight"];
  const rows: Array<{
    theme: string;
    tileBorder: string;
    tileBg: string;
    accent: string;
    textColor: string;
    tileCount: number;
    overflowX: boolean;
  }> = [];

  for (const t of themes) {
    const r = await c.js<{
      theme: string;
      tileBorder: string;
      tileBg: string;
      accent: string;
      textColor: string;
      tileCount: number;
      overflowX: boolean;
    }>(`(async () => {
      document.documentElement.dataset.theme = ${JSON.stringify(t)};
      await new Promise(r => setTimeout(r, 220));
      const tile = document.querySelector('.img-tile');
      const cs = tile ? getComputedStyle(tile) : null;
      const root = getComputedStyle(document.documentElement);
      return {
        theme: document.documentElement.dataset.theme,
        tileBorder: cs ? cs.borderColor : '',
        tileBg: cs ? cs.backgroundColor : '',
        accent: root.getPropertyValue('--accent').trim(),
        textColor: root.getPropertyValue('--fg').trim(),
        tileCount: document.querySelectorAll('.img-tile').length,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      };
    })()`);
    rows.push(r);
  }

  console.log("主题取色：");
  for (const r of rows) {
    console.log(`  ${r.theme.padEnd(9)} accent=${r.accent.padEnd(9)} border=${r.tileBorder.slice(0, 24).padEnd(24)} tiles=${r.tileCount}`);
  }

  check("六套主题下图块边框都能解析", rows.every((r) => r.tileBorder && r.tileBorder !== "rgba(0, 0, 0, 0)"), {
    borders: rows.map((r) => r.theme),
  });
  check("六套主题的 accent 各不相同", new Set(rows.map((r) => r.accent)).size === 6, {
    accents: rows.map((r) => r.accent),
  });
  check("每个主题下图片都渲染出来", rows.every((r) => r.tileCount > 0), {
    counts: rows.map((r) => `${r.theme}:${r.tileCount}`),
  });
  check("没有横向溢出", rows.every((r) => !r.overflowX), {
    overflow: rows.filter((r) => r.overflowX).map((r) => r.theme),
  });

  /* ---------- 选择器在浅色主题下也不崩 ---------- */
  await c.js(`document.documentElement.dataset.theme = 'daylight'`);
  await c.open(`${BASE}/admin/posts/new`);
  await c.js(`document.documentElement.dataset.theme = 'daylight';
    [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === '从图床选')?.click();`);
  await sleep(2000);
  const lightDialog = await c.js<{ open: boolean; bg: string; tiles: number; visible: boolean }>(`(() => {
    const d = document.querySelector('.picker-dialog');
    if (!d) return { open: false, bg: '', tiles: 0, visible: false };
    const cs = getComputedStyle(d);
    const rect = d.getBoundingClientRect();
    return {
      open: true,
      bg: cs.backgroundColor,
      tiles: d.querySelectorAll('.img-tile').length,
      visible: rect.width > 0 && rect.height > 0,
    };
  })()`);
  check("6.2 浅色主题下选择器正常显示", lightDialog.open && lightDialog.visible && lightDialog.tiles > 0, lightDialog);
  check("6.2 浅色主题下弹层背景不是透明", lightDialog.bg !== "rgba(0, 0, 0, 0)", { bg: lightDialog.bg });

  // 窄屏
  await c.js(`document.querySelector('.picker-close')?.click(); document.documentElement.dataset.theme = 'cyber';`);
  await c.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await c.open(`${BASE}/admin/images`);
  const narrow = await c.js<{ tiles: number; overflowX: boolean; cols: number }>(`(() => {
    const grid = document.querySelector('.img-grid');
    const cs = grid ? getComputedStyle(grid) : null;
    return {
      tiles: document.querySelectorAll('.img-tile').length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      cols: cs ? cs.gridTemplateColumns.split(' ').length : 0,
    };
  })()`);
  check("6.2 390px 窄屏正常且无横向溢出", narrow.tiles > 0 && !narrow.overflowX, narrow);

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
