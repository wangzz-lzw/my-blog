"use client";

import React, { useState, type ReactNode } from "react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { ScrollArea } from "@/components/ui/ScrollArea";

/**
 * 终端风代码卡：顶栏 ~/语言标签 + 复制按钮。
 * 经 Markdown.tsx 的 components.pre 映射使用；语言从 code 元素的
 * className（hljs language-xxx）推断。
 */

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText(
      (node.props as { children?: ReactNode } | undefined)?.children
    );
  }
  return "";
}

export function CodeBlock({
  children,
  language,
  sourceLine,
}: {
  children?: ReactNode;
  language?: string;
  /** 该代码块在 Markdown 源码里的起始行号（分屏联动定位用） */
  sourceLine?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { alert: notify } = useFeedback();

  const text = extractText(children).replace(/\n$/, "");

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // 非安全上下文降级
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      void notify({
        title: "复制失败",
        description: "浏览器拒绝了写入剪贴板，请手动选中后复制。",
      });
    }
  };

  return (
    <div className="code-card" data-src={sourceLine}>
      <div className="code-header">
        <span className="code-lang">~/ {language || "text"}</span>
        <button className="copy-btn" type="button" onClick={copy}>
          {copied ? "已复制 ✓" : "复制"}
        </button>
      </div>
      {/* 代码块横向滚动也走全站同一套自绘条 */}
      <ScrollArea axis="x" className="code-scroll" contentClassName="code-scroll-content">
        <pre>{children}</pre>
      </ScrollArea>
    </div>
  );
}
