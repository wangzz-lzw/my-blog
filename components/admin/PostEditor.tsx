"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { slugify } from "@/lib/slug";
import {
  mergeImport,
  parseMarkdownDocument,
  type ImportStrategy,
  type ParsedMarkdown,
} from "@/lib/markdown-import";
import { Markdown } from "@/components/Markdown";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { PlainScrollbar } from "@/components/ui/PlainScrollbar";
import { useEditorScrollSync } from "@/components/admin/useEditorScrollSync";
import { ImagePicker } from "@/components/admin/ImagePicker";
import {
  planLocalization,
  rewriteRefs,
  basename,
  type LocalRef,
} from "@/lib/asset-localize";

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

/** 全屏：off=普通；native=浏览器原生全屏；immersive=站内铺满（原生不可用时的回退） */
type FullscreenMode = "off" | "native" | "immersive";

/** 导入 Markdown 的大小上限：纯文本，1MB 远超一篇长文 */
const MAX_MD_SIZE = 1024 * 1024;

/** 图片上传的并发上限：太少会让多图导入很慢，太多会同时压满连接数 */
const UPLOAD_CONCURRENCY = 4;

/**
 * 一批待导入的东西：一份文档 + 它引用的图片。
 * 图片顺序就是用户选择的顺序，同名时取先出现的那个（见 lib/asset-localize 的 D1）。
 */
type ImportBundle = {
  parsed: ParsedMarkdown;
  /** 本地图片引用 → 可用文件 的匹配结果，用于确认条摘要 */
  plan: ReturnType<typeof planLocalization>;
  files: File[];
};

/**
 * 把一组文件拆成「文档」与「图片」。
 *
 * 文档取第一个（多选时如果误选了两份 md，按第一个算，不猜用户想要哪份）。
 * 图片按 MIME 判断；同时兼容扩展名，因为有些系统对 .webp 给的 type 是空串。
 */
function splitImportFiles(list: File[]): { doc: File | null; images: File[] } {
  const isImage = (f: File) =>
    f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
  const isDoc = (f: File) =>
    /\.(md|markdown|txt)$/i.test(f.name) || /^text\/(markdown|plain)$/i.test(f.type);

  const doc = list.find(isDoc) ?? null;
  const images = list.filter((f) => isImage(f) && f !== doc);
  return { doc, images };
}

