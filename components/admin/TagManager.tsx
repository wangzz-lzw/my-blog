"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slug";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

export type TagRow = {
  id: string;
  name: string;
  slug: string;
  /** 历史地址：改名后旧链接靠它跳转 */
  aliases: string[];
  /** 关联文章数（含草稿） */
  count: number;
  created: string;
};

const HAS_WORD = /[\p{L}\p{N}]/u;

/** 名称 → 预填的地址段（纯符号名称没有可用字符，留空让人手填） */
function previewSlug(name: string) {
  return HAS_WORD.test(name) ? slugify(name) : "";
}

/** 把服务端返回的 JSON 错误翻成一句人话 */
async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return (data?.error as string) || "操作失败，请重试";
}

/**
 * 标签管理：新建 / 行内改名 / 删除。
 *
 * 表格数据不放进本地 state —— 每次写成功后 `router.refresh()` 让服务端组件重新取数，
 * 这样"列表里看到的篇数"永远和库一致，不用在前端手动对账。
 */
export function TagManager({ initialTags }: { initialTags: TagRow[] }) {
  const router = useRouter();
  const { confirm } = useFeedback();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  /** 地址段被手动改过之后，就不再跟着名称走 */
  const [slugTouched, setSlugTouched] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(
    null
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (!res.ok) {
        setCreateError(await readError(res));
        return;
      }
      setName("");
      setSlug("");
      router.refresh();
    } catch {
      setCreateError("网络异常，请重试");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(tag: TagRow) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditSlug(tag.slug);
    setSlugTouched(false);
    setRowError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError(null);
  }

  async function onSave(tag: TagRow) {
    if (busyId) return;
    setBusyId(tag.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, slug: editSlug }),
      });
      if (!res.ok) {
        setRowError({ id: tag.id, message: await readError(res) });
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setRowError({ id: tag.id, message: "网络异常，请重试" });
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(tag: TagRow) {
    if (busyId) return;

    const used = tag.count > 0;
    const ok = await confirm({
      title: `删除标签「${tag.name}」？`,
      description: used
        ? `这 ${tag.count} 篇文章会失去这个标签，文章本身不受影响。删掉之后这个标签的地址会变成 404，且无法恢复。`
        : "这个标签还没有被任何文章使用。删掉之后它的地址会变成 404，且无法恢复。",
      confirmText: "删除",
      cancelText: "保留",
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(tag.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        setRowError({ id: tag.id, message: await readError(res) });
        return;
      }
      if (editingId === tag.id) setEditingId(null);
      router.refresh();
    } catch {
      setRowError({ id: tag.id, message: "网络异常，请重试" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <form className="tag-form" onSubmit={onCreate}>
        <div className="field">
          <label htmlFor="tag-new-name">标签名</label>
          <input
            id="tag-new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="比如：前端工程化"
            maxLength={32}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="tag-new-slug">地址段（选填）</label>
          <input
            id="tag-new-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="留空按名称生成"
            maxLength={64}
          />
        </div>
        <button type="submit" className="btn" disabled={creating}>
          {creating ? "创建中…" : "创建"}
        </button>
      </form>
      {createError && (
        <p className="tag-error" role="alert">
          {createError}
        </p>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>地址段</th>
              <th>文章（含草稿）</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {initialTags.map((tag) => {
              const editing = editingId === tag.id;
              const busy = busyId === tag.id;
              return (
                <tr key={tag.id}>
                  <td className="cell-title">
                    {editing ? (
                      <input
                        className="tag-inline"
                        value={editName}
                        onChange={(e) => {
                          const next = e.target.value;
                          setEditName(next);
                          // 没手动改过地址段时，跟着名称走（旧地址会进 aliases）
                          if (!slugTouched) setEditSlug(previewSlug(next));
                        }}
                        aria-label="标签名"
                        maxLength={32}
                        autoFocus
                      />
                    ) : (
                      tag.name
                    )}
                  </td>
                  <td className="cell-muted">
                    {editing ? (
                      <input
                        className="tag-inline"
                        value={editSlug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setEditSlug(e.target.value);
                        }}
                        aria-label="地址段"
                        maxLength={64}
                      />
                    ) : (
                      <>
                        /tags/{tag.slug}
                        {tag.aliases.length > 0 && (
                          <span
                            className="tag-alias"
                            title={tag.aliases.map((a) => `/tags/${a}`).join("\n")}
                          >
                            另有 {tag.aliases.length} 个旧地址
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {tag.count > 0 ? (
                      tag.count
                    ) : (
                      <span className="tag-unused">未被使用</span>
                    )}
                  </td>
                  <td className="cell-muted">{tag.created}</td>
                  <td className="cell-actions">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => onSave(tag)}
                          disabled={busy}
                        >
                          {busy ? "保存中…" : "保存"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm ghost"
                          onClick={cancelEdit}
                          disabled={busy}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm ghost"
                          onClick={() => startEdit(tag)}
                          disabled={busy}
                        >
                          改名
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm danger"
                          onClick={() => onDelete(tag)}
                          disabled={busy}
                        >
                          删除
                        </button>
                      </>
                    )}
                    {rowError?.id === tag.id && (
                      <p className="tag-error" role="alert">
                        {rowError.message}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
            {initialTags.length === 0 && (
              <tr>
                <td colSpan={5} className="cell-empty">
                  还没有标签。写文章时在「标签」里填几个，或者用上面的表单建第一个。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}