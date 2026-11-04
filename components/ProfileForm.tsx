"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ProfileUser = {
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: "ADMIN" | "READER";
  joinedAt: string;
};

function initialOf(user: ProfileUser) {
  return (user.name?.trim() || user.username || user.email || "U")
    .charAt(0)
    .toUpperCase();
}

/** 客户端压缩：居中裁切为 256×256 的 JPEG（上传前减小体积） */
async function fileToSquareJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("图片不能超过 5MB");
  }
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持图片处理");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片处理失败"))),
      "image/jpeg",
      0.85
    );
  });
}

/** 上传头像到阿里云 OSS，返回公开 URL（deduped=服务端命中同内容图片） */
async function uploadAvatar(
  file: File
): Promise<{ url: string; deduped: boolean }> {
  const blob = await fileToSquareJpeg(file);
  const fd = new FormData();
  fd.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
  fd.append("kind", "avatar");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "上传失败");
  }
  if (typeof data.url !== "string" || !data.url) {
    throw new Error("上传返回地址无效");
  }
  return { url: data.url, deduped: Boolean(data.deduped) };
}

export function ProfileForm({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");

  async function patchProfile(payload: {
    name?: string;
    email?: string;
    avatar?: string;
  }) {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "保存失败");
    }
    window.dispatchEvent(new Event("profile:updated"));
    router.refresh();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaveErr("");
    setSaveMsg("");
    setUploadBusy(true);
    try {
      const { url, deduped } = await uploadAvatar(file);
      setAvatar(url);
      // 上传后直接保存，少一步点击（也避免手工编辑出非法 URL）
      await patchProfile({ name, email, avatar: url });
      setSaveMsg(deduped ? "该图片已存在，直接复用（未重复上传）" : "头像已上传并保存");
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "图片上传失败");
    } finally {
      setUploadBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveErr("");
    setSaveMsg("");
    try {
      await patchProfile({ name, email, avatar });
      setSaveMsg("已保存");
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdErr("");
    setPwdMsg("");
    if (newPassword !== confirmPassword) {
      setPwdErr("两次输入的新密码不一致");
      return;
    }
    setPwdBusy(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwdErr(data.error ?? "修改失败");
        return;
      }
      setPwdMsg("密码已更新");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPwdErr("网络错误，修改失败");
    } finally {
      setPwdBusy(false);
    }
  }

  const isDataUrl = avatar.startsWith("data:");

  return (
    <div className="shell page">
      <header className="page-head" data-reveal>
        <p className="sysline">
          &gt; PROFILE.SYS 个人资料
          <span className="cursor">▌</span>
        </p>
        <h1 className="page-title">个人资料</h1>
        <p className="page-sub">管理头像、昵称与登录密码。</p>
      </header>

      <div className="profile-grid">
        {/* 头像 */}
        <section className="profile-card">
          <h2>头像</h2>
          <div className="avatar-editor">
            <div className="avatar-preview">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="头像预览" />
              ) : (
                <span>{initialOf(user)}</span>
              )}
            </div>
            <div className="avatar-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadBusy}
              >
                {uploadBusy ? "上传中…" : "上传图片"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onPickFile}
              />
              <button
                type="button"
                className="btn btn-sm ghost"
                onClick={() => setAvatar("")}
                disabled={!avatar}
              >
                移除
              </button>
            </div>
          </div>
          <div className="field">
            <label>或使用图片链接</label>
            <input
              value={isDataUrl ? "" : avatar}
              placeholder="https://… （留空则用首字母头像）"
              onChange={(e) => setAvatar(e.target.value.trim())}
              maxLength={500}
            />
            <span className="field-hint">
              上传图片会存到阿里云 OSS 并自动裁成 256×256；链接需可公开访问。
            </span>
          </div>
        </section>

        {/* 基本资料 */}
        <section className="profile-card">
          <h2>基本资料</h2>
          <form className="profile-form" onSubmit={saveProfile}>
            <div className="field">
              <label>昵称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={user.username}
                maxLength={30}
              />
            </div>
            <div className="field">
              <label>邮箱（选填）</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            {saveErr && <p className="notice error">{saveErr}</p>}
            {saveMsg && <p className="notice info">{saveMsg}</p>}

            <div className="profile-actions">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "保存中…" : "保存修改"}
              </button>
            </div>
          </form>
        </section>

        {/* 修改密码 */}
        <section className="profile-card">
          <h2>修改密码</h2>
          <form className="profile-form" onSubmit={changePassword}>
            <div className="field">
              <label>当前密码</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="field">
              <label>新密码（至少 8 位）</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="field">
              <label>确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            {pwdErr && <p className="notice error">{pwdErr}</p>}
            {pwdMsg && <p className="notice info">{pwdMsg}</p>}

            <div className="profile-actions">
              <button className="btn" type="submit" disabled={pwdBusy}>
                {pwdBusy ? "更新中…" : "更新密码"}
              </button>
            </div>
          </form>
        </section>

        {/* 账号信息 */}
        <section className="profile-card profile-meta">
          <h2>账号</h2>
          <dl className="meta-list">
            <div>
              <dt>用户名</dt>
              <dd>{user.username}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>{user.role === "ADMIN" ? "管理员" : "读者"}</dd>
            </div>
            <div>
              <dt>注册时间</dt>
              <dd>{user.joinedAt}</dd>
            </div>
          </dl>
          <div className="profile-links">
            {user.role === "ADMIN" && (
              <Link href="/admin" className="btn ghost btn-sm">
                进入后台
              </Link>
            )}
            <Link href="/" className="back-link">
              ← 返回首页
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
