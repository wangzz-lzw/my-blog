-- ============================================================
-- my-blog 线上数据库初始化 SQL（在 Vercel Prisma Postgres 控制台执行）
-- 作用：建表 + 创建管理员 + 一条示例文章
-- 管理员：admin@example.com / Change_Me_12345（登录后请修改）
-- ============================================================

-- 1. 建表（与 prisma migrate 等价）
CREATE TYPE "Role" AS ENUM ('ADMIN');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "cover" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "email" TEXT,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_PostToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PostToTag_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE INDEX "Post_published_publishedAt_idx" ON "Post"("published", "publishedAt");
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");
CREATE INDEX "Comment_postId_approved_idx" ON "Comment"("postId", "approved");
CREATE INDEX "_PostToTag_B_index" ON "_PostToTag"("B");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. 创建管理员（幂等：已存在则跳过）
INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "createdAt", "updatedAt")
VALUES ('cm_admin_0000001', 'admin@example.com', 'Admin', '$2b$10$QywDdMmNSLfSF6ytq9a5oOgqtODItUGN6MmRCdFK7BSZtRH.DbCSe', 'ADMIN', NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;

-- 3. 示例文章 + 标签（幂等）
INSERT INTO "Post" ("id", "title", "slug", "excerpt", "content", "published", "publishedAt", "createdAt", "updatedAt")
VALUES (
    'cm_post_welcome_0001',
    '欢迎来到我的博客',
    'welcome',
    '这是一篇示例文章，展示 Markdown 渲染效果。',
    E'# 欢迎\n\n这是一篇**示例**文章，支持行内代码、引用、列表、表格等语法。\n\n> 这是一段引用。\n\n- 第一点\n- 第二点\n- 第三点',
    true,
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Tag" ("id", "name", "slug")
VALUES ('cm_tag_intro_0001', '介绍', 'intro')
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "_PostToTag" ("A", "B")
SELECT 'cm_post_welcome_0001', 'cm_tag_intro_0001'
WHERE NOT EXISTS (
    SELECT 1 FROM "_PostToTag" WHERE "A" = 'cm_post_welcome_0001' AND "B" = 'cm_tag_intro_0001'
);
