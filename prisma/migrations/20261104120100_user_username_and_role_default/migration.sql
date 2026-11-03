-- 用户支持用户名登录、邮箱可选；新注册用户默认 READER
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'READER';
