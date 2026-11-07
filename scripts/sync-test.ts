// 分屏联动的单元测试（openspec: sync-editor-split-scroll，任务 2.1-2.3）
// 跑法：npx tsx scripts/sync-test.ts
import {
  lineToTop,
  topToLine,
  findBlockIndex,
  findBlockByOffset,
  SyncController,
  type ScrollTarget,
} from "../components/admin/editor-scroll-sync";

const results: boolean[] = [];
const eq = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
};
const truthy = (name: string, cond: boolean, detail?: unknown) => {
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

/* ---------- 2.1 纯函数边界 ---------- */
eq("lineToTop 第1行 = paddingTop", lineToTop(1, 20, 16), 16);
eq("lineToTop 第5行", lineToTop(5, 20, 16), 96);
eq("lineToTop 不小于 0", lineToTop(0, 20, 16), 0);
eq("topToLine 回到第1行", topToLine(16, 20, 16), 1);
eq("topToLine 中间", topToLine(96, 20, 16), 5);
eq("topToLine 负数兜底为 1", topToLine(-50, 20, 16), 1);
eq("topToLine lineHeight=0 兜底", topToLine(100, 0, 16), 1);
eq("findBlockIndex 行小于首块 → -1", findBlockIndex([5, 10, 20], 3), -1);
eq("findBlockIndex 等于某块", findBlockIndex([5, 10, 20], 10), 1);
eq("findBlockIndex 块之间 → 前一个", findBlockIndex([5, 10, 20], 15), 1);
eq("findBlockIndex 大于末块 → 末块", findBlockIndex([5, 10, 20], 999), 2);
eq("findBlockIndex 空数组 → -1", findBlockIndex([], 5), -1);
eq("findBlockIndex 单元素命中", findBlockIndex([7], 7), 0);
eq("findBlockIndex 全同值取最后一个", findBlockIndex([3, 3, 3], 3), 2);
eq("findBlockByOffset 基本", findBlockByOffset([0, 100, 300], 150), 1);
eq("findBlockByOffset 小于首项", findBlockByOffset([10, 100], 5), -1);
eq("findBlockByOffset 空", findBlockByOffset([], 5), -1);

/* ---------- 假元素 ---------- */
type FakeWrite = ScrollTarget & { getLineHeight: () => number; getPaddingTop: () => number };
function fakeWrite(scrollHeight: number, clientHeight: number): FakeWrite {
  return {
    scrollHeight,
    clientHeight,
    scrollTop: 0,
    getLineHeight: () => 20,
    getPaddingTop: () => 16,
  };
}
function fakePreview(scrollHeight: number, clientHeight: number): ScrollTarget {
  return { scrollHeight, clientHeight, scrollTop: 0 };
}

/* ---------- 2.2 联动方向 ---------- */
{
  const w = fakeWrite(2000, 400);
  const p = fakePreview(5000, 600);
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  c.setBlocks([1, 5, 10, 20], [0, 200, 600, 1500]);
  w.scrollTop = 96; // → 第 5 行
  const idx = c.syncFromWrite();
  eq("编辑区第5行 → 选中第2块", idx, 1);
  eq("预览被写到该块偏移", p.scrollTop, 200);
  eq("写前标记受控侧为 preview", c.guardSide, "preview");
  eq("受控侧事件被吞掉", c.onScroll("preview"), "preview");
  eq("不产生反向写入", w.scrollTop, 96);
}
{
  const w = fakeWrite(2000, 400);
  const p = fakePreview(5000, 600);
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  c.setBlocks([1, 5, 10, 20], [0, 200, 600, 1500]);
  w.scrollTop = 96;
  c.onScroll("write");
  const afterFirst = c.stats.writes;
  c.onScroll("preview");
  eq("受控侧重复派发不再写", c.stats.writes, afterFirst);
  truthy("一次驱动只写一次对侧", c.stats.writes === 1, c.stats);
}
{
  const w = fakeWrite(2000, 400);
  const p = fakePreview(5000, 600);
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  c.setBlocks([1, 5, 10, 20], [0, 200, 600, 1500]);
  p.scrollTop = 620; // 落在第3块（600）之后
  const idx = c.syncFromPreview();
  eq("预览像素 → 第3块", idx, 2);
  eq("编辑区被写到该块行号位置", w.scrollTop, 196); // (10-1)*20+16
  eq("受控侧是 write", c.guardSide, "write");
  eq("编辑区事件被吞", c.onScroll("write"), "write");
}
{
  const w = fakeWrite(2000, 400);
  const p = fakePreview(5000, 600);
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  c.setBlocks([1, 5], [0, 200]);
  c.setEnabled(false);
  w.scrollTop = 96;
  c.onScroll("write");
  eq("关闭后预览不动", p.scrollTop, 0);
  eq("关闭后 guard 为空", c.guardSide, null);
  c.setEnabled(true);
  c.syncFromWrite();
  eq("重新开启后能立即对齐", p.scrollTop, 200);
}
{
  const w = fakeWrite(2000, 400);
  const p = fakePreview(5000, 600);
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  eq("无块时 syncFromWrite 返回 -1", c.syncFromWrite(), -1);
  eq("无块时 syncFromPreview 返回 -1", c.syncFromPreview(), -1);
  eq("无块时 onScroll 不炸", c.onScroll("write"), null);
}
{
  const w = fakeWrite(2000, 400);
  const p = fakePreview(1000, 600); // max = 400
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  c.setBlocks([1, 999], [0, 9999]);
  // 20016 → 第 1000 行，落在第 2 块（行 999），其偏移 9999 远超预览 max
  w.scrollTop = 20016;
  const idx = c.syncFromWrite();
  eq("越界时仍选中末块", idx, 1);
  eq("越界写入被 clamp 到 max", p.scrollTop, 400);
}
{
  // 目标等于当前位置：不触发 scroll 事件，靠 120ms 窗口自然过期
  const w = fakeWrite(2000, 400);
  const p = fakePreview(5000, 600);
  p.scrollTop = 200;
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  c.setBlocks([1, 5], [0, 200]);
  w.scrollTop = 96;
  c.syncFromWrite();
  eq("目标等于当前位置时不重复写", p.scrollTop, 200);
  eq("也不留 guard（因为无实际写入）", c.guardSide, null);
}

/* ---------- 2.3 快速来回滚动不堆积 ---------- */
{
  const w = fakeWrite(2000, 400);
  const p = fakePreview(5000, 600);
  const c = new SyncController(w, p);
  c.setMetrics(20, 16);
  c.setBlocks([1, 5, 10, 20, 30], [0, 200, 600, 1500, 3000]);
  for (let i = 0; i < 20; i += 1) {
    w.scrollTop = i % 2 === 0 ? 100 : 500;
    c.onScroll("write");
    c.onScroll("preview");
  }
  truthy("20 次来回后写入次数与驱动次数同阶（≤20）", c.stats.writes <= 20, c.stats);
  truthy("吞掉的事件数与写入次数同阶", c.stats.skipped <= 20, c.stats);
  // 最后一次驱动是 i=19（奇数）→ scrollTop=500 → 第 25 行 → 第 4 块（行 20）→ 偏移 1500
  eq("最终预览位置对应最后一次驱动（不滞后）", p.scrollTop, 1500);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
