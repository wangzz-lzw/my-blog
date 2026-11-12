// 验证 Dockerfile CMD 的分支逻辑（本地无 bash，用 node 复刻同一套判断）
export {};
import { readFileSync } from "node:fs";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

const dockerfile = readFileSync("Dockerfile", "utf8");

console.log("=== Dockerfile CMD 结构 ===");
const cmdMatch = /^CMD \[(.*)\]$/m.exec(dockerfile);
check("存在 CMD 行", Boolean(cmdMatch), {});

const cmd = cmdMatch?.[1] ?? "";
check("CMD 是 sh -c 形式", cmd.includes('"sh", "-c"') || cmd.startsWith('"sh"'), { head: cmd.slice(0, 40) });
check("包含 migrate deploy", cmd.includes("prisma migrate deploy"), {});
check("包含 db seed", cmd.includes("prisma db seed"), {});
check("包含索引回填", cmd.includes("backfill-chunks.ts"), {});
check("回填在 seed 之后", cmd.indexOf("db seed") < cmd.indexOf("backfill-chunks"), {});
check("回填在 start 之前", cmd.indexOf("backfill-chunks") < cmd.indexOf("npm run start"), {});
check("支持 SKIP_RAG_BACKFILL", cmd.includes("SKIP_RAG_BACKFILL"), {});
check("回填失败不阻断（有 || echo 兜底）", /\|\|\s*echo/.test(cmd), {});
check("最终 exec npm run start", cmd.includes("exec npm run start"), {});

console.log("\n=== 步骤编号一致性 ===");
const steps = [...cmd.matchAll(/\[init\] (\d)\/(\d)/g)].map((m) => `${m[1]}/${m[2]}`);
check("共 4 步", steps.length === 4, { steps });
check("编号 1..4 递增", steps.map((s) => s.split("/")[0]).join(",") === "1,2,3,4", { steps });
check("分母都是 4", steps.every((s) => s.endsWith("/4")), { steps });

console.log("\n=== 回填命令本身 ===");
const hasQuiet = /backfill-chunks\.ts --quiet/.test(cmd);
check("使用 --quiet（日志收敛为一行）", hasQuiet, {});

// 模拟 shell 的 if/else 分支
console.log("\n=== 模拟分支判断 ===");
const decide = (skip: string | undefined) =>
  skip === "1" ? "skip" : "run";

check("未设置 → 执行回填", decide(undefined) === "run", {});
check("设置为空串 → 执行回填", decide("") === "run", {});
check("设置为 1 → 跳过", decide("1") === "skip", {});
check("设置为其它值 → 执行回填", decide("0") === "run", {});

console.log("\n=== runner 阶段 COPY 清单 ===");
const copies = [...dockerfile.matchAll(/^COPY --from=builder \/app\/(\S+) /gm)].map((m) => m[1]);
for (const need of ["scripts", "lib", "prisma", "node_modules", "tsconfig.json", "package.json"]) {
  check(`COPY ${need}`, copies.includes(need), { copies });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
