import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim() || "admin";
  const password = process.env.ADMIN_PASSWORD?.trim() || "wzz43441630";
  const legacyEmail = "admin@example.com";

  // 删除旧的默认管理员账号（旧的 seed 用邮箱 admin@example.com 创建；
  // 新 admin 用用户名登录、邮箱为空，按邮箱删除是安全的）
  const legacy = await prisma.user.deleteMany({
    where: { email: legacyEmail },
  });
  if (legacy.count > 0) {
    console.log(`Deleted legacy admin: ${legacyEmail} (${legacy.count})`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({ where: { username } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: "ADMIN", name: username },
    });
    console.log(`Updated admin user: ${username}`);
  } else {
    await prisma.user.create({
      data: {
        username,
        name: username,
        passwordHash,
        role: "ADMIN",
      },
    });
    console.log(`Created admin user: ${username}`);
  }

  const demoCount = await prisma.post.count();
  if (demoCount === 0) {
    await prisma.post.create({
      data: {
        title: "欢迎来到我的博客",
        slug: "welcome",
        excerpt: "这是一篇示例文章，展示 Markdown 渲染效果。",
        content: [
          "# 欢迎",
          "",
          "这是一篇**示例**文章，支持 `行内代码`、引用、列表、表格等语法。",
          "",
          "> 这是一段引用。",
          "",
          "- 第一点",
          "- 第二点",
          "- 第三点",
          "",
          "```ts",
          "const hello = (name: string) => `Hello, ${name}!`;",
          "```",
          "",
          "| 语言 | 类型 |",
          "| --- | --- |",
          "| TypeScript | 强类型 |",
          "| JavaScript | 弱类型 |",
        ].join("\n"),
        published: true,
        publishedAt: new Date(),
        tags: {
          connectOrCreate: [
            {
              where: { slug: "intro" },
              create: { name: "介绍", slug: "intro" },
            },
          ],
        },
      },
    });
    console.log("Created demo post");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
