"use client";

import React, { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

type TextPreviewPanelProps = {
  name: string;
  text?: string;
};

type HighlightToken = {
  text: string;
  className?: string;
};

const getFileExt = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

const TOKEN_STYLES = {
  comment: "text-slate-400 dark:text-slate-500",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-violet-700 dark:text-violet-300",
  keyword: "font-semibold text-blue-700 dark:text-blue-300",
  literal: "font-semibold text-fuchsia-700 dark:text-fuchsia-300",
  function: "text-cyan-700 dark:text-cyan-300",
  property: "text-amber-700 dark:text-amber-300",
  tag: "font-semibold text-rose-700 dark:text-rose-300",
  attr: "text-purple-700 dark:text-purple-300",
  operator: "text-slate-500 dark:text-slate-400",
} as const;

const JS_KEYWORDS = [
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "constructor",
  "continue", "debugger", "default", "delete", "do", "else", "enum", "export", "extends", "finally",
  "for", "from", "function", "get", "if", "implements", "import", "in", "instanceof", "interface",
  "let", "new", "of", "private", "protected", "public", "readonly", "return", "set", "static", "super",
  "switch", "this", "throw", "try", "type", "typeof", "var", "void", "while", "with", "yield",
];

const CSS_KEYWORDS = [
  "and", "from", "important", "in", "not", "only", "or", "screen", "to",
];

const SQL_KEYWORDS = [
  "add", "alter", "and", "as", "asc", "between", "by", "case", "create", "delete", "desc", "distinct",
  "drop", "else", "end", "exists", "from", "group", "having", "in", "index", "insert", "into", "is",
  "join", "left", "like", "limit", "not", "null", "on", "or", "order", "outer", "primary", "right",
  "select", "set", "table", "then", "union", "unique", "update", "values", "view", "when", "where",
];

const SHELL_KEYWORDS = [
  "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "then", "until", "while",
];

const keywordPattern = (words: string[]) => new RegExp(`\\b(?:${words.join("|")})\\b`, "iy");

const isHtmlLike = (ext: string) => /^(html|htm|xml|vue|svelte)$/.test(ext);
const isCssLike = (ext: string) => /^(css|scss|less)$/.test(ext);
const isSqlLike = (ext: string) => ext === "sql";
const isShellLike = (ext: string) => /^(sh|bash|zsh|bat|cmd)$/.test(ext);
const isYamlLike = (ext: string) => /^(yml|yaml|toml|ini|conf|config|properties|env)$/.test(ext);

const matchAt = (regex: RegExp, line: string, index: number) => {
  regex.lastIndex = index;
  const match = regex.exec(line);
  return match && match.index === index ? match[0] : "";
};

const pushToken = (tokens: HighlightToken[], text: string, className?: string) => {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.className === className) {
    last.text += text;
  } else {
    tokens.push({ text, className });
  }
};

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("copy failed");
};

