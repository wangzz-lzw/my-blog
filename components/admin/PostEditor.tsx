"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";

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

export function PostEditor({ post }: { post?: EditorPost }) {
  const router = useRouter();
  const isEdit = Boolean(post);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [cover, setCover] = useState(post?.cover ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [tags, setTags] = useState((post?.tags ?? []).map((t) => t.name).join(", "));
  const [published, setPublished] = useState(post?.published ?? false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!isEdit || !slug) setSlug(slugify(v));
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

  return (
    <form
      onSubmit={handleSubmit}
      className="editor"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      {error && <p className="notice error">{error}</p>}
      <div className="field">
        <label>标题 *</label>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          required
          maxLength={200}
        />
      </div>
      <div className="field">
        <label>Slug（URL 标识）</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="英文短标识，留空自动生成"
          maxLength={200}
        />
      </div>
      <div className="field">
        <label>封面图 URL（选填）</label>
        <input
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="field">
        <label>摘要（选填）</label>
        <input
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          maxLength={300}
        />
      </div>
      <div className="field">
        <label>标签（英文逗号分隔，选填）</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Next.js, 前端, 部署"
        />
      </div>
      <div className="field">
        <label>正文（Markdown）*</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required />
      </div>
      <label
        style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        立即发布
      </label>
      <div>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "保存中…" : isEdit ? "保存修改" : "创建文章"}
        </button>
      </div>
    </form>
  );
}
