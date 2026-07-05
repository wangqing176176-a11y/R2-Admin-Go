"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  panelClassName?: string;
  contentClassName?: string;
  headerRight?: React.ReactNode;
  showHeaderClose?: boolean;
  closeOnBackdropClick?: boolean;
  zIndex?: number;
};

export default function Modal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  panelClassName,
  contentClassName,
  headerRight,
  showHeaderClose = false,
  closeOnBackdropClick = true,
  zIndex = 300,
}: ModalProps) {
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      setRendered(true);
      frame = window.requestAnimationFrame(() => setEntered(true));
    } else {
      setEntered(false);
      timer = setTimeout(() => setRendered(false), 220);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [open]);

  if (!rendered) return null;

  const node = (
    <div
      className={`fixed inset-0 flex items-center justify-center overflow-y-auto p-3 sm:p-4 ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      style={{ zIndex }}
    >
      {closeOnBackdropClick ? (
        <button
          type="button"
          className={`absolute inset-0 bg-black/40 transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity] motion-reduce:transition-none ${
            entered ? "opacity-100" : "opacity-0"
          }`}
          onClick={onClose}
          aria-label="Close dialog"
        />
      ) : (
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity] motion-reduce:transition-none ${
            entered ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
        />
      )}
      <div
        className={[
          "r2-modal-panel relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg transform-gpu flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity] motion-reduce:transform-none motion-reduce:transition-none sm:max-h-[calc(100dvh-2rem)] dark:border-slate-700/80 dark:bg-slate-900",
          entered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="relative px-5 py-4 border-b border-gray-100 dark:border-slate-700/70">
          {headerRight ? (
            <div
              className={`absolute ${showHeaderClose ? "right-14 top-2.5 h-10" : "right-3 top-3"} inline-flex items-center`}
            >
              {headerRight}
            </div>
          ) : null}
          {showHeaderClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭弹窗"
              className="absolute right-3 top-2.5 inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          ) : null}
          <div className={`min-w-0 ${showHeaderClose ? (headerRight ? "pr-44" : "pr-10") : headerRight ? "pr-32" : ""}`}>
            <div className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</div>
            {description ? <div className="mt-1 text-sm text-gray-500 dark:text-slate-300">{description}</div> : null}
          </div>
        </div>
        <div
          className={[
            "px-5 py-4 text-gray-900 dark:text-slate-100 overflow-y-auto overflow-x-hidden min-h-0 flex-1",
            contentClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
        {footer ? <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-700/70">{footer}</div> : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
