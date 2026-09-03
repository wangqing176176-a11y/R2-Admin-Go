"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X } from "lucide-react";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  containerClassName?: string;
  panelClassName?: string;
  contentClassName?: string;
  headerRight?: React.ReactNode;
  showHeaderClose?: boolean;
  closeOnBackdropClick?: boolean;
  busy?: boolean;
  busyLabel?: string;
  zIndex?: number;
};

export default function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  containerClassName,
  panelClassName,
  contentClassName,
  headerRight,
  showHeaderClose = false,
  closeOnBackdropClick = true,
  busy = false,
  busyLabel = "正在处理中…",
  zIndex = 300,
}: ModalProps) {
  const [rendered, setRendered] = useState(open);
  const [busyRendered, setBusyRendered] = useState(busy);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }

    // Keep the dialog mounted until the same exit animation used by the
    // mobile selection bar has completed.
    const timer = window.setTimeout(() => setRendered(false), 210);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (busy) {
      const frame = window.requestAnimationFrame(() => setBusyRendered(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const timer = window.setTimeout(() => setBusyRendered(false), 180);
    return () => window.clearTimeout(timer);
  }, [busy]);

  if (!rendered) return null;

  const node = (
    <div
      className={[
        "fixed inset-0 flex items-center justify-center overflow-y-auto p-3 sm:p-4",
        open ? "" : "pointer-events-none",
        containerClassName,
      ].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal="true"
      style={{ zIndex }}
    >
      <button
        type="button"
        disabled={!closeOnBackdropClick || busy}
        tabIndex={-1}
        className={`absolute inset-0 bg-black/45 dark:bg-black/55 ${
          open ? "r2-backdrop-enter" : "r2-backdrop-exit"
        }`}
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        className={[
          "r2-modal-panel relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg transform-gpu flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] motion-reduce:transform-none sm:max-h-[calc(100dvh-2rem)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_24px_70px_rgba(0,0,0,0.42)]",
          open ? "r2-mobile-selection-bar-enter" : "r2-mobile-selection-bar-exit",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="r2-modal-header relative border-b border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          {headerRight ? (
            <div
              className={`absolute ${showHeaderClose ? "right-14 top-1/2 h-8 -translate-y-1/2" : "right-3 top-1/2 -translate-y-1/2"} inline-flex items-center`}
            >
              {headerRight}
            </div>
          ) : null}
          {showHeaderClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            disabled={busy}
            className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-100/80 hover:text-blue-700 disabled:cursor-wait disabled:opacity-45 dark:text-slate-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-200"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : null}
          <div className={`min-w-0 ${showHeaderClose ? (headerRight ? "pr-44" : "pr-10") : headerRight ? "pr-32" : ""}`}>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          </div>
        </div>
        <div
          className={[
            "r2-modal-content min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white px-5 py-4 text-gray-900 dark:bg-gray-900 dark:text-slate-100",
            contentClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div aria-busy={busy} inert={busy}>{children}</div>
        </div>
        {footer ? (
        <div className="r2-modal-footer flex min-h-14 items-center border-t border-gray-100 bg-gray-50/75 px-5 py-2 dark:border-gray-800 dark:bg-gray-900">
            <div className="w-full">{footer}</div>
          </div>
        ) : null}
        {busyRendered ? (
          <div className={`absolute inset-0 z-30 flex items-center justify-center bg-white/75 p-5 backdrop-blur-[1px] dark:bg-gray-950/75 ${busy ? "r2-modal-busy-enter" : "pointer-events-none r2-modal-busy-exit"}`} role="status" aria-live="polite">
            <div className={`flex items-center gap-2.5 rounded-lg border border-blue-100 bg-white px-4 py-3 text-sm font-medium text-blue-700 shadow-lg dark:border-blue-900/70 dark:bg-gray-900 dark:text-blue-200 ${busy ? "r2-modal-busy-card-enter" : "r2-modal-busy-card-exit"}`}>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span>{busyLabel}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
