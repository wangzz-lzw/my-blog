// 任务 3.4：索引失败不得阻断文章保存，且必须留下带 postId 的日志
export {};
import { prisma } from "../lib/prisma";
import { syncPostIndexSafe } from "../lib/rag/index";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

async function main() {
  // 捕获 console.error 输出
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };

  try {
    /* ---------- 1) 传入不存在的 postId → reindexPost 抛错 → 被 safe 包装吞掉并记日志 ---------- */
    console.log("=== syncPostIndexSafe 对异常的处理 ===");
    const fakeId = "post-id-that-does-not-exist";
    let threw = false;
    try {
      await syncPostIndexSafe(fakeId, { published: true });
    } catch {
      threw = true;
    }
    check("不向调用方抛错（文章保存不会被连带失败）", !threw, { threw });
    check("留下了日志", logged.length > 0, { count: logged.length });
    check("日志含 [rag] 标记", logged.some((l) => l.includes("[rag]")), { logged: logged.slice(0, 2) });
    check(
      "日志含 postId（可定位是哪篇文章）",
      logged.some((l) => l.includes(fakeId)),
      { logged: logged.slice(0, 2) }
    );
    console.log("  实际日志:", logged[0]?.slice(0, 200) ?? "(空)");

    /* ---------- 2) 草稿分支同样安全 ---------- */
    console.log("\n=== 草稿分支 ===");
    logged.length = 0;
    let threw2 = false;
    try {
      await syncPostIndexSafe(fakeId, { published: false });
    } catch {
      threw2 = true;
    }
    // 草稿走 removePostIndex（deleteMany 对不存在的 postId 不报错），所以不该有日志
    check("草稿分支不抛错", !threw2, { threw2 });

    /* ---------- 3) 正常路径确实建了索引（对照）---------- */
    console.log("\n=== 正常路径对照 ===");
    const post = await prisma.post.create({
      data: {
        title: "索引同步验证",
        slug: "__sync-test__",
        content: "## 小节\n\n这是一段用于验证索引同步的正文内容。",
        published: true,
        publishedAt: new Date(),
      },
    });
    logged.length = 0;
    await syncPostIndexSafe(post.id, { published: true });
    const n = await prisma.docChunk.count({ where: { postId: post.id } });
    check("已发布文章被建块", n > 0, { chunks: n });
    check("正常路径无错误日志", logged.length === 0, { logged });
    check(
      "块内容正确",
      (await prisma.docChunk.findFirst({ where: { postId: post.id } }))?.text.includes("验证索引同步") ??
        false,
      {}
    );

    await prisma.post.delete({ where: { id: post.id } });
  } finally {
    console.error = origError;
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
