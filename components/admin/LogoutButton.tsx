import { LogoutControl } from "@/components/LogoutControl";

/** 后台退出按钮：复用共享 LogoutControl 的 admin 变体（行为不变）。 */
export function LogoutButton() {
  return <LogoutControl variant="admin" />;
}
