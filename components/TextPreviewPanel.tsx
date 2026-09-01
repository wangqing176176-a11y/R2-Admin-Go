"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Check, Code2, Copy, Eye, ExternalLink, Image as ImageIcon, List, MoreHorizontal, X } from "lucide-react";
import type { Components } from "react-markdown";
import { useResponsivePreviewToolbar } from "./useResponsivePreviewToolbar";

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

const isMarkdownFile = (ext: string) => /^(md|markdown)$/.test(ext);

const getNodeText = (node: React.ReactNode): string =>
  React.Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (React.isValidElement(child)) return getNodeText((child.props as { children?: React.ReactNode }).children);
    return "";
  }).join("");

const slugifyHeading = (value: string) => {
  const slug = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `markdown-heading-${slug || "section"}`;
};

type MarkdownHeading = { level: number; text: string; id: string };

const extractMarkdownHeadings = (value: string): MarkdownHeading[] => {
  const headings: MarkdownHeading[] = [];
  const seen = new Map<string, number>();
  let fenced = false;
  for (const line of value.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].trim();
    const baseId = slugifyHeading(text);
    const count = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, count);
    headings.push({ level: match[1].length, text, id: count === 1 ? baseId : `${baseId}-${count}` });
  }
  return headings;
};

const safeMarkdownUrl = (value: string) => {
  const url = value.trim();
  if (!url || /^(?:javascript|vbscript|file|data):/i.test(url)) return "";
  return url;
};

const isExternalUrl = (value: string) => /^https?:\/\//i.test(value);

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

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const languageKey = (language ?? "").toLocaleLowerCase();
  const canHighlight = /^(js|jsx|ts|tsx|css|scss|less|sql|sh|bash|zsh|bat|cmd|html|htm|xml|vue|svelte|yaml|yml|toml|ini|conf|config|properties|env)$/.test(languageKey);

  const handleCopy = async () => {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950 text-slate-100 shadow-sm dark:border-slate-700">
      <div className="flex h-8 items-center justify-between border-b border-white/10 bg-slate-900 px-3 text-[11px] text-slate-400">
        <span className="font-mono">{language || "code"}</span>
        <button type="button" onClick={() => void handleCopy()} className="inline-flex h-8 items-center gap-1 rounded px-1.5 transition hover:bg-white/10 hover:text-white" aria-label="复制代码块">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overscroll-contain overflow-x-auto p-4 text-[13px] leading-6"><code>{canHighlight ? code.split("\n").map((line, index) => <span key={index} className="block min-h-6 whitespace-pre">{highlightLine(line, languageKey).map((token, tokenIndex) => <span key={tokenIndex} className={token.className}>{token.text}</span>)}</span>) : code}</code></pre>
    </div>
  );
}

