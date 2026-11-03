"use client";

import { useEffect } from "react";

/**
 * 浏览量自增：进入文章页时发一次 keepalive POST（不阻塞渲染，不影响 ISR）。
 * keepalive 保证页面跳走/刷新时请求也能发出去。
 */
export function PostViewBeacon({ postId }: { postId: string }) {
  useEffect(() => {
    fetch(`/api/posts/${postId}/view`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, [postId]);

  return null;
}
