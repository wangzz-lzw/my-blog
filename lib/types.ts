import type { Post, Tag, Comment } from "@prisma/client";

export type PostWithTags = Post & { tags: Tag[] };

export type PostWithTagsAndComments = PostWithTags & { comments: Comment[] };

export type SafeComment = Pick<
  Comment,
  "id" | "author" | "content" | "createdAt"
>;
