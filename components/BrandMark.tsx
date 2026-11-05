/**
 * 站点标记：把 favicon 里的「终端提示符」（caret + 光标块）做成可描边的内联 SVG。
 * 欢迎页放大使用，两笔分别取电蓝与洋红；纯装饰，对辅助技术隐藏。
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* caret：描边动画的目标 */}
      <path
        className="w-mark-caret"
        d="M9.5 10.5 L16 16 L9.5 21.5"
        fill="none"
        stroke="var(--w-signal)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="20"
      />
      {/* 光标块：从左侧长出 */}
      <rect
        className="w-mark-cursor"
        x="18"
        y="18.4"
        width="6.6"
        height="3.4"
        rx="1.5"
        fill="var(--w-signal-2)"
      />
    </svg>
  );
}