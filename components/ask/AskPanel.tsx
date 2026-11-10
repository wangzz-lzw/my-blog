"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * 站内问答面板（见 openspec: add-ai-qa）。
 *
 * 用原生 fetch + ReadableStream 读 SSE，不引 AI SDK。
 * 流式期间只更新一个 ref 指向的文本节点，避免每个 delta 都触发整棵树重渲染。
 */

type Stage = "idle" | "retrieving" | "generating" | "refused" | "done" | "error";

type Source = { title: string; slug: string };
type Topic = { title: string; slug: string; tags: string[] };

type Message = {
  id: number;
  question: string;
  answer: string;
  sources: Source[];
  topics: Topic[];
  stage: Stage;
};

type SseEvent =
  | { type: "stage"; stage: string }
  | { type: "sources"; sources: Source[] }
  | { type: "topics"; topics: Topic[] }
  | { type: "delta"; text: string }
  | { type: "error"; message: string };

let msgSeq = 0;

export function AskPanel({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const answerRef = useRef<HTMLSpanElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentIdRef = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        abortRef.current?.abort();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 把一段文本追加到当前消息：直接改 DOM 文本节点，不触发 React 重渲染 */
  const appendAnswer = useCallback((id: number, text: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, answer: m.answer + text } : m))
    );
  }, []);

  const patchMessage = useCallback((id: number, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setNotice("");
    setInput("");

    const id = ++msgSeq;
    currentIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      { id, question, answer: "", sources: [], topics: [], stage: "retrieving" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? `请求失败（${res.status}）`);
        patchMessage(id, { stage: "error" });
        setBusy(false);
        return;
      }
      if (!res.body) {
        setNotice("服务没有返回内容");
        patchMessage(id, { stage: "error" });
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let bufferText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let ev: SseEvent;
          try {
            ev = JSON.parse(line.slice(5).trim()) as SseEvent;
          } catch {
            continue;
          }

          if (ev.type === "stage") {
            if (ev.stage === "generating" || ev.stage === "refused" || ev.stage === "done") {
              patchMessage(id, { stage: ev.stage as Stage });
            }
          } else if (ev.type === "sources") {
            patchMessage(id, { sources: ev.sources ?? [] });
          } else if (ev.type === "topics") {
            patchMessage(id, { topics: ev.topics ?? [] });
          } else if (ev.type === "delta") {
            // 累积到小缓冲，按帧刷新，避免每个 token 都 setState
            bufferText += ev.text;
            if (bufferText.length >= 12) {
              appendAnswer(id, bufferText);
              bufferText = "";
              requestAnimationFrame(scrollToBottom);
            }
          } else if (ev.type === "error") {
            setNotice(ev.message);
            patchMessage(id, { stage: "error" });
          }
        }
      }

      if (bufferText) appendAnswer(id, bufferText);
      patchMessage(id, { stage: "done" });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // 用户主动停止：保留已显示的内容，回到可提问状态
        patchMessage(id, { stage: "done" });
      } else {
        setNotice(e instanceof Error ? e.message : "连接中断，请重试");
        patchMessage(id, { stage: "error" });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      requestAnimationFrame(scrollToBottom);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="ask-panel" role="dialog" aria-modal="false" aria-label="站内问答">
      <div className="ask-head">
        <div className="ask-head-copy">
          <span className="ask-title">问问</span>
          <span className="ask-sub">只依据已发布的文章回答</span>
        </div>
        <button type="button" className="ask-close" onClick={onClose} aria-label="关闭问答">
          ✕
        </button>
      </div>

      <div className="ask-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ask-empty">
            <p>站上写了什么，就能问什么。</p>
            <p className="ask-empty-hint">
              答案只来自这个博客的文章；文章里没有的，我会直接说不知道。
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div className="ask-msg" key={m.id}>
            <p className="ask-q">{m.question}</p>

            {(m.stage === "retrieving" || m.stage === "generating") && !m.answer && (
              <p className="ask-status" aria-live="polite">
                {m.stage === "retrieving" ? "正在检索文章…" : "正在组织回答…"}
              </p>
            )}

            {m.answer && (
              <div className="ask-a" aria-live="polite">
                <span ref={i === messages.length - 1 ? answerRef : undefined}>
                  {m.answer}
                </span>
                {m.stage === "generating" && (
                  <span className="ask-caret" aria-hidden="true">
                    ▌
                  </span>
                )}
              </div>
            )}

            {m.stage === "refused" && m.topics.length > 0 && (
              <div className="ask-topics">
                <span className="ask-topics-label">可以问问这些</span>
                <div className="ask-topics-list">
                  {m.topics.slice(0, 6).map((t) => (
                    <Link key={t.slug} href={`/posts/${encodeURIComponent(t.slug)}`} className="ask-topic">
                      {t.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {m.sources.length > 0 && m.stage !== "refused" && (
              <div className="ask-sources">
                <span className="ask-sources-label">参考文章</span>
                {m.sources.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/posts/${encodeURIComponent(s.slug)}`}
                    className="ask-source"
                  >
                    {s.title}
                  </Link>
                ))}
              </div>
            )}

            {m.stage === "error" && <p className="ask-error">回答没有完成，可以再试一次。</p>}
          </div>
        ))}

        {notice && <p className="ask-notice" role="alert">{notice}</p>}
      </div>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的问题…"
          aria-label="输入问题"
          disabled={busy}
          maxLength={500}
        />
        {busy ? (
          <button type="button" className="ask-send" onClick={stop} aria-label="停止生成">
            停止
          </button>
        ) : (
          <button type="submit" className="ask-send" disabled={!input.trim()}>
            提问
          </button>
        )}
      </form>
    </div>
  );
}