/** 有上限的并发映射：保持结果顺序，单次失败不影响其余 */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await task(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 逗号分隔的标签串 → 数组（与 POST /api/posts 的切分口径一致：只认英文逗号） */
function splitTagInput(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 勾选/取消一个已有标签，回写成逗号串；其余标签顺序不变 */
function toggleTagIn(value: string, name: string, on: boolean): string {
  const list = splitTagInput(value);
  const exists = list.includes(name);
  if (on && !exists) list.push(name);
  if (!on && exists) return list.filter((t) => t !== name).join(", ");
  return list.join(", ");
}

export function PostEditor({
  post,
  knownTags = [],
}: {
  post?: EditorPost;
  /** 站上已有的标签名：只用来做输入候选，写新标签照样允许 */
  knownTags?: string[];
}) {
  const router = useRouter();
  const isEdit = Boolean(post);
  const rootRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const mdFileRef = useRef<HTMLInputElement | null>(null);

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
  const [fsMode, setFsMode] = useState<FullscreenMode>("off");
  /** 分屏时两侧滚动是否联动（见 openspec: editor-scroll-sync） */
  const [syncScroll, setSyncScroll] = useState(true);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  /** 封面选择器（从图床挑已有图片）是否打开 */
  const [pickerOpen, setPickerOpen] = useState(false);
  // 已解析待确认的导入（编辑器里有内容、或带图片时先问，不直接覆盖）
  const [pendingImportBundle, setPendingImportBundle] = useState<ImportBundle | null>(null);
  /** 导入时的图片上传是否进行中（与粘贴/拖入的 imageBusy 分开：两者不会同时发生） */
  const [importBusy, setImportBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [hint, setHint] = useState("");
  const { alert: notify } = useFeedback();

  // 编辑器里的三类提示统一走全站弹窗；拿到值就清空，避免重复弹出
  useEffect(() => {
    if (!error) return;
    setError("");
    void notify({ title: "操作失败", description: error });
  }, [error, notify]);

  useEffect(() => {
    if (!aiMsg) return;
    setAiMsg("");
    void notify({ title: "AI 摘要", description: aiMsg });
  }, [aiMsg, notify]);

  useEffect(() => {
    if (!hint) return;
    setHint("");
    void notify({ title: "提示", description: hint });
  }, [hint, notify]);

  // 窄屏默认只显示编辑区，避免两栏挤在一起
  useEffect(() => {
    if (window.innerWidth < 900) setMode("write");
  }, []);

  /* ---------- 分屏滚动联动 ---------- */

  useEditorScrollSync({
    writeRef: textareaRef,
    previewRef: previewScrollRef,
    content,
    // 单栏视图里另一侧不可见：不挂监听，避免空转
    active: mode === "split",
    enabled: syncScroll,
  });

  // 自绘滚动条只能在挂载后接管：无 JS 时必须留着原生条，否则编辑区没有任何滚动条
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) ta.dataset.synced = "1";
  }, []);

  /* ---------- 全屏写作 ---------- */

  const enterFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenEnabled && typeof el.requestFullscreen === "function") {
      try {
        await el.requestFullscreen();
        setFsMode("native");
        return;
      } catch {
        // 被浏览器拒绝（非用户手势、策略禁止等）→ 退回站内铺满
      }
    }
    setFsMode("immersive");
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // 已经不在全屏态，忽略
      }
    }
    setFsMode("off");
  }, []);

  // 原生全屏以 fullscreenchange 为准：用户用系统 Esc / 浏览器 UI 退出时同步界面
  useEffect(() => {
    if (fsMode !== "native") return;
    const onChange = () => {
      if (!document.fullscreenElement) setFsMode("off");
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fsMode]);

  // 站内回退：自己接管 Esc，并锁住页面滚动
  useEffect(() => {
    if (fsMode !== "immersive") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFsMode("off");
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("editor-fs-lock");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("editor-fs-lock");
    };
  }, [fsMode]);

  // 卸载（保存成功跳转等）时别把浏览器留在全屏壳层里
  useEffect(() => {
    const el = rootRef.current;
    return () => {
      document.body.classList.remove("editor-fs-lock");
      if (document.fullscreenElement === el) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // 退出全屏后把焦点交还正文
  const prevFs = useRef<FullscreenMode>("off");
  useEffect(() => {
    if (prevFs.current !== "off" && fsMode === "off") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    prevFs.current = fsMode;
  }, [fsMode]);

  const isFullscreen = fsMode !== "off";

  /* ---------- 编辑动作 ---------- */

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

  /* ---------- 导入 Markdown 文件 ---------- */

  /**
   * 把一批导入结果落到编辑器（替换或追加）。
   *
   * 传入的 `content` 是**已经本地化过**的正文——上传发生在确认之后，见 localizeAndApply。
   * 这个函数只负责写入，因此保持同步、原子（一次 setState 批次）。
   */
  function applyImportWithContent(
    parsed: ParsedMarkdown,
    strategy: ImportStrategy,
    content: string,
    note: string
  ) {
    const next = mergeImport(
      { title, slug, excerpt, content, tags },
      { ...parsed, body: content },
      strategy,
      { isEdit }
    );
    setTitle(next.title);
    setSlug(next.slug);
    setExcerpt(next.excerpt);
    setContent(next.content);
    setTags(next.tags);
    setError("");
    setPendingImportBundle(null);
    setHint(note);
    const caret = strategy === "append" ? next.content.length : 0;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  /** 没有图片要处理时的快捷路径：直接按解析结果写入 */
  function applyImport(parsed: ParsedMarkdown, strategy: ImportStrategy) {
    applyImportWithContent(parsed, strategy, parsed.body, "");
  }

  /**
   * 上传匹配到的图片，改写正文里的引用，然后写入编辑器。
   *
   * 顺序是刻意的（design D3/D4）：**用户点了替换/追加之后**才开始上传——
   * 上传是不可撤销的副作用，选「取消」不该在 OSS 里留下对象。
   * 图片全部处理完才一次性写入正文，避免半截状态。
   */
  async function localizeAndApply(bundle: ImportBundle, strategy: ImportStrategy) {
    const { parsed, plan, files } = bundle;
    setPendingImportBundle(null);
    setError("");

    // 没有可匹配的图片：等价于"只导入文档"，本地引用原样保留
    if (plan.matched.length === 0) {
      const note =
        plan.missing.length > 0
          ? `正文里有 ${plan.missing.length} 处本地图片没能匹配到文件，已原样保留`
          : "";
      applyImportWithContent(parsed, strategy, parsed.body, note);
      return;
    }

    setImportBusy(true);
    try {
      // 只上传被正文真正引用的图片：多选时用户可能连带选了没引用的图
      const wanted = new Map<string, LocalRef>();
      for (const ref of plan.matched) wanted.set(basename(ref.target), ref);
      const targets = [...wanted.entries()];

      let done = 0;
      setHint(`正在上传 0/${targets.length}…`);

      const results = await mapWithLimit(targets, UPLOAD_CONCURRENCY, async ([name]) => {
        const file = files.find((f) => f.name === name);
        if (!file) return { name, url: "", error: "文件缺失" };
        try {
          const url = await uploadImageToOss(file);
          return { name, url, error: "" };
        } catch (e) {
          return { name, url: "", error: e instanceof Error ? e.message : "上传失败" };
        } finally {
          done += 1;
          setHint(`正在上传 ${done}/${targets.length}…`);
        }
      });

      const mapping = new Map<string, string>();
      const failed: string[] = [];
      for (const r of results) {
        if (r.url) mapping.set(r.name, r.url);
        else failed.push(r.name);
      }

      const rewritten = rewriteRefs(parsed.body, mapping);

      // 结果提示：成功多少、还剩多少没处理
      const parts: string[] = [];
      if (rewritten.replaced > 0) parts.push(`已上传并替换 ${rewritten.replaced} 张图片`);
      if (failed.length > 0) parts.push(`${failed.length} 张上传失败`);
      if (rewritten.unmatched.length > 0) {
        parts.push(`${rewritten.unmatched.length} 处引用未能匹配到文件（已原样保留）`);
      }
      if (plan.duplicates.length > 0) {
        parts.push(`有 ${plan.duplicates.length} 个同名文件，取用了第一个`);
      }

      applyImportWithContent(parsed, strategy, rewritten.content, parts.join("；"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
      setPendingImportBundle(null);
    } finally {
      setImportBusy(false);
      setHint("");
    }
  }

  /**
   * 导入的共用入口：文件选择器与拖入都走这里。
   *
   * 拆出这层是因为拖入与选择器拿到的都是「一堆 File」，区别只在来源；
   * 匹配规则用文件名，所以两条路径不需要分支（design D6）。
   */
  async function importFromFiles(list: File[]) {
    if (!list.length) return;
    setError("");

    const { doc, images } = splitImportFiles(list);
    if (!doc) {
      setError("这批文件里没有找到 .md / .markdown / .txt 文档");
      return;
    }
    if (doc.size > MAX_MD_SIZE) {
      setError("文档超过 1MB，请拆分后再导入");
      return;
    }

    // 读取 + 解析都发生在 setState 之前：任何一步失败都只报错，编辑器保持原样
    let parsed: ParsedMarkdown | null = null;
    try {
      parsed = parseMarkdownDocument(await doc.text());
    } catch {
      setError("读取文件失败，请重新选择");
      return;
    }
    if (!parsed) {
      setError("这个文件里没有可导入的内容");
      return;
    }

    // 摘要在上传之前就能算出来：只需要文档里的引用 + 已选文件的文件名
    const plan = planLocalization(parsed.body, images);
    const bundle: ImportBundle = { parsed, plan, files: images };

    const hasContent = [title, content, excerpt, tags].some((v) => v.trim() !== "");
    if (hasContent || plan.matched.length > 0) {
      setPendingImportBundle(bundle);
      return;
    }
    await localizeAndApply(bundle, "replace");
  }

  async function onMarkdownFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    // 先清空 value：同一个文件再次选择时也要能触发 change
    e.target.value = "";
    await importFromFiles(list);
  }

  /** 图片先传到阿里云 OSS（复用 /api/upload，内容寻址去重），再把 Markdown 语法插进正文 */
  async function uploadImageToOss(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "image");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "图片上传失败");
    if (typeof data.url !== "string" || !data.url) {
      throw new Error("图片上传成功但没有拿到地址");
    }
    return data.url;
  }

  /** 粘贴 / 拖入 / 选择文件三条入口共用 */
  async function handleImageFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!files.length) return;
    setError("");
    setHint("");
    setImageBusy(true);
    try {
      const snippets: string[] = [];
      for (const file of files) {
        const url = await uploadImageToOss(file);
        const alt = file.name.replace(/\.[^.]+$/, "") || "图片";
        snippets.push(`![${alt}](${url})`);
      }
      insertBlock(snippets.join("\n\n") + "\n");
      setHint(`已上传 ${files.length} 张图片并插入正文`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片上传失败");
    } finally {
      setImageBusy(false);
    }
  }

  /** 粘贴截图：剪贴板里有图片就拦截，走上传 */
  function onEditorPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files;
    if (
      files &&
      files.length > 0 &&
      Array.from(files).some((f) => f.type.startsWith("image/"))
    ) {
      e.preventDefault();
      void handleImageFiles(files);
    }
  }

  function onEditorDragOver(e: React.DragEvent<HTMLFormElement>) {
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
      e.preventDefault();
    }
  }

  function onEditorDrop(e: React.DragEvent<HTMLFormElement>) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    // 拖进来的东西里带文档 → 走导入流程（可连同图片一起本地化）
    const { doc } = splitImportFiles(list);
    if (doc) {
      e.preventDefault();
      void importFromFiles(list);
      return;
    }

    // 只有图片 → 老规矩：上传后插到光标处
    if (!list.some((f) => f.type.startsWith("image/"))) return;
    e.preventDefault();
    void handleImageFiles(list);
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
    <form
      ref={rootRef}
      className={`editor${isFullscreen ? " is-fullscreen" : ""}${
        fsMode === "immersive" ? " is-immersive" : ""
      }`}
      onSubmit={handleSubmit}
      onDragOver={onEditorDragOver}
      onDrop={onEditorDrop}
    >
      <div className="editor-head">
        <h1>{isEdit ? "编辑文章" : "写文章"}</h1>
        <div className="editor-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={enterFullscreen}
            aria-pressed={isFullscreen}
            aria-label="进入全屏写作"
            title="全屏写作（Esc 退出）"
          >
            <span aria-hidden="true">⛶</span> 全屏写作
          </button>
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

      {pendingImportBundle && (
        <div
          className="editor-import-bar"
          role="alertdialog"
          aria-label="导入方式"
          onKeyDown={(e) => {
            if (e.key === "Escape") setPendingImportBundle(null);
          }}
        >
          <div className="editor-import-info">
            <p>
              编辑器里已经有内容。用这份文件替换正文，还是追加到正文末尾？
            </p>
            {/* 资源摘要：上传前就能算出来，让用户在覆盖正文之前知道要发生什么 */}
            {(pendingImportBundle.plan.matched.length > 0 ||
              pendingImportBundle.plan.missing.length > 0) && (
              <p className="editor-import-assets">
                {pendingImportBundle.plan.matched.length > 0 && (
                  <span>
                    将上传 {pendingImportBundle.plan.matched.length} 张图片并替换引用
                  </span>
                )}
                {pendingImportBundle.plan.missing.length > 0 && (
                  <span className="is-missing">
                    {pendingImportBundle.plan.missing.length} 处引用找不到对应文件，会原样保留
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="editor-import-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={importBusy}
              onClick={() => void localizeAndApply(pendingImportBundle, "replace")}
            >
              替换
            </button>
            <button
              type="button"
              className="btn btn-sm ghost"
              disabled={importBusy}
              onClick={() => void localizeAndApply(pendingImportBundle, "append")}
            >
              追加到末尾
            </button>
            <button
              type="button"
              className="btn btn-sm ghost"
              autoFocus
              disabled={importBusy}
              onClick={() => setPendingImportBundle(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

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
          <div className="tag-field-head">
            <label htmlFor="tag-picker-trigger">标签</label>
            <Link href="/admin/tags" className="tag-manage-link">
              管理标签 →
            </Link>
          </div>
          <div className="tag-field">
            {/* 标签是受控词表：只能从已有标签里挑，现场不造新词
                （要新建去「管理标签」，否则迟早长出一堆 typo 标签） */}
            <div className="tag-chips">
              {splitTagInput(tags).length === 0 ? (
                <span className="tag-chips-empty">还没选，从右边挑</span>
              ) : (
                splitTagInput(tags).map((name) => (
                  <span className="tag-chip" key={name}>
                    {name}
                    <button
                      type="button"
                      className="tag-chip-remove"
                      onClick={() => setTags((value) => toggleTagIn(value, name, false))}
                      aria-label={`移除标签 ${name}`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                id="tag-picker-trigger"
                className="btn btn-sm ghost tag-picker-trigger"
                aria-label="从已有标签中选择"
              >
                已有标签
                <span className="tag-picker-caret" aria-hidden="true">
                  ▾
                </span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="user-menu tag-picker-menu"
                  align="end"
                  sideOffset={6}
                >
                  <div className="tag-picker-head">点一下加入，再点一下移除</div>
                  {knownTags.length === 0 ? (
                    <DropdownMenu.Item className="user-menu-item" disabled>
                      还没有标签，先去「管理标签」建一个
                    </DropdownMenu.Item>
                  ) : (
                    knownTags.map((name) => (
                      <DropdownMenu.CheckboxItem
                        key={name}
                        className="user-menu-item tag-picker-item"
                        checked={splitTagInput(tags).includes(name)}
                        onCheckedChange={(on) =>
                          setTags((value) => toggleTagIn(value, name, on))
                        }
                        // 多选时不关菜单：勾完一个接着勾下一个
                        onSelect={(e) => e.preventDefault()}
                      >
                        {name}
                      </DropdownMenu.CheckboxItem>
                    ))
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
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
            {/* 从图床挑一张已有图片（见 openspec: image-library） */}
            <button
              type="button"
              className="btn btn-sm ghost"
              onClick={() => setPickerOpen(true)}
            >
              从图床选
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

      {/* 工具栏独立于两个面板之上：切到「预览」时也仍然在，随时能切回来 */}
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
          <button type="button" title="代码块" onClick={() => insertBlock("```ts\n\n```")}>
            {"```"}
          </button>
          <button type="button" title="引用" onClick={() => prefixLine("> ")}>
            &gt;
          </button>
          <button type="button" title="列表" onClick={() => prefixLine("- ")}>
            ·
          </button>
        </div>

        <div className="editor-toolbar-right">
          {/* 没有独立的「插入图片」按钮：图片靠粘贴 / 拖入正文进入，
              与在正文里直接书写图片引用是同一条路径（见 openspec: localize-import-assets） */}
          <button
            type="button"
            className="btn btn-sm ghost"
            onClick={() => mdFileRef.current?.click()}
            disabled={importBusy}
            aria-label="导入 Markdown 文件"
            title="导入 .md / .markdown / .txt（≤1MB）——可以同时把文档引用的图片一起选上，图片会自动上传并替换引用"
          >
            {importBusy ? "处理中…" : "导入 md"}
          </button>
          <input
            ref={mdFileRef}
            type="file"
            // 多选：文档 + 它引用的图片一次选完；图片会自动上传并替换正文里的引用
            accept=".md,.markdown,.txt,text/markdown,text/plain,image/*"
            multiple
            hidden
            onChange={onMarkdownFile}
          />
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
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "active" : ""}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "split" && (
            <button
              type="button"
              role="switch"
              aria-checked={syncScroll}
              className={`btn btn-sm ghost editor-sync-toggle${
                syncScroll ? " active" : ""
              }`}
              onClick={() => setSyncScroll((v) => !v)}
              aria-label="滚动联动"
              title={
                syncScroll
                  ? "滚动联动：开（两侧跟着一起滚，点一下关掉）"
                  : "滚动联动：关（两侧各自独立滚动，点一下打开）"
              }
            >
              <span aria-hidden="true">{syncScroll ? "⇅" : "⇵"}</span> 滚动联动
            </button>
          )}
          {isFullscreen && (
            <button
              type="button"
              className="btn btn-sm ghost editor-fs-exit"
              onClick={exitFullscreen}
              aria-pressed={true}
              aria-label="退出全屏"
              title="退出全屏（Esc）"
            >
              <span aria-hidden="true">⤡</span> 退出全屏
            </button>
          )}
        </div>
      </div>

      <div className={`editor-split mode-${mode}`}>
        <section className="editor-write">
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={onEditorPaste}
            placeholder="在此书写 Markdown 正文…（截图可直接粘贴，图片会自动上传到 OSS）"
            required
            spellCheck={false}
          />
          {/* 原生条由 [data-synced] 藏掉，换成与预览区同一套自绘轨道 */}
          <PlainScrollbar
            targetRef={textareaRef}
            label="编辑区滚动位置"
            className="editor-write-bar"
            version={content}
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
          <ScrollArea
            hostRef={previewScrollRef}
            axis="y"
            className="preview-scroll"
            contentClassName="preview-body"
          >
            {preview}
          </ScrollArea>
        </section>
      </div>

      <ImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(img) => setCover(`/img/${img.key.replace(/^img\//, "")}`)}
      />
    </form>
  );
}