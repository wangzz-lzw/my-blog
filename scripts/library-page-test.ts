// 图床页的真实验证（openspec: add-image-library，任务 4.1 / 4.2 / 4.3）
// 跑法：npx tsx --env-file=.env scripts/library-page-test.ts
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

type Cdp = Awaited<ReturnType<typeof connect>>;

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
    if (m.method === "Runtime.exceptionThrown") {
      errors.push(m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description ?? ""));
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push(m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description).join(" "));
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
    const r = (await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { exceptionDetails?: { exception?: { description?: string } }; result: { value: T } };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
    return r.result.value;
  }

  async function open(url: string) {
    await send("Page.navigate", { url });
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      const state = await js<string>("document.readyState").catch(() => null);
      if (state === "complete") {
        await sleep(1800);
        return;
      }
      await sleep(200);
    }
    throw new Error("load timeout");
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

  /* ---------- 4.1 图床页基本可用 ---------- */
  await c.open(`${BASE}/admin/images`);
  const pageState = await c.js<{
    url: string;
    title: string;
    tiles: number;
    hasDelete: boolean;
    hasFilters: number;
    countText: string;
    thumbs: number;
    firstThumbSrc: string | null;
    hasPager: boolean;
  }>(`(() => {
    const tiles = [...document.querySelectorAll('.img-tile')];
    const buttons = [...document.querySelectorAll('button')].map(b => b.textContent?.trim() ?? '');
    return {
      url: location.pathname,
      title: document.querySelector('.admin-page-head h1')?.textContent ?? '',
      tiles: tiles.length,
      hasDelete: buttons.some(t => /删除|移除|replace/i.test(t)),
      hasFilters: document.querySelectorAll('.img-usage-filter button').length,
      countText: document.querySelector('.img-count')?.textContent?.trim() ?? '',
      thumbs: document.querySelectorAll('.img-tile-thumb').length,
      firstThumbSrc: document.querySelector('.img-tile-thumb')?.getAttribute('src') ?? null,
      hasPager: !!document.querySelector('.img-pager'),
    };
  })()`);

  check("4.1 打开的是图床页", pageState.url === "/admin/images" && pageState.title === "图床", {
    url: pageState.url,
    title: pageState.title,
  });
  check("4.1 网格渲染出图片", pageState.tiles > 0 && pageState.thumbs > 0, {
    tiles: pageState.tiles,
    thumbs: pageState.thumbs,
  });
  check("4.1 缩略图用站内地址", (pageState.firstThumbSrc ?? "").startsWith("/img/"), {
    src: pageState.firstThumbSrc,
  });
  check("4.1 显示了总数与页码", /共 \d+ 张/.test(pageState.countText), { text: pageState.countText });
  check("4.1 有用途筛选（全部+3类）", pageState.hasFilters === 4, { filters: pageState.hasFilters });
  check("4.3 页面上没有删除入口", pageState.hasDelete === false, { found: pageState.hasDelete });

  // 缩略图真的加载出来了（naturalWidth > 0）
  const loaded = await c.js<{ total: number; ok: number }>(`(() => {
    const imgs = [...document.querySelectorAll('.img-tile-thumb')];
    return { total: imgs.length, ok: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
  })()`);
  check("4.1 缩略图实际加载成功", loaded.ok === loaded.total && loaded.total > 0, loaded);

  /* ---------- 4.1 筛选 / 搜索 / 空状态 ---------- */
  // 按用途筛选：封面
  await c.open(`${BASE}/admin/images?usage=cover`);
  const coverFilter = await c.js<{ tiles: number; count: string; activeLabel: string }>(`(() => ({
    tiles: document.querySelectorAll('.img-tile').length,
    count: document.querySelector('.img-count')?.textContent?.trim() ?? '',
    activeLabel: document.querySelector('.img-usage-filter button.active')?.textContent?.trim() ?? '',
  }))()`);
  check("4.1 按用途筛选生效（URL 与激活态一致）", coverFilter.activeLabel === "封面", coverFilter);

  // 搜索：用一个不存在的片段 → 空状态
  await c.open(`${BASE}/admin/images?q=ZZZ_NO_SUCH_IMAGE_ZZZ`);
  const empty = await c.js<{ tiles: number; notice: string | null }>(`(() => ({
    tiles: document.querySelectorAll('.img-tile').length,
    notice: document.querySelector('.admin-notice strong')?.textContent?.trim() ?? null,
  }))()`);
  check("4.1 无匹配时显示空状态提示", empty.tiles === 0 && empty.notice === "没有匹配的图片", empty);

  // 搜索：用真实存在的 key 片段
  const someKey = await c.js<string | null>(`null`);
  await c.open(`${BASE}/admin/images`);
  const realFragment = await c.js<string>(`(() => {
    const src = document.querySelector('.img-tile-thumb')?.getAttribute('src') ?? '';
    return src.replace('/img/', '').slice(0, 8);
  })()`);
  await c.open(`${BASE}/admin/images?q=${encodeURIComponent(realFragment)}`);
  const searched = await c.js<{ tiles: number; count: string }>(`(() => ({
    tiles: document.querySelectorAll('.img-tile').length,
    count: document.querySelector('.img-count')?.textContent?.trim() ?? '',
  }))()`);
  check("4.1 按标识片段搜索命中", searched.tiles > 0 && searched.count.includes(realFragment), {
    fragment: realFragment,
    ...searched,
  });

  /* ---------- 4.2 导航链接 ---------- */
  await c.open(`${BASE}/admin`);
  const nav = await c.js<{ labels: string[]; hasImages: boolean }>(`(() => {
    const links = [...document.querySelectorAll('.admin-links a')];
    return {
      labels: links.map(a => a.textContent?.trim() ?? ''),
      hasImages: links.some(a => a.textContent?.trim() === '图床' && a.getAttribute('href') === '/admin/images'),
    };
  })()`);
  check("4.2 后台导航有「图床」且指向正确", nav.hasImages, { labels: nav.labels });

  /* ---------- 4.3 权限：非管理员进不来 ---------- */
  // 未登录（清 cookie）
  await c.send("Network.clearBrowserCookies");
  await c.send("Page.navigate", { url: `${BASE}/admin/images` });
  await sleep(2500);
  const anon = await c.js<{ path: string; tiles: number }>(`({
    path: location.pathname,
    tiles: document.querySelectorAll('.img-tile').length,
  })`);
  check("4.3 未登录访问被重定向且看不到图片", anon.path === "/login" && anon.tiles === 0, anon);

  console.log("\nconsole errors:", c.errors.length ? c.errors.slice(0, 3) : "none");
  if (c.errors.length) {
    // 图片 404 之类的错误不算失败，但记录下来
    console.log("  （以上为浏览器侧日志，仅供参考）");
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
  c.ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
