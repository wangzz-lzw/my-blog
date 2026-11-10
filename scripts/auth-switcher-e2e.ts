export {};
// 登录/注册切换器的真实验证（openspec: redesign-auth-switcher）
// 跑法：npx tsx --env-file=.env scripts/auth-switcher-e2e.ts
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
        await sleep(2000);
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

  /* ---------- 独立页：/register 落在注册第一步 ---------- */
  await c.open(`${BASE}/register`);
  const reg = await c.js<{
    url: string;
    activeTab: string;
    stepVisible: boolean;
    step1Current: boolean;
    hasNext: boolean;
    hasPassword: boolean;
  }>(`(() => {
    const tabs = [...document.querySelectorAll('[role=tab]')];
    const active = tabs.find(t => t.getAttribute('aria-selected') === 'true');
    const steps = [...document.querySelectorAll('.register-step')];
    const btns = [...document.querySelectorAll('button')].map(b => (b.textContent ?? '').trim());
    return {
      url: location.pathname,
      activeTab: active?.textContent?.trim() ?? '',
      stepVisible: !!document.querySelector('.register-steps'),
      step1Current: steps[0]?.getAttribute('data-current') === 'true',
      hasNext: btns.includes('下一步'),
      hasPassword: [...document.querySelectorAll('[data-pane=register] input[type=password]')].length > 0,
    };
  })()`);
  check("3.2 直接访问 /register 落在注册 tab", reg.url === "/register" && reg.activeTab === "注册", reg);
  check("2.1 注册显示步骤指示且停在第 1 步", reg.stepVisible && reg.step1Current, { step1: reg.step1Current });
  check("2.1 第 1 步有「下一步」且没有密码框", reg.hasNext && !reg.hasPassword, reg);

  /* ---------- 第 1 步校验 ---------- */
  const guard = await c.js<{ stayed: boolean; errorShown: boolean; errorText: string }>(`(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find(b => (b.textContent ?? '').trim() === '下一步')?.click();
    return { stayed: true, errorShown: false, errorText: '' };
  })()`);
  await sleep(700);
  const guardAfter = await c.js<{ stillStep1: boolean; errorText: string }>(`(() => {
    const steps = [...document.querySelectorAll('.register-step')];
    return {
      stillStep1: steps[0]?.getAttribute('data-current') === 'true',
      errorText: document.querySelector('.register-error')?.textContent?.trim() ?? '',
    };
  })()`);
  check("2.1 第 1 步空值时不能前进并指出缺什么", guardAfter.stillStep1 && guardAfter.errorText.length > 0, {
    error: guardAfter.errorText,
  });
  void guard;

  /* ---------- 填第 1 步 → 进入第 2 步 ---------- */
  await c.js(`(() => {
    const setVal = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll('[data-pane=register] form:first-of-type input')];
    setVal(inputs[0], 'testuser' + Date.now().toString().slice(-6));
    setVal(inputs[1], 'guest@example.com');
    setVal(inputs[2], '123456');
    return true;
  })()`);
  await sleep(400);
  await c.js(`(() => {
    [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '下一步')?.click();
    return true;
  })()`);
  await sleep(900);
  const step2 = await c.js<{
    step2Current: boolean;
    hasPassword: number;
    hasBack: boolean;
    focusIsPassword: boolean;
    trackHeight: number;
  }>(`(() => {
    const steps = [...document.querySelectorAll('.register-step')];
    const active = document.activeElement;
    return {
      step2Current: steps[1]?.getAttribute('data-current') === 'true',
      hasPassword: [...document.querySelectorAll('[data-pane=register] input[type=password]')].length,
      hasBack: [...document.querySelectorAll('button')].some(b => (b.textContent ?? '').trim().includes('上一步')),
      focusIsPassword: active?.getAttribute('type') === 'password',
      trackHeight: Math.round(document.querySelector('.auth-track')?.getBoundingClientRect().height ?? 0),
    };
  })()`);
  check("2.1 进入第 2 步且有两个密码框", step2.step2Current && step2.hasPassword === 2, step2);
  check("2.2 焦点自动落到密码框", step2.focusIsPassword, { focus: step2.focusIsPassword });
  check("2.2 第 2 步有「上一步」", step2.hasBack, step2);

  /* ---------- 上一步回去，填的内容还在 ---------- */
  await c.js(`(() => {
    [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim().includes('上一步'))?.click();
    return true;
  })()`);
  await sleep(900);
  const back = await c.js<{ step1: boolean; username: string; email: string; code: string }>(`(() => {
    const steps = [...document.querySelectorAll('.register-step')];
    const inputs = [...document.querySelectorAll('[data-pane=register] form:first-of-type input')];
    return {
      step1: steps[0]?.getAttribute('data-current') === 'true',
      username: inputs[0]?.value ?? '',
      email: inputs[1]?.value ?? '',
      code: inputs[2]?.value ?? '',
    };
  })()`);
  check("2.1 回到第 1 步且已填内容保留",
    back.step1 && back.username.length > 0 && back.email === "guest@example.com" && back.code === "123456",
    { username: back.username.slice(0, 12), email: back.email, code: back.code });

  /* ---------- 横向换页：切换 tab 时有方向性位移 ---------- */
  // 记录切换过程中的 transform 采样
  // 逐帧采样：rAF 比 setTimeout 精确，能抓到 GSAP 缓动前段的快速位移
  const slide = await c.js<{
    regMoving: number;
    loginMoving: number;
    regStart: number;
    regEnd: number;
    loginStart: number;
    loginEnd: number;
    endedCorrect: boolean;
    heightChanged: boolean;
  }>(`(async () => {
    const regPane = document.querySelector('[data-pane=register]');
    const loginPane = document.querySelector('[data-pane=login]');
    const track = document.querySelector('.auth-track');
    const hBefore = track.getBoundingClientRect().height;

    let running = true;
    const frames = [];
    const sample = () => {
      if (!running) return;
      frames.push({
        reg: Math.round(new DOMMatrixReadOnly(getComputedStyle(regPane).transform).m41),
        login: Math.round(new DOMMatrixReadOnly(getComputedStyle(loginPane).transform).m41),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    // 点「登录」tab（当前在注册）
    [...document.querySelectorAll('[role=tab]')].find(t => (t.textContent ?? '').trim() === '登录')?.click();
    await new Promise(r => setTimeout(r, 900));
    running = false;

    const hAfter = track.getBoundingClientRect().height;
    const regVals = frames.map(f => f.reg);
    const loginVals = frames.map(f => f.login);
    return {
      regMoving: regVals.filter(v => Math.abs(v) > 1).length,
      loginMoving: loginVals.filter(v => Math.abs(v) > 1).length,
      regStart: regVals[0] ?? 0,
      regEnd: regVals[regVals.length - 1] ?? 0,
      loginStart: loginVals[0] ?? 0,
      loginEnd: loginVals[loginVals.length - 1] ?? 0,
      endedCorrect: document.querySelector('[data-pane=login]')?.getAttribute('data-active') === 'true',
      heightChanged: Math.abs(hBefore - hAfter) > 40,
    };
  })()`);
  // 方向性：注册页从右侧退到视野外（正值→0），登录页从左侧回到 0（负值→0）
  check(
    "1.2 切换有横向位移（两块同时在场交叉）",
    slide.regMoving >= 2 && slide.loginMoving >= 2,
    { regFrames: slide.regMoving, loginFrames: slide.loginMoving, reg: [slide.regStart, slide.regEnd], login: [slide.loginStart, slide.loginEnd] }
  );
  // 从注册切到登录：离场的是注册（0 → +380，向右退出），入场的是登录（-380 → 0，从左侧回来）
  // 采样第一帧可能落在动画开始前，所以看"起点与终点是否分居轨道两侧且最终归位"
  check(
    "1.2 方向正确：注册向右退出、登录从左归位",
    Math.abs(slide.regStart) <= 1 &&
      slide.regEnd > 100 &&
      slide.loginStart <= -100 &&
      Math.abs(slide.loginEnd) <= 1,
    { regStart: slide.regStart, regEnd: slide.regEnd, loginStart: slide.loginStart, loginEnd: slide.loginEnd }
  );
  check("1.2 切换结束停在登录 tab", slide.endedCorrect, slide);
  check("1.3 面板高度跟随内容变化（注册比登录高 > 40px）", slide.heightChanged, {
    changed: slide.heightChanged,
  });

  /* ---------- 切回注册：步骤复位到第 1 步 ---------- */
  await c.js(`(() => {
    [...document.querySelectorAll('[role=tab]')].find(t => (t.textContent ?? '').trim() === '注册')?.click();
    return true;
  })()`);
  await sleep(900);
  const reset = await c.js<{ step1: boolean }>(`(() => {
    const steps = [...document.querySelectorAll('.register-step')];
    return { step1: steps[0]?.getAttribute('data-current') === 'true' };
  })()`);
  check("2.3 切换 tab 后注册步骤复位到第 1 步", reset.step1, reset);

  /* ---------- 输入保持：登录填的内容切走再回来还在 ---------- */
  await c.open(`${BASE}/login`);
  await sleep(1200);
  const kept = await c.js<{ setOk: string; afterBack: string; path: string }>(`(async () => {
    const loginInput = () => document.querySelector('[data-pane=login] input');
    const clickTab = (label) => {
      [...document.querySelectorAll('[role=tab]')].find(t => (t.textContent ?? '').trim() === label)?.click();
    };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

    setter.call(loginInput(), 'kept-value');
    loginInput().dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const setOk = loginInput()?.value ?? '';

    clickTab('注册');
    await new Promise(r => setTimeout(r, 800));
    clickTab('登录');
    await new Promise(r => setTimeout(r, 800));

    return { setOk, afterBack: loginInput()?.value ?? '', path: location.pathname };
  })()`);
  check("3.3 切走再切回，登录输入仍在", kept.setOk === "kept-value" && kept.afterBack === "kept-value", kept);

  /* ---------- URL 同步但不整页刷新 ---------- */
  await c.open(`${BASE}/login`);
  const nav = await c.js<{ before: string; hasMarker: boolean }>(`(() => {
    window.__noReload = true;
    return { before: location.pathname, hasMarker: true };
  })()`);
  await c.js(`(() => {
    [...document.querySelectorAll('[role=tab]')].find(t => (t.textContent ?? '').trim() === '注册')?.click();
    return true;
  })()`);
  await sleep(1200);
  const synced = await c.js<{ path: string; noReload: boolean; activeTab: string }>(`(() => {
    const tabs = [...document.querySelectorAll('[role=tab]')];
    const active = tabs.find(t => t.getAttribute('aria-selected') === 'true');
    return {
      path: location.pathname,
      noReload: window.__noReload === true,
      activeTab: active?.textContent?.trim() ?? '',
    };
  })()`);
  check("3.2 切换同步 URL 到 /register", synced.path === "/register", { path: synced.path, before: nav.before });
  check("3.2 切换没有整页刷新（页面上下文保留）", synced.noReload, { noReload: synced.noReload });
  check("3.2 URL 变了但 tab 状态一致", synced.activeTab === "注册", { active: synced.activeTab });

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
