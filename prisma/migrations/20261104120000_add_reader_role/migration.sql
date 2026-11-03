-- 新增 READER 角色（独立迁移：PostgreSQL 不允许在同一事务中使用刚新增的枚举值）
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'READER';
