"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertDialog } from "radix-ui";

export type AlertOptions = {
  title: string;
  description?: string;
  confirmText?: string;
};

export type ConfirmOptions = AlertOptions & {
  cancelText?: string;
  tone?: "default" | "danger";
};

type Kind = "alert" | "confirm";

type Request = {
  kind: Kind;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
  resolve: (ok: boolean) => void;
};

type Api = {
  /** 单按钮知会：只看一眼，返回 void */
  alert: (opts: AlertOptions) => Promise<void>;
  /** 双按钮确认：确认 true / 取消与 Esc false */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<Api | null>(null);

export function useFeedback(): Api {
  const api = useContext(FeedbackContext);
  if (!api) {
    throw new Error("useFeedback 必须用在 <FeedbackProvider> 内部");
  }
  return api;
}

/**
 * 全站提示：Radix AlertDialog 只管行为（焦点陷阱 / Esc / aria / 焦点归还），
 * 样式用站点自己的 token。同一时刻只显示一个，后到的排队。
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [head, setHead] = useState<Request | null>(null);
  const headRef = useRef<Request | null>(null);
  const queueRef = useRef<Request[]>([]);

  const push = useCallback(
    (req: Omit<Request, "resolve">) =>
      new Promise<boolean>((resolve) => {
        const item: Request = { ...req, resolve };
        if (!headRef.current) {
          headRef.current = item;
          setHead(item);
        } else {
          queueRef.current.push(item);
        }
      }),
    []
  );

  const close = useCallback((ok: boolean) => {
    const current = headRef.current;
    if (!current) return;
    headRef.current = null;
    current.resolve(ok);
    const next = queueRef.current.shift() ?? null;
    headRef.current = next;
    setHead(next);
  }, []);

  const api = useMemo<Api>(
    () => ({
      alert: async (opts) => {
        await push({ ...opts, kind: "alert" });
      },
      confirm: (opts) => push({ ...opts, kind: "confirm" }),
    }),
    [push]
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      <AlertDialog.Root
        open={head !== null}
        onOpenChange={(open) => {
          // Esc、点遮罩、以及 Action/Cancel 关闭都会走到这里
          if (!open) close(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fb-overlay" />
          <AlertDialog.Content
            className={`fb-dialog${head?.tone === "danger" ? " is-danger" : ""}`}
          >
            <AlertDialog.Title className="fb-title">
              {head?.title ?? ""}
            </AlertDialog.Title>
            {head?.description && (
              <AlertDialog.Description className="fb-desc">
                {head.description}
              </AlertDialog.Description>
            )}

            <div className="fb-actions">
              {head?.kind === "confirm" && (
                <AlertDialog.Cancel
                  className="fb-btn fb-cancel"
                  autoFocus
                  onClick={() => close(false)}
                >
                  {head?.cancelText ?? "取消"}
                </AlertDialog.Cancel>
              )}
              <AlertDialog.Action
                className={`fb-btn ${
                  head?.tone === "danger" ? "fb-danger" : "fb-primary"
                }`}
                onClick={() => close(true)}
              >
                {head?.confirmText ??
                  (head?.kind === "alert" ? "知道了" : "确定")}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </FeedbackContext.Provider>
  );
}