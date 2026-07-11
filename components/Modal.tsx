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
          className={`absolute inset-0 bg-slate-950/35 backdrop-blur-[1px] transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity] motion-reduce:transition-none ${
            entered ? "opacity-100" : "opacity-0"
          }`}
          onClick={onClose}
          aria-label="Close dialog"
        />
      ) : (
        <div
          className={`absolute inset-0 bg-slate-950/35 backdrop-blur-[1px] transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity] motion-reduce:transition-none ${
            entered ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
        />
      )}
      <div
        className={[
          "r2-modal-panel relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg transform-gpu flex-col overflow-hidden rounded-lg border border-blue-200/90 bg-white shadow-[0_20px_55px_rgba(30,64,175,0.18)] transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity] motion-reduce:transform-none motion-reduce:transition-none sm:max-h-[calc(100dvh-2rem)] dark:border-blue-900/70 dark:bg-slate-950",
          entered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="relative border-b border-blue-200/90 bg-[#e9f0ff] px-5 py-4 dark:border-blue-950/70 dark:bg-[#111a2e]">
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
              className="absolute right-3 top-2.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-100/80 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-200"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          ) : null}
          <div className={`min-w-0 ${showHeaderClose ? (headerRight ? "pr-44" : "pr-10") : headerRight ? "pr-32" : ""}`}>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          </div>
        </div>
        <div
          className={[
            "min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white px-5 py-4 text-gray-900 dark:bg-slate-950 dark:text-slate-100",
            contentClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
        {footer ? (
          <div className="r2-modal-footer flex min-h-14 items-center border-t border-blue-200/90 bg-[#e9f0ff] px-5 py-2 dark:border-blue-950/70 dark:bg-[#111a2e]">
            <div className="w-full">{footer}</div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