const highlightLine = (line: string, ext: string): HighlightToken[] => {
  if (!line) return [{ text: " " }];

  const tokens: HighlightToken[] = [];
  let index = 0;

  const keywordRegex = isSqlLike(ext)
    ? keywordPattern(SQL_KEYWORDS)
    : isCssLike(ext)
      ? keywordPattern(CSS_KEYWORDS)
      : isShellLike(ext)
        ? keywordPattern(SHELL_KEYWORDS)
        : keywordPattern(JS_KEYWORDS);

  while (index < line.length) {
    const rest = line.slice(index);
    let value = "";
    let className: string | undefined;

    if ((isHtmlLike(ext) || rest.startsWith("<!--")) && (value = matchAt(/<!--.*?-->/y, line, index))) {
      className = TOKEN_STYLES.comment;
    } else if ((isHtmlLike(ext) || rest.startsWith("<!")) && (value = matchAt(/<![A-Za-z][^>]*>/y, line, index))) {
      className = TOKEN_STYLES.tag;
    } else if (isHtmlLike(ext) && (value = matchAt(/<\/?[A-Za-z][\w:-]*/y, line, index))) {
      className = TOKEN_STYLES.tag;
    } else if (isHtmlLike(ext) && (value = matchAt(/\s+[A-Za-z_:][-A-Za-z0-9_:.]*(?=\s*=|\s|\/?>)/y, line, index))) {
      className = TOKEN_STYLES.attr;
    } else if ((value = matchAt(/\/\*.*?\*\//y, line, index)) || (value = matchAt(/\/\*.*/y, line, index))) {
      className = TOKEN_STYLES.comment;
    } else if ((isShellLike(ext) || isYamlLike(ext)) && (value = matchAt(/#.*/y, line, index))) {
      className = TOKEN_STYLES.comment;
    } else if (!isHtmlLike(ext) && (value = matchAt(/\/\/.*/y, line, index))) {
      className = TOKEN_STYLES.comment;
    } else if (isSqlLike(ext) && (value = matchAt(/--.*/y, line, index))) {
      className = TOKEN_STYLES.comment;
    } else if ((value = matchAt(/"(?:\\.|[^"\\])*"/y, line, index)) || (value = matchAt(/'(?:\\.|[^'\\])*'/y, line, index)) || (value = matchAt(/`(?:\\.|[^`\\])*`/y, line, index))) {
      className = TOKEN_STYLES.string;
    } else if ((value = matchAt(/\b(?:true|false|null|undefined|NaN|Infinity)\b/iy, line, index))) {
      className = TOKEN_STYLES.literal;
    } else if ((value = matchAt(/\b(?:0x[\da-f]+|\d+(?:\.\d+)?)(?:e[+-]?\d+)?\b/iy, line, index))) {
      className = TOKEN_STYLES.number;
    } else if (isCssLike(ext) && (value = matchAt(/--?[A-Za-z_][\w-]*(?=\s*:)/y, line, index))) {
      className = TOKEN_STYLES.property;
    } else if (isYamlLike(ext) && (value = matchAt(/[A-Za-z_][\w.-]*(?=\s*:)/y, line, index))) {
      className = TOKEN_STYLES.property;
    } else if ((value = matchAt(keywordRegex, line, index))) {
      className = TOKEN_STYLES.keyword;
    } else if ((value = matchAt(/\b[A-Za-z_$][\w$]*(?=\s*\()/y, line, index))) {
      className = TOKEN_STYLES.function;
    } else if ((value = matchAt(/[{}[\]();,.<>:+\-*/%=!&|?~^@]+/y, line, index))) {
      className = TOKEN_STYLES.operator;
    } else {
      value = line[index];
    }

    pushToken(tokens, value, className);
    index += value.length;
  }

  return tokens;
};

export default function TextPreviewPanel({ name, text }: TextPreviewPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const ext = getFileExt(name);
  const isLoading = text == null;
  const normalizedText = String(text ?? "").replace(/\r\n/g, "\n");
  const lines = isLoading ? [] : normalizedText.split("\n");
  const lineCount = Math.max(1, lines.length);
  const lineNumberDigits = Math.max(3, String(lineCount).length);
  const lineNumberWidth = `calc(${lineNumberDigits}ch + 1.25rem)`;

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const handleCopyAll = async () => {
    if (isLoading) return;
    try {
      await copyText(normalizedText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden="true" />
          </div>
          <span className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={name}>
            {name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={isLoading}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
            aria-label="复制全部代码"
          >
            {copyState === "copied" ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制全部"}</span>
          </button>
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
                    className="sticky left-0 shrink-0 select-none border-r border-slate-200 bg-slate-50 px-2 text-right font-mono tabular-nums text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                    style={{ width: lineNumberWidth }}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <span className="px-4 font-mono whitespace-pre">
                    {highlightLine(line, ext).map((token, tokenIdx) => (
                      <span key={tokenIdx} className={token.className}>
                        {token.text}
                      </span>
                    ))}
                  </span>
                </span>
              ))}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
