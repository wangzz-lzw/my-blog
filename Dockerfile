# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- 依赖层 ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 构建层 ----------
# next build 会对 ISR 页面做预渲染并查询数据库，因此构建阶段内置一个临时 PostgreSQL，
# 建库 -> 迁移 -> 生成 client -> 构建 -> 关闭，全程不依赖外部数据库。
FROM base AS builder
RUN apk add --no-cache postgresql postgresql-client && \
    (getent passwd postgres >/dev/null || adduser -D -s /bin/sh postgres)
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 兼容旧仓库没有 public/ 目录的情况（Docker COPY 对缺失目录会报错）
RUN mkdir -p /app/public
RUN mkdir -p /tmp/pgdata && chown -R postgres:postgres /tmp/pgdata && \
    su postgres -s /bin/sh -c "initdb -D /tmp/pgdata -A trust -U postgres" && \
    su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata -o '-p 5433 -k /tmp' -w start" && \
    su postgres -s /bin/sh -c "createdb -p 5433 -h localhost -U postgres blog" && \
    DATABASE_URL='postgresql://postgres@localhost:5433/blog?schema=public' npx prisma migrate deploy && \
    DATABASE_URL='postgresql://postgres@localhost:5433/blog?schema=public' npx prisma generate && \
    DATABASE_URL='postgresql://postgres@localhost:5433/blog?schema=public' npm run build && \
    su postgres -s /bin/sh -c "pg_ctl -D /tmp/pgdata stop"

# ---------- 运行层 ----------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# 回填脚本与它依赖的 lib/：启动时要用 `npx tsx scripts/backfill-chunks.ts` 建检索索引。
# 缺了 lib/ 会直接 MODULE_NOT_FOUND —— 而那条命令在 CMD 里被 `|| echo` 兜住，
# 表现成「服务起来了但问答永远答不出」，比崩溃更难查，所以这两个目录必须一起拷。
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
EXPOSE 3000
# 启动前连接 compose 里的 db 服务执行迁移与种子，再启动应用。
# 每一步都打印日志：初始化失败时能立刻在 `docker compose logs app` 看到是哪一步、
# 而不是默默起不来。exec 让 npm 成为 1 号进程，保证 docker stop 能优雅退出。
CMD ["sh", "-c", "set -e; echo '[init] 1/4 migrate deploy…'; npx prisma migrate deploy; echo '[init] 2/4 seed（同步管理员/示例文章）…'; npx prisma db seed; echo '[init] 3/4 回填检索索引…'; if [ \"$SKIP_RAG_BACKFILL\" = \"1\" ]; then echo '[init] 已按 SKIP_RAG_BACKFILL=1 跳过索引回填'; else npx tsx scripts/backfill-chunks.ts --quiet || echo '[init] ⚠️ 索引回填失败，问答会答不出内容（站点其余功能不受影响）'; fi; echo '[init] 4/4 启动 Next.js…'; exec npm run start"]
