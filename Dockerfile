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
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
EXPOSE 3000
# 启动前连接 compose 里的 db 服务执行迁移与种子，再启动应用
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run start"]