export default function TextPreviewPanel({ name, text }: TextPreviewPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [viewMode, setViewMode] = useState<"preview" | "code">(() => isMarkdownFile(getFileExt(name)) ? "preview" : "code");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [imagesEnabled, setImagesEnabled] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const ext = getFileExt(name);
  const isMarkdown = isMarkdownFile(ext);
  const isLoading = text == null;
  const normalizedText = String(text ?? "").replace(/\r\n/g, "\n");
  const lines = isLoading ? [] : normalizedText.split("\n");
  const lineCount = Math.max(1, lines.length);
  const characterCount = normalizedText.length;
  const lineNumberDigits = Math.max(3, String(lineCount).length);
  const lineNumberWidth = `calc(${lineNumberDigits}ch + 1.25rem)`;
  const headings = extractMarkdownHeadings(normalizedText);
  const hasMarkdownImages = isMarkdown && /!\[[^\]]*\]\([^)]*\)/.test(normalizedText);
  const renderedContentRef = useRef<HTMLDivElement>(null);
  const mobileMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOutlineOpen(isMarkdown && headings.length > 0 && window.innerWidth >= 768);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [headings.length, isMarkdown, name]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!mobileMoreRef.current?.contains(event.target as Node)) setMobileMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMoreOpen(false);
    };
    window.document.addEventListener("pointerdown", closeOnOutsidePress);
    window.document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMoreOpen]);

  const handleCopyAll = async () => {
    if (isLoading) return;
    try {
      await copyText(normalizedText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const scrollToHeading = (heading: MarkdownHeading) => {
    const target = renderedContentRef.current?.querySelector(`#${CSS.escape(heading.id)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.innerWidth < 768) setOutlineOpen(false);
  };

  const mobileActions = [
    ...(isMarkdown ? [
      { id: "preview", label: "预览 Markdown", shortLabel: "预览", icon: <Eye className="h-3.5 w-3.5" />, active: viewMode === "preview", disabled: false, run: () => setViewMode("preview" as const) },
      { id: "code", label: "查看源代码", shortLabel: "代码", icon: <Code2 className="h-3.5 w-3.5" />, active: viewMode === "code", disabled: false, run: () => setViewMode("code" as const) },
    ] : []),
    { id: "copy", label: copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : isMarkdown ? "复制原文" : "复制全部", shortLabel: copyState === "copied" ? "已复制" : "复制", icon: copyState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />, active: copyState === "copied", disabled: isLoading, run: () => { void handleCopyAll(); } },
    ...(isMarkdown ? [
      { id: "outline", label: "文档大纲", shortLabel: "大纲", icon: <List className="h-3.5 w-3.5" />, active: outlineOpen, disabled: viewMode !== "preview" || !headings.length, run: () => setOutlineOpen((open) => !open) },
      { id: "images", label: imagesEnabled ? "隐藏图片" : "加载图片", shortLabel: "图片", icon: <ImageIcon className="h-3.5 w-3.5" />, active: imagesEnabled, disabled: viewMode !== "preview" || !hasMarkdownImages, run: () => setImagesEnabled((enabled) => !enabled) },
    ] : []),
  ];
  const { measureRef: mobileToolbarMeasureRef, visibleCount: mobileVisibleActionCount } = useResponsivePreviewToolbar({
    fixedWidths: [118],
    actionWidths: mobileActions.map(() => 44),
    moreWidth: 44,
    horizontalPadding: 24,
    fallbackVisibleCount: 3,
  });
  const mobileOverflowActions = mobileActions.slice(mobileVisibleActionCount);

  const markdownComponents: Components = (() => {
    const headingOccurrences = new Map<string, number>();
    const getHeadingId = (children: React.ReactNode) => {
      const baseId = slugifyHeading(getNodeText(children));
      const count = (headingOccurrences.get(baseId) ?? 0) + 1;
      headingOccurrences.set(baseId, count);
      return count === 1 ? baseId : `${baseId}-${count}`;
    };
    const heading = ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { children?: React.ReactNode }) => (
      <h2 {...props} id={getHeadingId(children)} className="mb-4 mt-7 scroll-mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{children}</h2>
    );

    return {
      h1: ({ children, ...props }) => <h1 {...props} id={getHeadingId(children)} className="mb-5 mt-2 scroll-mt-4 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{children}</h1>,
      h2: heading,
      h3: ({ children, ...props }) => <h3 {...props} id={getHeadingId(children)} className="mb-3 mt-6 scroll-mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{children}</h3>,
      h4: ({ children, ...props }) => <h4 {...props} id={getHeadingId(children)} className="mb-2 mt-5 scroll-mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">{children}</h4>,
      h5: ({ children, ...props }) => <h5 {...props} id={getHeadingId(children)} className="mb-2 mt-4 scroll-mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{children}</h5>,
      h6: ({ children, ...props }) => <h6 {...props} id={getHeadingId(children)} className="mb-2 mt-4 scroll-mt-4 text-sm font-medium text-slate-700 dark:text-slate-300">{children}</h6>,
      p: ({ children }) => <p className="my-3 leading-7 text-slate-700 dark:text-slate-300">{children}</p>,
      ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-slate-700 dark:text-slate-300">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-slate-700 dark:text-slate-300">{children}</ol>,
      li: ({ children }) => <li className="leading-7">{children}</li>,
      blockquote: ({ children }) => <blockquote className="my-4 border-l-4 border-blue-300 bg-blue-50/70 px-4 py-2 text-slate-600 dark:border-blue-700 dark:bg-blue-950/30 dark:text-slate-300">{children}</blockquote>,
      hr: () => <hr className="my-6 border-slate-200 dark:border-slate-700" />,
      strong: ({ children }) => <strong className="font-semibold text-slate-950 dark:text-white">{children}</strong>,
      em: ({ children }) => <em className="text-slate-700 dark:text-slate-300">{children}</em>,
      del: ({ children }) => <del className="text-slate-500 dark:text-slate-500">{children}</del>,
      table: ({ children }) => <div className="my-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="min-w-full border-collapse text-left text-sm">{children}</table></div>,
      thead: ({ children }) => <thead className="bg-slate-100 dark:bg-slate-800">{children}</thead>,
      th: ({ children }) => <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">{children}</th>,
      td: ({ children }) => <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700 dark:border-slate-800 dark:text-slate-300">{children}</td>,
      a: ({ href, children }) => {
        const safeHref = safeMarkdownUrl(href ?? "");
        if (!safeHref) return <span className="text-slate-500">{children}</span>;
        const external = isExternalUrl(safeHref);
        return <a href={safeHref} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 dark:text-blue-300 dark:decoration-blue-700 dark:hover:text-blue-200">{children}{external ? <ExternalLink className="ml-1 inline-block h-3 w-3" aria-hidden="true" /> : null}</a>;
      },
      img: ({ src, alt }) => {
        const safeSrc = safeMarkdownUrl(typeof src === "string" ? src : "");
        if (!imagesEnabled || !safeSrc) return <span className="my-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"><ImageIcon className="h-3.5 w-3.5" />{alt || "图片"}（默认未加载）</span>;
        // Markdown may point to arbitrary user-provided image URLs, so next/image cannot be configured safely here.
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={safeSrc} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="my-4 max-h-[70vh] max-w-full rounded-lg border border-slate-200 object-contain shadow-sm dark:border-slate-700" onError={(event) => { event.currentTarget.style.display = "none"; }} />;
      },
      input: ({ type, checked }) => type === "checkbox" ? <input type="checkbox" checked={Boolean(checked)} readOnly className="mr-2 h-4 w-4 rounded border-slate-300 align-[-2px] accent-blue-600" /> : null,
      pre: ({ children }) => <>{children}</>,
      code: ({ className, children }) => {
        const code = String(children).replace(/\n$/, "");
        const language = /language-(\w+)/.exec(className ?? "")?.[1];
        const isBlock = Boolean(className) || code.includes("\n");
        return isBlock ? <CodeBlock code={code} language={language} /> : <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-pink-700 dark:bg-slate-800 dark:text-pink-300">{children}</code>;
      },
    };
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden overscroll-contain rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div ref={mobileToolbarMeasureRef} className="flex min-h-[3.25rem] shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 md:min-h-11 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
          <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
          <span className="min-w-0 max-w-[35vw] truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={name}>{name}</span>
          {isMarkdown ? <span className="hidden rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 sm:inline dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">Markdown</span> : null}
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 md:flex">
          {isMarkdown ? (
            <div className="relative inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-800 dark:bg-gray-900" role="tablist" aria-label="Markdown显示模式">
              <button type="button" role="tab" aria-selected={viewMode === "preview"} onClick={() => setViewMode("preview")} className={`inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[11px] transition-colors ${viewMode === "preview" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"}`}><Eye className="h-3.5 w-3.5" />预览</button>
              <button type="button" role="tab" aria-selected={viewMode === "code"} onClick={() => setViewMode("code")} className={`inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[11px] transition-colors ${viewMode === "code" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"}`}><Code2 className="h-3.5 w-3.5" />代码</button>
            </div>
          ) : null}
          <button type="button" onClick={() => void handleCopyAll()} disabled={isLoading} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-200" aria-label="复制原文">{copyState === "copied" ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}<span>{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : isMarkdown ? "复制原文" : "复制全部"}</span></button>
          {isMarkdown ? <button type="button" onClick={() => setOutlineOpen((open) => !open)} disabled={viewMode !== "preview" || !headings.length} className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition ${outlineOpen ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40"} disabled:cursor-not-allowed disabled:opacity-45`} aria-pressed={outlineOpen}><List className="h-3.5 w-3.5" />大纲</button> : null}
          {isMarkdown ? <button type="button" onClick={() => setImagesEnabled((enabled) => !enabled)} disabled={viewMode !== "preview" || !hasMarkdownImages} className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition ${imagesEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40"} disabled:cursor-not-allowed disabled:opacity-45`} aria-pressed={imagesEnabled}><ImageIcon className="h-3.5 w-3.5" />{imagesEnabled ? "隐藏图片" : "加载图片"}</button> : null}
          <span className="hidden sm:inline">{isLoading ? "加载中" : `${lineCount} 行 · ${characterCount} 字`}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 text-slate-500 dark:text-slate-400 md:hidden">
          {mobileActions.slice(0, mobileVisibleActionCount).map((action) => <button key={action.id} type="button" onClick={action.run} disabled={action.disabled} className={`inline-flex h-10 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md leading-none disabled:opacity-40 ${action.active ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title={action.label} aria-label={action.label}>{action.icon}<span className="text-[9px]">{action.shortLabel}</span></button>)}
          {mobileOverflowActions.length ? <div ref={mobileMoreRef} className="relative shrink-0"><button type="button" onClick={() => setMobileMoreOpen((open) => !open)} className={`inline-flex h-10 w-11 flex-col items-center justify-center gap-0.5 rounded-md leading-none ${mobileMoreOpen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title="更多文本工具" aria-label="更多文本工具" aria-expanded={mobileMoreOpen}><MoreHorizontal className="h-4 w-4" /><span className="text-[9px]">更多</span></button>{mobileMoreOpen ? <div className="absolute right-0 top-11 z-40 grid w-40 gap-0.5 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{mobileOverflowActions.map((action) => <button key={action.id} type="button" disabled={action.disabled} onClick={() => { action.run(); setMobileMoreOpen(false); }} className={`flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs disabled:opacity-40 ${action.active ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`}>{action.icon}<span>{action.label}</span></button>)}</div> : null}</div> : null}
        </div>
      </div>
      {isLoading ? <div className="flex min-h-0 flex-1 items-center justify-center bg-[#fbfcfe] text-sm text-slate-500 dark:bg-gray-950 dark:text-slate-400">文本加载中…</div> : isMarkdown && viewMode === "preview" ? (
        <div className="relative flex min-h-0 flex-1 overscroll-contain bg-[#fbfcfe] dark:bg-gray-950">
          {outlineOpen ? <aside className="hidden w-56 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-950"><div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300"><List className="h-3.5 w-3.5" />文档大纲</div><nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">{headings.map((heading) => <button type="button" key={heading.id} onClick={() => scrollToHeading(heading)} className="block w-full rounded px-2 py-1.5 text-left text-xs leading-5 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" style={{ paddingLeft: `${8 + Math.max(0, heading.level - 1) * 10}px` }}>{heading.text}</button>)}</nav></aside> : null}
          {outlineOpen ? <div className="absolute inset-0 z-20 md:hidden"><button type="button" className="absolute inset-0 bg-slate-950/25" onClick={() => setOutlineOpen(false)} aria-label="关闭文档大纲" /><aside className="absolute inset-y-0 left-0 flex w-[min(18rem,84vw)] flex-col border-r border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"><div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"><List className="h-3.5 w-3.5" />文档大纲</span><button type="button" onClick={() => setOutlineOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="关闭大纲"><X className="h-4 w-4" /></button></div><nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">{headings.map((heading) => <button type="button" key={heading.id} onClick={() => scrollToHeading(heading)} className="block w-full rounded px-2 py-2 text-left text-xs leading-5 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" style={{ paddingLeft: `${8 + Math.max(0, heading.level - 1) * 10}px` }}>{heading.text}</button>)}</nav></aside></div> : null}
          <div ref={renderedContentRef} className="min-w-0 flex-1 overflow-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-7"><div className="mx-auto max-w-4xl text-[15px]" >
            {hasMarkdownImages && !imagesEnabled ? <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />文档中的图片默认未加载，点击“加载图片”后才会请求图片地址。</div> : null}
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} urlTransform={safeMarkdownUrl} components={markdownComponents}>{normalizedText}</ReactMarkdown>
          </div></div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[#fbfcfe] dark:bg-gray-950"><pre className="min-w-max p-0 text-[13px] leading-6 text-slate-800 dark:text-slate-100"><code className="block py-3">{lines.map((line, idx) => <span key={idx} className="flex min-h-6"><span className="sticky left-0 shrink-0 select-none border-r border-slate-200 bg-slate-50 px-2 text-right font-mono tabular-nums text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500" style={{ width: lineNumberWidth }} aria-hidden="true">{idx + 1}</span><span className="px-4 font-mono whitespace-pre">{highlightLine(line, ext).map((token, tokenIdx) => <span key={tokenIdx} className={token.className}>{token.text}</span>)}</span></span>)}</code></pre></div>
      )}
    </div>
  );
}
