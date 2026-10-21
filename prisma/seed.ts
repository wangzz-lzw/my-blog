import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim() || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD?.trim() || "Change_Me_12345";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, name: "Admin", passwordHash },
    });
    console.log(`Created admin user: ${email}`);
  } else {
    console.log(`Admin user already exists: ${email}`);
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
