import { PostEditor } from "@/components/admin/PostEditor";

export default function NewPostPage() {
  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 1rem" }}>写文章</h1>
      <PostEditor />
    </div>
  );
}
