export {};
// 面板入口 / 减弱动效 / 窄屏（openspec: redesign-auth-switcher，任务 3.1 / 5.1 / 4.2）
// 跑法：npx tsx --env-file=.env scripts/auth-panel-test.ts
const CDP = "http://127.0.0.1:9252";
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
        await sleep(2500);
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
  await c.send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  /* ---------- 3.1 欢迎页面板 ---------- */
  await c.open(`${BASE}/`);
  const opened = await c.js<{ hasTrigger: boolean }>(`(() => {
    const link = [...document.querySelectorAll('a')].find(a => (a.textContent ?? '').trim() === '登录');
    return { hasTrigger: !!link };
  })()`);
  check("3.1 欢迎页有登录入口", opened.hasTrigger, opened);

  await c.js(`(() => {
    [...document.querySelectorAll('a')].find(a => (a.textContent ?? '').trim() === '登录')?.click();
    return true;
  })()`);
  await sleep(1500);

  const panel = await c.js<{
    hasPanel: boolean;
    hasTabs: number;
    focusTag: string;
    focusInPanel: boolean;
    hasClose: boolean;
    hasSwitcher: boolean;
  }>(`(() => {
    const panel = document.querySelector('.auth-panel');
    const active = document.activeElement;
    return {
      hasPanel: !!panel,
      hasTabs: panel?.querySelectorAll('[role=tab]').length ?? 0,
      focusTag: active?.tagName?.toLowerCase() ?? '',
      focusInPanel: panel?.contains(active) ?? false,
      hasClose: !!panel?.querySelector('.auth-close'),
      hasSwitcher: !!panel?.querySelector('.auth-switcher'),
    };
  })()`);
  check("3.1 面板打开并含切换器", panel.hasPanel && panel.hasSwitcher, panel);
  check("3.1 面板有登录/注册两个 tab", panel.hasTabs === 2, { tabs: panel.hasTabs });
  check("3.1 打开时焦点进入面板", panel.focusInPanel && panel.focusTag === "input", {
    focus: panel.focusTag,
  });

  // Esc 关闭 + 焦点归还
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(900);
  const closed = await c.js<{ panelGone: boolean; focusText: string }>(`(() => {
    const panel = document.querySelector('.auth-panel');
    return {
      panelGone: !panel,
      focusText: (document.activeElement?.textContent ?? '').trim(),
    };
  })()`);
  check("3.1 Esc 关闭面板", closed.panelGone, closed);
  check("3.1 关闭后焦点回到触发按钮", closed.focusText === "登录", { focus: closed.focusText });

  /* ---------- 3.1 面板内的 tab 切换与两步注册 ---------- */
  await c.open(`${BASE}/`);
  await c.js(`(() => {
    [...document.querySelectorAll('a')].find(a => (a.textContent ?? '').trim() === '登录')?.click();
    return true;
  })()`);
  await sleep(1500);
  const panelSwitch = await c.js<{ switched: boolean; hasSteps: boolean }>(`(async () => {
    [...document.querySelectorAll('.auth-panel [role=tab]')].find(t => (t.textContent ?? '').trim() === '注册')?.click();
    await new Promise(r => setTimeout(r, 900));
    const active = [...document.querySelectorAll('.auth-panel [role=tab]')].find(t => t.getAttribute('aria-selected') === 'true');
    return {
      switched: active?.textContent?.trim() === '注册',
      hasSteps: !!document.querySelector('.auth-panel .register-steps'),
    };
  })()`);
  check("3.1 面板内能切到注册且有步骤指示", panelSwitch.switched && panelSwitch.hasSteps, panelSwitch);

  /* ---------- 5.1 减少动效 ---------- */
  await c.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await c.open(`${BASE}/login`);
  const reduced = await c.js<{ regMoved: boolean; heightInstant: boolean }>(`(async () => {
    const loginPane = document.querySelector('[data-pane=login]');
    const regPane = document.querySelector('[data-pane=register]');
    const track = document.querySelector('.auth-track');
    const h0 = track.getBoundingClientRect().height;

    [...document.querySelectorAll('[role=tab]')].find(t => (t.textContent ?? '').trim() === '注册')?.click();
    // 立刻读：减弱动效时应该已经到位
    await new Promise(r => requestAnimationFrame(r));
    const mReg = Math.round(new DOMMatrixReadOnly(getComputedStyle(regPane).transform).m41);
    void loginPane;
    return {
      regMoved: Math.abs(mReg) > 1,
      heightInstant: Math.abs(track.getBoundingClientRect().height - h0) > 40,
    };
  })()`);
  check("5.1 减少动效下切换无可见位移", !reduced.regMoved, reduced);
  check("5.1 减少动效下高度瞬时变化", reduced.heightInstant, reduced);
  await c.send("Emulation.setEmulatedMedia", { features: [] });

  /* ---------- 4.2 窄屏 ---------- */
  await c.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await c.open(`${BASE}/register`);
  const narrow = await c.js<{ overflowX: boolean; hasSteps: boolean; tabCount: number }>(`(() => ({
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    hasSteps: !!document.querySelector('.register-steps'),
    tabCount: document.querySelectorAll('[role=tab]').length,
  }))()`);
  check("4.2 390px 窄屏无横向溢出且控件齐全", !narrow.overflowX && narrow.hasSteps && narrow.tabCount === 2, narrow);

  // 窄屏下切换仍可用
  const narrowSwitch = await c.js<{ ok: boolean; overflowX: boolean }>(`(async () => {
    [...document.querySelectorAll('[role=tab]')].find(t => (t.textContent ?? '').trim() === '登录')?.click();
    await new Promise(r => setTimeout(r, 900));
    return {
      ok: document.querySelector('[data-pane=login]')?.getAttribute('data-active') === 'true',
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  })()`);
  check("4.2 窄屏下切换正常且不溢出", narrowSwitch.ok && !narrowSwitch.overflowX, narrowSwitch);

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
