/**
 * 分屏滚动的联动算法（见 openspec: editor-scroll-sync）。
 *
 * 这里只放纯计算与状态机，不碰 React、不碰 DOM 查找，方便单独验证。
 * 坐标依据是**源码行号**而不是滚动比例：一段 5 行的源码可能渲染成 50px，
 * 也可能 400px，比例联动在长文里必然漂移，行号是两边唯一稳定的共同坐标。
 */

/** 源码头部的内边距对行号换算的影响由调用方传入，这里只做算术 */
export function lineToTop(line: number, lineHeight: number, paddingTop: number): number {
  return Math.max(0, (line - 1) * lineHeight + paddingTop);
}

/**
 * 把滚动位置换算成「视口顶部对应的源码行」。
 *
 * textarea 没有 API 能问「第几行在视口顶部」，只能按等宽行高反推。取整到行是
 * 合理精度：两侧都是块级对齐，行内误差不影响结果。
 */
export function topToLine(top: number, lineHeight: number, paddingTop: number): number {
  if (lineHeight <= 0) return 1;
  return Math.max(1, Math.floor((top - paddingTop) / lineHeight) + 1);
}

/**
 * 找到最后一个满足 `lines[i] <= line` 的下标；没有则返回 -1。
 *
 * 二分：块数可能上百，但滚动帧里每帧只算一次，O(log n) 比线性更稳。
 */
export function findBlockIndex(lines: readonly number[], line: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] <= line) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * 找到「当前视口顶部」对应的块：给定每个块的源码行与内容坐标，
 * 返回其顶部不大于当前滚动位置的那个块。
 *
 * 与 findBlockIndex 的区别：那个按源码行查、这个按内容像素查，用于
 * 预览 → 编辑区方向（预览侧只有像素坐标，行号在块上）。
 */
export function findBlockByOffset(offsets: readonly number[], top: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= top) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export type SyncSide = "write" | "preview";

/**
 * 一个可滚动的「侧」。用最小接口描述，测试时可以传普通对象。
 * 真实实现里 write 侧是 textarea，preview 侧是 OverlayScrollbars 的 viewport。
 */
export type ScrollTarget = {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
};

/** 受控写入的记录：谁被写、写到了哪里 */
type Guard = { side: SyncSide; target: number; until: number } | null;

/** 兜底窗口：靠「目标等于当前位置时不触发 scroll」的极端情况由它自然过期 */
const GUARD_MS = 120;

/**
 * 联动控制器。
 *
 * 回声消除的关键不是计时，而是一个确定性事实：**程序化写完 scrollTop 之后，
 * 该侧下一帧的 scroll 事件必然是自己造成的**。所以写入时记录 {side, target}，
 * 受控侧的回调里比对当前值是否已到达目标值来判断「这枪是我开的」。
 * 计时窗口只兜底「目标恰好等于当前位置、压根不触发 scroll」这一种漏事件的情形。
 */
export class SyncController {
  private lines: number[] = [];
  private offsets: number[] = [];
  private metrics = { lineHeight: 0, paddingTop: 0 };
  private guard: Guard = null;
  private enabled = true;
  /** 记录被跳过的事件数与被执行的对侧写入数，供测试与调试断言 */
  readonly stats = { writes: 0, skipped: 0, ignored: 0 };

  constructor(
    private write: ScrollTarget & {
      getLineHeight: () => number;
      getPaddingTop: () => number;
    },
    private preview: ScrollTarget
  ) {}

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.guard = null;
  }

  isEnabled() {
    return this.enabled;
  }

  /** 块级元素的源码行与在预览内容坐标系里的顶部偏移，按文档顺序 */
  setBlocks(lines: number[], offsets: number[]) {
    this.lines = lines;
    this.offsets = offsets;
  }

  setMetrics(lineHeight: number, paddingTop: number) {
    this.metrics = { lineHeight, paddingTop };
  }

  get blockCount() {
    return this.lines.length;
  }

  /** 当前受控侧（测试用） */
  get guardSide(): SyncSide | null {
    return this.guard?.side ?? null;
  }

  private inGuard(side: SyncSide, current: number): boolean {
    const g = this.guard;
    if (!g || g.side !== side) return false;
    // 已经到达目标值 = 这次事件是程序化写入引起的，吞掉
    if (Math.abs(current - g.target) <= 1) {
      this.guard = null;
      return true;
    }
    // 还没到目标但窗口已过期 = 用户自己动了，放行
    if (Date.now() > g.until) {
      this.guard = null;
      return false;
    }
    return true;
  }

  private assign(side: SyncSide, target: number) {
    const el = side === "write" ? this.write : this.preview;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const clamped = Math.max(0, Math.min(max, target));
    if (Math.abs(clamped - el.scrollTop) <= 1) {
      // 目标等于当前位置：不会触发 scroll 事件，直接记账即可
      this.stats.writes += 1;
      return;
    }
    this.guard = { side, target: clamped, until: Date.now() + GUARD_MS };
    el.scrollTop = clamped;
    this.stats.writes += 1;
  }

  /** 编辑区在滚（或用户刚滚过）→ 把预览对齐到对应块 */
  syncFromWrite(): number {
    if (!this.enabled) return -1;
    const { lineHeight, paddingTop } = this.metrics;
    if (!this.lines.length || lineHeight <= 0) return -1;
    const line = topToLine(this.write.scrollTop, lineHeight, paddingTop);
    const idx = findBlockIndex(this.lines, line);
    if (idx < 0) return -1;
    this.assign("preview", this.offsets[idx]);
    return idx;
  }

  /** 预览在滚 → 把编辑区对齐到对应块的源码行 */
  syncFromPreview(): number {
    if (!this.enabled) return -1;
    const { lineHeight, paddingTop } = this.metrics;
    if (!this.lines.length || lineHeight <= 0) return -1;
    const idx = findBlockByOffset(this.offsets, this.preview.scrollTop);
    if (idx < 0) return -1;
    this.assign("write", lineToTop(this.lines[idx], lineHeight, paddingTop));
    return idx;
  }

  /**
   * 两侧都挂了 scroll 监听时统一走这里，由控制器判断「这枪是谁开的」。
   * 返回被忽略的侧，便于调试。
   */
  onScroll(side: SyncSide): SyncSide | null {
    if (!this.enabled) {
      this.stats.ignored += 1;
      return side;
    }
    const el = side === "write" ? this.write : this.preview;
    if (this.inGuard(side, el.scrollTop)) {
      this.stats.skipped += 1;
      return side;
    }
    if (side === "write") this.syncFromWrite();
    else this.syncFromPreview();
    return null;
  }
}
