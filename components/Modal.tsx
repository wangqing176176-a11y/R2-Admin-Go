"use client";

import React from "react";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  panelClassName?: string;
  showHeaderClose?: boolean;
  closeOnBackdropClick?: boolean;
};

export default function Modal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  panelClassName,
  showHeaderClose = false,
  closeOnBackdropClick = true,
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
      {closeOnBackdropClick ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
          aria-label="Close dialog"
        />
      ) : (
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      )}
      <div
        className={[
          "relative w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 flex flex-col overflow-hidden",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="relative px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          {showHeaderClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭弹窗"
              className="absolute right-3 top-2.5 inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          ) : null}
          <div className="min-w-0 pr-10">
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</div>
            {description ? <div className="mt-1 text-sm text-gray-500 dark:text-gray-300">{description}</div> : null}
          </div>
        </div>
        <div className="px-5 py-4 text-gray-900 dark:text-gray-100 overflow-y-auto min-h-0">{children}</div>
        {footer ? <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">{footer}</div> : null}
      </div>
    </div>
  );
}
