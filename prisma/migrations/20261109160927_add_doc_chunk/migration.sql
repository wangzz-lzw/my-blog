-- 站内问答的文档块表（见 openspec: add-ai-qa）
--
-- 这张表要同时服务两种检索：
--   * 全文检索（本地基线）：text + 后面单独加的 GIN 索引
--   * 向量检索（生产可选）：embedding 列，需要 pgvector 扩展
--
-- 关键约束：**本地 Windows 的 PG 18 装不上 pgvector**（扩展文件不存在、无 C 编译器），
-- 所以直接写 `CREATE EXTENSION vector` 会让这条迁移在本地整体失败，开发流程卡死。
-- 做法：把扩展创建与向量列都包在 DO 块里，失败就跳过——本地得到一张没有 embedding 列的表，
-- 生产（pgvector/pgvector:pg16 镜像）得到完整表。Prisma 把 embedding 声明为 Unsupported，
-- 因此两种形态它都能生成客户端。

-- 1) 尝试启用 pgvector；不可用则跳过，不阻断迁移
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pgvector 不可用，跳过向量列（将使用全文检索）';
END
$$;

-- 2) 建表（不含 embedding 列：是否加由下一步决定）
CREATE TABLE "DocChunk" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "postTitle" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "heading" TEXT,
    "text" TEXT NOT NULL,
    "chars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocChunk_pkey" PRIMARY KEY ("id")
);

-- 3) 只有在扩展真的装上了才加 embedding 列
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        ALTER TABLE "DocChunk" ADD COLUMN "embedding" vector(1024);
        RAISE NOTICE 'pgvector 可用，已添加 embedding 列（1024 维）';
    ELSE
        RAISE NOTICE '未添加 embedding 列：全文检索模式下不需要它';
    END IF;
END
$$;

-- 4) 索引
CREATE INDEX "DocChunk_postId_idx" ON "DocChunk"("postId");
CREATE INDEX "DocChunk_slug_idx" ON "DocChunk"("slug");
CREATE UNIQUE INDEX "DocChunk_postId_order_key" ON "DocChunk"("postId", "order");

-- 5) 全文检索用的 GIN 索引（pg_trgm 用于中文子串召回，是基线的一部分）
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pg_trgm 不可用，trigram 召回将退化为 ILIKE';
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX "DocChunk_text_trgm_idx" ON "DocChunk" USING GIN ("text" gin_trgm_ops);
    END IF;
END
$$;
