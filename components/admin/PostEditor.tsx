"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";
import { Markdown } from "@/components/Markdown";

type EditorTag = { id: string; name: string; slug: string };

type EditorPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover: string | null;
  content: string;
  published: boolean;
  tags: EditorTag[];
};

type Mode = "split" | "write" | "preview";

export function PostEditor({ post }: { post?: EditorPost }) {
  const router = useRouter();
  const isEdit = Boolean(post);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const coverFileRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [cover, setCover] = useState(post?.cover ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [tags, setTags] = useState(
    (post?.tags ?? []).map((t) => t.name).join(", ")
  );
  const [published, setPublished] = useState(post?.published ?? false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("split");

  // 窄屏默认只显示编辑区，避免两栏挤在一起
  useEffect(() => {
    if (window.innerWidth < 900) setMode("write");
  }, []);

  const charCount = content.length;
  const lineCount = content ? content.split("\n").length : 0;

  function onTitleChange(v: string) {
    setTitle(v);
    if (!isEdit || !slug) setSlug(slugify(v));
  }

  /** 工具栏：在光标处包裹/插入 Markdown 片段 */
  function wrapSelection(before: string, after = before, placeholder = "文本") {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const selected = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  /** 工具栏：整行插入前缀（标题/引用/列表） */
  function prefixLine(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  function insertBlock(block: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const next = value.slice(0, s) + block + value.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + block.length, s + block.length);
    });
  }

  /** 封面图上传到阿里云 OSS，回填 URL */
  async function onCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setCoverBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "cover");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "上传失败");
      }
      if (typeof data.url === "string" && data.url) {
        setCover(data.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "封面上传失败");
    } finally {
      setCoverBusy(false);
    }
  }

  async function handleAi() {
    if (!title.trim() || !content.trim()) {
      setAiMsg("请先填写标题和正文");
      return;
    }
    setAiBusy(true);
    setAiMsg("");
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "AI 生成失败");
      }
      if (typeof data.excerpt === "string" && data.excerpt) {
        setExcerpt(data.excerpt);
      }
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        setTags(data.tags.join(", "));
      }
      setAiMsg("已生成，请检查后再保存");
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : "AI 生成失败");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(isEdit ? `/api/posts/${post!.id}` : "/api/posts", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug, excerpt, cover, content, tags, published }),
      });
      if (res.ok) {
        router.push("/admin/posts");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "保存失败");
    } catch {
      setError("网络错误，保存失败");
    }
    setSaving(false);
  }

  const preview = useMemo(
    () => (
      <div className="prose editor-prose">
        <Markdown>{content || "（正文为空，开始输入后这里会实时预览）"}</Markdown>
      </div>
    ),
    [content]
  );

  return (
    <form className="editor" onSubmit={handleSubmit}>
      <div className="editor-head">
        <h1>{isEdit ? "编辑文章" : "写文章"}</h1>
        <div className="editor-actions">
          <label className="switch">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            <span>立即发布</span>
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={handleAi}
            disabled={aiBusy}
          >
            {aiBusy ? "AI 生成中…" : "✨ AI 摘要 + 标签"}
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "保存中…" : isEdit ? "保存修改" : "创建文章"}
          </button>
        </div>
      </div>

      {error && <p className="notice error">{error}</p>}
      {aiMsg && <p className="notice info">{aiMsg}</p>}

      <div className="editor-meta">
        <div className="field">
          <label>标题 *</label>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="给文章起个标题"
            required
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>Slug（URL 标识）</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="留空自动生成"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>标签（英文逗号分隔）</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Next.js, 前端, 部署"
          />
        </div>
        <div className="field">
          <label>封面图（选填）</label>
          <div className="cover-row">
            <input
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="https://… 或点右侧上传到 OSS"
            />
            <button
              type="button"
              className="btn btn-sm ghost"
              onClick={() => coverFileRef.current?.click()}
              disabled={coverBusy}
            >
              {coverBusy ? "上传中…" : "上传"}
            </button>
            <input
              ref={coverFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onCoverFile}
            />
            {cover && (
              <button
                type="button"
                className="btn btn-sm ghost"
                onClick={() => setCover("")}
              >
                清除
              </button>
            )}
          </div>
        </div>
        <div className="field field-wide">
          <label>摘要（选填，列表与分享卡片展示）</label>
          <input
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="一两句话概括本文"
            maxLength={300}
          />
        </div>
      </div>

      <div className={`editor-split mode-${mode}`}>
        <section className="editor-write">
          <div className="editor-toolbar">
            <div className="editor-tools" role="toolbar" aria-label="Markdown 工具栏">
              <button type="button" title="标题" onClick={() => prefixLine("## ")}>
                H2
              </button>
              <button type="button" title="粗体" onClick={() => wrapSelection("**")}>
                <b>B</b>
              </button>
              <button type="button" title="斜体" onClick={() => wrapSelection("_")}>
                <i>I</i>
              </button>
              <button
                type="button"
                title="行内代码"
                onClick={() => wrapSelection("`", "`", "code")}
              >
                {"</>"}
              </button>
              <button
                type="button"
                title="链接"
                onClick={() => wrapSelection("[", "](https://)", "链接文字")}
              >
                →
              </button>
              <button
                type="button"
                title="代码块"
                onClick={() => insertBlock("```ts\n\n```")}
              >
                {"```"}
              </button>
              <button type="button" title="引用" onClick={() => prefixLine("> ")}>
                &gt;
              </button>
              <button type="button" title="列表" onClick={() => prefixLine("- ")}>
                ·
              </button>
            </div>
            <div className="editor-modes" role="tablist" aria-label="编辑器视图">
              {(
                [
                  ["write", "编辑"],
                  ["split", "分屏"],
                  ["preview", "预览"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={mode === m ? "active" : ""}
                  onClick={() => setMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在此书写 Markdown 正文…"
            required
            spellCheck={false}
          />
          <div className="editor-status">
            <span>{charCount} 字符</span>
            <span>{lineCount} 行</span>
            <span>支持 Markdown / GFM</span>
          </div>
        </section>

        <section className="editor-preview" aria-label="实时预览">
          <div className="preview-head">
            <span>实时预览</span>
            <span className="preview-hint">与文章页同一管线</span>
          </div>
          <div className="preview-body">{preview}</div>
        </section>
      </div>
    </form>
  );
}
