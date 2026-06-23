"use client";

import React from "react";

type TextPreviewPanelProps = {
  name: string;
  text?: string;
};

const getFileExt = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

export default function TextPreviewPanel({ name, text }: TextPreviewPanelProps) {
  const ext = getFileExt(name);
  const isLoading = text == null;
  const normalizedText = String(text ?? "").replace(/\r\n/g, "\n");
  const lines = isLoading ? [] : normalizedText.split("\n");
  const lineCount = Math.max(1, lines.length);
  const lineNumberWidth = `${Math.max(3, String(lineCount).length) + 1}ch`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="ml-2 min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={name}>
            {name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          {ext ? (
            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono uppercase dark:border-slate-700 dark:bg-slate-950">
              {ext}
            </span>
          ) : null}
          <span>{isLoading ? "加载中" : `${lineCount} 行`}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#fbfcfe] dark:bg-[#0b1020]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            正在加载预览...
          </div>
        ) : (
          <pre className="min-w-max p-0 text-[13px] leading-6 text-slate-800 dark:text-slate-100">
            <code className="block py-3">
              {lines.map((line, idx) => (
                <span key={idx} className="flex min-h-6">
                  <span
                    className="sticky left-0 shrink-0 select-none border-r border-slate-200 bg-slate-50 px-3 text-right font-mono text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                    style={{ width: lineNumberWidth }}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <span className="px-4 font-mono whitespace-pre">{line || " "}</span>
                </span>
              ))}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
