// GET /api/images 与封面选择器的真实验证（openspec: add-image-library，任务 5.1 / 5.2 / 5.3）
// 跑法：npx tsx --env-file=.env scripts/picker-test.ts
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
  /* ---------- 接口层：鉴权 ---------- */
  const anon = await fetch(`${BASE}/api/images`);
  check("接口：未登录返回 403", anon.status === 403, { status: anon.status });

  const cookie = await login();
  const authed = await fetch(`${BASE}/api/images?page=1`, { headers: { cookie } });
  const data = await authed.json();
  check("接口：管理员可读", authed.status === 200 && data.ok === true, {
    status: authed.status,
    total: data.total,
  });
  check("接口：返回 images 数组且字段完整", Array.isArray(data.images) && data.images.length > 0, {
    count: data.images?.length,
  });
  const first = data.images?.[0];
  check(
    "接口：字段含 key/bytes/尺寸/usage/createdAt",
    first && typeof first.key === "string" && typeof first.bytes === "number" &&
      typeof first.usageLabel === "string" && typeof first.createdAt === "string",
    first ? { key: first.key.slice(0, 16), usage: first.usageLabel } : null
  );
  check("接口：key 都形如 img/<hash>.<ext>", data.images.every((r: { key: string }) => /^img\/[0-9a-f]{64}\./.test(r.key)));

  const filtered = await (await fetch(`${BASE}/api/images?usage=cover`, { headers: { cookie } })).json();
  check("接口：按用途筛选生效", filtered.total <= data.total, { cover: filtered.total, all: data.total });

  const searched = await (await fetch(`${BASE}/api/images?q=${encodeURIComponent(first.key.slice(4, 12))}`, { headers: { cookie } })).json();
  check("接口：按标识片段搜索生效", searched.total >= 1, { found: searched.total });

  /* ---------- 浏览器层：选择器 ---------- */
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

  await c.open(`${BASE}/admin/posts/new`);
  const hasBtn = await c.js<{ btn: string | null }>(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === '从图床选');
    return { btn: b ? b.textContent?.trim() ?? null : null };
  })()`);
  check("5.2 封面行出现「从图床选」按钮", hasBtn.btn === "从图床选", hasBtn);

  // 打开面板
  await c.js(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === '从图床选');
    b?.click();
    return true;
  })()`);
  await sleep(2000);
  const dialog = await c.js<{
    open: boolean;
    title: string;
    tiles: number;
    hasSearch: boolean;
    hasUsageFilter: number;
  }>(`(() => {
    const d = document.querySelector('.picker-dialog');
    return {
      open: !!d,
      title: d?.querySelector('.picker-title')?.textContent ?? '',
      tiles: d?.querySelectorAll('.img-tile').length ?? 0,
      hasSearch: !!d?.querySelector('.img-search input'),
      hasUsageFilter: d?.querySelectorAll('.img-usage-filter button').length ?? 0,
    };
  })()`);
  check("5.1 面板打开并列出图片", dialog.open && dialog.tiles > 0, dialog);
  check("5.1 面板有标题与搜索框", dialog.title === "从图床选择封面" && dialog.hasSearch, {
    title: dialog.title,
  });
  check("5.1 面板有用途筛选", dialog.hasUsageFilter === 4, { count: dialog.hasUsageFilter });

  // 选中第一张 → 回填封面
  const picked = await c.js<{ key: string }>(`(() => {
    const tile = document.querySelector('.picker-dialog .img-tile');
    const pickBtn = tile?.querySelector('.img-tile-pick');
    const src = tile?.querySelector('.img-tile-thumb')?.getAttribute('src') ?? '';
    pickBtn?.click();
    return { key: src };
  })()`);
  await sleep(1500);
  const afterPick = await c.js<{ coverValue: string; dialogOpen: boolean }>(`(() => {
    const inputs = [...document.querySelectorAll('.cover-row input')];
    return {
      coverValue: inputs[0]?.value ?? '',
      dialogOpen: !!document.querySelector('.picker-dialog'),
    };
  })()`);
  check("5.2 选中后封面被回填为站内地址", afterPick.coverValue.startsWith("/img/"), {
    value: afterPick.coverValue.slice(0, 40),
  });
  check("5.2 选中后面板自动关闭", afterPick.dialogOpen === false, {
    open: afterPick.dialogOpen,
  });

  // 取消：打开后直接关闭，封面不变
  const beforeCancel = afterPick.coverValue;
  await c.js(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === '从图床选');
    b?.click();
    return true;
  })()`);
  await sleep(1500);
  await c.js(`(() => {
    document.querySelector('.picker-close')?.click();
    return true;
  })()`);
  await sleep(1000);
  const afterCancel = await c.js<{ coverValue: string; dialogOpen: boolean }>(`(() => {
    const inputs = [...document.querySelectorAll('.cover-row input')];
    return {
      coverValue: inputs[0]?.value ?? '',
      dialogOpen: !!document.querySelector('.picker-dialog'),
    };
  })()`);
  check("5.1 取消后面板关闭且封面保持原值",
    afterCancel.dialogOpen === false && afterCancel.coverValue === beforeCancel,
    { dialogOpen: afterCancel.dialogOpen, same: afterCancel.coverValue === beforeCancel });

  // 替换：再选另一张（若有多张）
  if (dialog.tiles > 1) {
    await c.js(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim() === '从图床选');
      b?.click();
      return true;
    })()`);
    await sleep(1500);
    await c.js(`(() => {
      const tiles = [...document.querySelectorAll('.picker-dialog .img-tile')];
      tiles[1]?.querySelector('.img-tile-pick')?.click();
      return true;
    })()`);
    await sleep(1500);
    const replaced = await c.js<string>(`(() => {
      const inputs = [...document.querySelectorAll('.cover-row input')];
      return inputs[0]?.value ?? '';
    })()`);
    check("5.2 封面已有值时能替换为新图",
      replaced.startsWith("/img/") && replaced !== beforeCancel,
      { before: beforeCancel.slice(0, 30), after: replaced.slice(0, 30) });
  }

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
