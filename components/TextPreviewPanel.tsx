"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
  Bold,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  ExternalLink,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Pencil,
  Quote,
  Redo2,
  Save,
  Search,
  Strikethrough,
  Table2,
  Undo2,
  X,
} from "lucide-react";
import type { Components } from "react-markdown";
import { useResponsivePreviewToolbar } from "./useResponsivePreviewToolbar";
import LoadingState from "./LoadingState";

type TextPreviewPanelProps = {
  name: string;
  text?: string;
  canEdit?: boolean;
  onSave?: (text: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
};

type HighlightToken = {
  text: string;
  className?: string;
};

type FormatMenu = "heading" | "code" | "table" | null;
type TableAlignment = "left" | "center" | "right";

const codeLanguagePresets = [
  { value: "", label: "纯文本" },
  { value: "js", label: "JavaScript" },
  { value: "ts", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "bash", label: "Shell" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

const getFileExt = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

const isMarkdownFile = (ext: string) => /^(md|markdown|mdx)$/.test(ext);

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
const clampScrollRatio = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

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

export default function TextPreviewPanel({ name, text, canEdit = false, onSave, onDirtyChange }: TextPreviewPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [viewMode, setViewMode] = useState<"preview" | "code" | "edit">(() => isMarkdownFile(getFileExt(name)) ? "preview" : "code");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [imagesEnabled, setImagesEnabled] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [formatMenu, setFormatMenu] = useState<FormatMenu>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 });
  const [tableAlignment, setTableAlignment] = useState<TableAlignment>("left");
  const ext = getFileExt(name);
  const isMarkdown = isMarkdownFile(ext);
  const isLoading = text == null;
  const normalizedText = String(text ?? "").replace(/\r\n/g, "\n");
  const normalizedDraft = draftText.replace(/\r\n/g, "\n");
  const dirty = text != null && normalizedDraft !== normalizedText;
  const displayedText = dirty ? normalizedDraft : normalizedText;
  const lines = isLoading ? [] : displayedText.split("\n");
  const lineCount = Math.max(1, lines.length);
  const characterCount = displayedText.length;
  const lineNumberDigits = Math.max(3, String(lineCount).length);
  const lineNumberWidth = `calc(${lineNumberDigits}ch + 1.25rem)`;
  const headings = extractMarkdownHeadings(displayedText);
  const hasMarkdownImages = isMarkdown && /!\[[^\]]*\]\([^)]*\)/.test(displayedText);
  const findMatchCount = (() => {
    if (!findText) return 0;
    const source = matchCase ? normalizedDraft : normalizedDraft.toLocaleLowerCase();
    const query = matchCase ? findText : findText.toLocaleLowerCase();
    let count = 0;
    let index = 0;
    while ((index = source.indexOf(query, index)) >= 0) {
      count += 1;
      index += Math.max(1, query.length);
    }
    return count;
  })();
  const renderedContentRef = useRef<HTMLDivElement>(null);
  const mobileMoreRef = useRef<HTMLDivElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const livePreviewRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<{ undo: string[]; redo: string[]; lastTypingAt: number }>({ undo: [], redo: [], lastTypingAt: 0 });

  useEffect(() => {
    if (text == null) return;
    const next = String(text).replace(/\r\n/g, "\n");
    setDraftText(next);
    historyRef.current = { undo: [], redo: [], lastTypingAt: 0 };
    setHistoryState({ undo: 0, redo: 0 });
    setSaveError("");
  }, [name, text]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

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

  useEffect(() => {
    if (!formatMenu) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!formatMenuRef.current?.contains(event.target as Node)) setFormatMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFormatMenu(null);
    };
    window.document.addEventListener("pointerdown", closeOnOutsidePress);
    window.document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [formatMenu]);

  useEffect(() => {
    if (!findOpen) return;
    const frame = window.requestAnimationFrame(() => findInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [findOpen]);

  const handleCopyAll = async () => {
    if (isLoading) return;
    try {
      await copyText(displayedText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const handleSave = async () => {
    if (!onSave || !dirty || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(normalizedDraft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const syncHistoryState = () => setHistoryState({ undo: historyRef.current.undo.length, redo: historyRef.current.redo.length });

  const commitDraftText = (next: string, mode: "typing" | "command" = "command") => {
    if (next === draftText) return;
    const history = historyRef.current;
    const now = Date.now();
    const shouldCreateCheckpoint = mode === "command" || now - history.lastTypingAt > 700;
    if (shouldCreateCheckpoint && history.undo[history.undo.length - 1] !== draftText) {
      history.undo.push(draftText);
      if (history.undo.length > 100) history.undo.shift();
    }
    history.redo = [];
    history.lastTypingAt = mode === "typing" ? now : 0;
    setDraftText(next);
    syncHistoryState();
  };

  const restoreEditorAfterHistory = (next: string) => {
    setDraftText(next);
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const cursor = Math.min(editor.selectionStart, next.length);
      editor.focus();
      editor.setSelectionRange(cursor, cursor);
      syncLivePreviewToCursor(cursor, next);
    });
  };

  const handleUndo = () => {
    const history = historyRef.current;
    const previous = history.undo.pop();
    if (previous == null) return;
    history.redo.push(draftText);
    history.lastTypingAt = 0;
    restoreEditorAfterHistory(previous);
    syncHistoryState();
  };

  const handleRedo = () => {
    const history = historyRef.current;
    const next = history.redo.pop();
    if (next == null) return;
    history.undo.push(draftText);
    history.lastTypingAt = 0;
    restoreEditorAfterHistory(next);
    syncHistoryState();
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLocaleLowerCase();
    if (modifier && key === "s") {
      event.preventDefault();
      void handleSave();
      return;
    }
    if (modifier && key === "f") {
      event.preventDefault();
      setFindOpen(true);
      return;
    }
    if (modifier && key === "z") {
      event.preventDefault();
      if (event.shiftKey) handleRedo(); else handleUndo();
      return;
    }
    if (modifier && key === "y") {
      event.preventDefault();
      handleRedo();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const next = `${normalizedDraft.slice(0, start)}  ${normalizedDraft.slice(end)}`;
    commitDraftText(next);
    window.requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = start + 2;
    });
  };

  const syncLivePreviewToCursor = (cursor: number, value: string) => {
    const preview = livePreviewRef.current;
    if (!preview) return;
    const totalLines = Math.max(1, value.split("\n").length - 1);
    const cursorLine = value.slice(0, cursor).split("\n").length - 1;
    const ratio = clampScrollRatio(cursorLine / totalLines);
    preview.scrollTop = ratio * Math.max(0, preview.scrollHeight - preview.clientHeight);
  };

  const syncLivePreviewToEditorScroll = () => {
    const editor = editorRef.current;
    const preview = livePreviewRef.current;
    if (!editor || !preview) return;
    const editorRange = Math.max(1, editor.scrollHeight - editor.clientHeight);
    const ratio = clampScrollRatio(editor.scrollTop / editorRange);
    preview.scrollTop = ratio * Math.max(0, preview.scrollHeight - preview.clientHeight);
  };

  const applyMarkdownFormat = (kind: "heading" | "bold" | "italic" | "strike" | "link" | "quote" | "list" | "ordered" | "task" | "code" | "table" | "rule", options?: { headingLevel?: number; codeLanguage?: string; tableRows?: number; tableColumns?: number; tableAlignment?: TableAlignment }) => {
    const target = editorRef.current;
    if (!target) return;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const savedScrollTop = target.scrollTop;
    const savedScrollLeft = target.scrollLeft;
    const selected = normalizedDraft.slice(start, end);
    let replacement = selected;
    let selectionStart = start;
    let selectionEnd = end;

    const wrap = (before: string, after: string, placeholder: string) => {
      const content = selected || placeholder;
      replacement = `${before}${content}${after}`;
      selectionStart = start + before.length;
      selectionEnd = selectionStart + content.length;
    };
    const prefixLines = (prefix: (index: number) => string, placeholder: string, transform: (line: string) => string = (line) => line) => {
      const lineStart = normalizedDraft.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const nextBreak = normalizedDraft.indexOf("\n", end);
      const lineEnd = nextBreak < 0 ? normalizedDraft.length : nextBreak;
      const block = normalizedDraft.slice(lineStart, lineEnd) || placeholder;
      replacement = block.split("\n").map((line, index) => `${prefix(index)}${transform(line)}`).join("\n");
      selectionStart = lineStart;
      selectionEnd = lineStart + replacement.length;
      const next = `${normalizedDraft.slice(0, lineStart)}${replacement}${normalizedDraft.slice(lineEnd)}`;
      commitDraftText(next);
      window.requestAnimationFrame(() => {
        target.focus();
        target.setSelectionRange(selectionStart, selectionEnd);
        target.scrollTop = savedScrollTop;
        target.scrollLeft = savedScrollLeft;
        syncLivePreviewToCursor(selectionStart, next);
      });
      return true;
    };

    if (kind === "heading") {
      const level = Math.min(6, Math.max(1, options?.headingLevel ?? 2));
      if (prefixLines(() => `${"#".repeat(level)} `, "标题", (line) => line.replace(/^\s{0,3}#{1,6}\s+/, ""))) return;
    } else if (kind === "bold") wrap("**", "**", "粗体文字");
    else if (kind === "italic") wrap("_", "_", "斜体文字");
    else if (kind === "strike") wrap("~~", "~~", "删除线文字");
    else if (kind === "link") wrap("[", "](https://)", "链接文字");
    else if (kind === "quote") {
      if (prefixLines(() => "> ", "引用内容")) return;
    } else if (kind === "list") {
      if (prefixLines(() => "- ", "列表项")) return;
    } else if (kind === "ordered") {
      if (prefixLines((index) => `${index + 1}. `, "列表项")) return;
    } else if (kind === "task") {
      if (prefixLines(() => "- [ ] ", "待办事项")) return;
    } else if (kind === "code") {
      if (options && Object.prototype.hasOwnProperty.call(options, "codeLanguage")) wrap(`\`\`\`${options.codeLanguage ?? ""}\n`, "\n```", "代码");
      else if (selected.includes("\n")) wrap("```\n", "\n```", "代码");
      else wrap("`", "`", "代码");
    } else if (kind === "table") {
      const columns = Math.min(8, Math.max(1, options?.tableColumns ?? 2));
      const rows = Math.min(8, Math.max(1, options?.tableRows ?? 2));
      const alignment = options?.tableAlignment ?? "left";
      const separator = alignment === "center" ? ":---:" : alignment === "right" ? "---:" : ":---";
      const header = `| ${Array.from({ length: columns }, (_, index) => `列 ${index + 1}`).join(" | ")} |`;
      const divider = `| ${Array.from({ length: columns }, () => separator).join(" | ")} |`;
      const body = Array.from({ length: Math.max(0, rows - 1) }, () => `| ${Array.from({ length: columns }, () => "内容").join(" | ")} |`);
      replacement = [header, divider, ...body].join("\n");
      selectionEnd = start + replacement.length;
    } else if (kind === "rule") {
      replacement = `${start > 0 && normalizedDraft[start - 1] !== "\n" ? "\n" : ""}---\n`;
      selectionStart = selectionEnd = start + replacement.length;
    }

    const next = `${normalizedDraft.slice(0, start)}${replacement}${normalizedDraft.slice(end)}`;
    commitDraftText(next);
    window.requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(selectionStart, selectionEnd);
      target.scrollTop = savedScrollTop;
      target.scrollLeft = savedScrollLeft;
      syncLivePreviewToCursor(selectionStart, next);
    });
  };

  const findNextMatch = (direction: 1 | -1 = 1) => {
    const editor = editorRef.current;
    if (!editor || !findText) return false;
    const source = matchCase ? normalizedDraft : normalizedDraft.toLocaleLowerCase();
    const query = matchCase ? findText : findText.toLocaleLowerCase();
    let index = -1;
    if (direction === 1) {
      index = source.indexOf(query, editor.selectionEnd);
      if (index < 0) index = source.indexOf(query, 0);
    } else {
      const beforeSelection = editor.selectionStart - 1;
      index = beforeSelection >= 0 ? source.lastIndexOf(query, beforeSelection) : -1;
      if (index < 0) index = source.lastIndexOf(query);
    }
    if (index < 0) return false;
    editor.focus();
    editor.setSelectionRange(index, index + findText.length);
    syncLivePreviewToCursor(index, normalizedDraft);
    return true;
  };

  const replaceCurrentMatch = () => {
    const editor = editorRef.current;
    if (!editor || !findText) return;
    const selected = normalizedDraft.slice(editor.selectionStart, editor.selectionEnd);
    const matches = matchCase ? selected === findText : selected.toLocaleLowerCase() === findText.toLocaleLowerCase();
    if (!matches) {
      findNextMatch();
      return;
    }
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${normalizedDraft.slice(0, start)}${replaceText}${normalizedDraft.slice(end)}`;
    commitDraftText(next);
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start, start + replaceText.length);
      syncLivePreviewToCursor(start, next);
    });
  };

  const replaceAllMatches = () => {
    if (!findText || findMatchCount === 0) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const next = normalizedDraft.replace(new RegExp(escaped, matchCase ? "g" : "gi"), () => replaceText);
    commitDraftText(next);
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      syncLivePreviewToCursor(0, next);
    });
  };

  const scrollToHeading = (heading: MarkdownHeading) => {
    const target = renderedContentRef.current?.querySelector(`#${CSS.escape(heading.id)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.innerWidth < 768) setOutlineOpen(false);
  };

  const mobileActions = [
    ...(isMarkdown ? [
      { id: "preview", label: "预览 Markdown", shortLabel: "预览", icon: <Eye className="h-3.5 w-3.5" />, active: viewMode === "preview", disabled: false, run: () => setViewMode("preview" as const) },
      canEdit && onSave
        ? { id: "edit", label: "编辑 Markdown", shortLabel: "编辑", icon: <Pencil className="h-3.5 w-3.5" />, active: viewMode === "edit", disabled: isLoading, run: () => setViewMode("edit" as const) }
        : { id: "code", label: "查看 Markdown 源文", shortLabel: "源码", icon: <Code2 className="h-3.5 w-3.5" />, active: viewMode === "code", disabled: false, run: () => setViewMode("code" as const) },
    ] : canEdit && onSave ? [
      { id: "view", label: "只读查看", shortLabel: "查看", icon: <Eye className="h-3.5 w-3.5" />, active: viewMode === "code", disabled: false, run: () => setViewMode("code" as const) },
      { id: "edit", label: "编辑文件", shortLabel: "编辑", icon: <Pencil className="h-3.5 w-3.5" />, active: viewMode === "edit", disabled: isLoading, run: () => setViewMode("edit" as const) },
    ] : []),
    ...(canEdit && onSave ? [
      { id: "save", label: saving ? "正在保存" : "保存修改", shortLabel: saving ? "保存中" : "保存", icon: saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-3.5 w-3.5" />, active: dirty, disabled: !dirty || saving, run: () => { void handleSave(); } },
    ] : []),
    { id: "copy", label: copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制内容", shortLabel: copyState === "copied" ? "已复制" : "复制", icon: copyState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />, active: copyState === "copied", disabled: isLoading, run: () => { void handleCopyAll(); } },
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
      <div ref={mobileToolbarMeasureRef} className="flex min-h-[3.25rem] shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-1.5 md:min-h-12 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
          <span className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={name}>{name}</span>
          {isMarkdown ? <span className="hidden rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 sm:inline dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">Markdown</span> : null}
        </div>
        <div className="hidden min-w-0 shrink items-center gap-1 text-xs text-slate-500 dark:text-slate-400 md:flex">
          <div className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950" role="tablist" aria-label={isMarkdown ? "Markdown 显示模式" : "文本显示模式"}>
            {isMarkdown ? <button type="button" role="tab" aria-selected={viewMode === "preview"} onClick={() => setViewMode("preview")} className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 transition ${viewMode === "preview" ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}><Eye className="h-3.5 w-3.5" />预览</button> : <button type="button" role="tab" aria-selected={viewMode === "code"} onClick={() => setViewMode("code")} className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 transition ${viewMode === "code" ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}><Eye className="h-3.5 w-3.5" />查看</button>}
            {canEdit && onSave ? <button type="button" role="tab" aria-selected={viewMode === "edit"} onClick={() => setViewMode("edit")} className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 transition ${viewMode === "edit" ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}><Pencil className="h-3.5 w-3.5" />编辑</button> : isMarkdown ? <button type="button" role="tab" aria-selected={viewMode === "code"} onClick={() => setViewMode("code")} className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 transition ${viewMode === "code" ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}><Code2 className="h-3.5 w-3.5" />源码</button> : null}
          </div>
          {canEdit && onSave ? <button type="button" onClick={() => void handleSave()} disabled={!dirty || saving} className={`ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 font-medium transition ${dirty ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500" : "border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500"} disabled:cursor-not-allowed`}>{saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-3.5 w-3.5" />}{saving ? "保存中" : dirty ? "保存修改" : "已保存"}</button> : null}
          <span className="mx-2 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
          <button type="button" onClick={() => void handleCopyAll()} disabled={isLoading} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="复制内容">{copyState === "copied" ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}<span>{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制内容"}</span></button>
          {isMarkdown ? <button type="button" onClick={() => setOutlineOpen((open) => !open)} disabled={viewMode !== "preview" || !headings.length} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 transition disabled:cursor-not-allowed disabled:opacity-35 ${outlineOpen ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"}`} aria-pressed={outlineOpen}><List className="h-3.5 w-3.5" />大纲</button> : null}
          {isMarkdown ? <button type="button" onClick={() => setImagesEnabled((enabled) => !enabled)} disabled={viewMode !== "preview" || !hasMarkdownImages} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 transition disabled:cursor-not-allowed disabled:opacity-35 ${imagesEnabled ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"}`} aria-pressed={imagesEnabled}><ImageIcon className="h-3.5 w-3.5" />{imagesEnabled ? "隐藏图片" : "显示图片"}</button> : null}
          <span className="ml-2 shrink-0 tabular-nums text-[11px] text-slate-400 dark:text-slate-500">{isLoading ? "加载中" : `${lineCount} 行 · ${characterCount} 字`}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 text-slate-500 dark:text-slate-400 md:hidden">
          {mobileActions.slice(0, mobileVisibleActionCount).map((action) => <button key={action.id} type="button" onClick={action.run} disabled={action.disabled} className={`inline-flex h-10 w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-md leading-none disabled:opacity-40 ${action.active ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title={action.label} aria-label={action.label}>{action.icon}<span className="text-[9px] leading-[0.75rem]">{action.shortLabel}</span></button>)}
          {mobileOverflowActions.length ? <div ref={mobileMoreRef} className="relative shrink-0"><button type="button" onClick={() => setMobileMoreOpen((open) => !open)} className={`inline-flex h-10 w-11 flex-col items-center justify-center gap-1 rounded-md leading-none ${mobileMoreOpen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title="更多文本工具" aria-label="更多文本工具" aria-expanded={mobileMoreOpen}><MoreHorizontal className="h-4 w-4" /><span className="text-[9px] leading-[0.75rem]">更多</span></button>{mobileMoreOpen ? <div className="absolute right-0 top-11 z-40 grid w-40 gap-0.5 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{mobileOverflowActions.map((action) => <button key={action.id} type="button" disabled={action.disabled} onClick={() => { action.run(); setMobileMoreOpen(false); }} className={`flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs disabled:opacity-40 ${action.active ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`}>{action.icon}<span>{action.label}</span></button>)}</div> : null}</div> : null}
        </div>
      </div>
      {saveError ? <div role="alert" className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">{saveError}</div> : null}
      {isLoading ? <LoadingState variant="preview" label="正在加载文本内容…" className="min-h-0 flex-1 bg-[#fbfcfe] dark:bg-gray-950" /> : viewMode === "edit" ? (
        <div className="relative flex min-h-0 flex-1 flex-col bg-[#fbfcfe] dark:bg-gray-950">
          {isMarkdown ? <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-white px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800 dark:bg-slate-900" role="toolbar" aria-label="Markdown 格式工具栏">
            <button type="button" onClick={handleUndo} disabled={!historyState.undo} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" title="撤销（Ctrl/⌘+Z）"><Undo2 className="h-4 w-4" /><span className="hidden lg:inline">撤销</span></button>
            <button type="button" onClick={handleRedo} disabled={!historyState.redo} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" title="重做（Ctrl/⌘+Shift+Z）"><Redo2 className="h-4 w-4" /><span className="hidden lg:inline">重做</span></button>
            <span className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
            <button type="button" onClick={() => setFormatMenu((current) => current === "heading" ? null : "heading")} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs ${formatMenu === "heading" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"}`} title="选择标题级别"><Heading2 className="h-4 w-4" /><span className="hidden lg:inline">标题</span><ChevronDown className="h-3 w-3" /></button>
            {[
              { id: "bold", label: "粗体", icon: <Bold className="h-4 w-4" /> },
              { id: "italic", label: "斜体", icon: <Italic className="h-4 w-4" /> },
              { id: "strike", label: "删除线", icon: <Strikethrough className="h-4 w-4" /> },
              { id: "link", label: "链接", icon: <Link className="h-4 w-4" /> },
              { id: "quote", label: "引用", icon: <Quote className="h-4 w-4" /> },
              { id: "list", label: "无序列表", icon: <List className="h-4 w-4" /> },
              { id: "ordered", label: "有序列表", icon: <ListOrdered className="h-4 w-4" /> },
              { id: "task", label: "任务列表", icon: <ListChecks className="h-4 w-4" /> },
            ].map((action) => <button key={action.id} type="button" onClick={() => applyMarkdownFormat(action.id as "bold" | "italic" | "strike" | "link" | "quote" | "list" | "ordered" | "task")} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" title={action.label} aria-label={action.label}>{action.icon}<span className="hidden lg:inline">{action.label}</span></button>)}
            <button type="button" onClick={() => setFormatMenu((current) => current === "code" ? null : "code")} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs ${formatMenu === "code" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"}`} title="选择代码格式"><Code2 className="h-4 w-4" /><span className="hidden lg:inline">代码</span><ChevronDown className="h-3 w-3" /></button>
            <button type="button" onClick={() => setFormatMenu((current) => current === "table" ? null : "table")} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs ${formatMenu === "table" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"}`} title="插入表格"><Table2 className="h-4 w-4" /><span className="hidden lg:inline">表格</span><ChevronDown className="h-3 w-3" /></button>
            <button type="button" onClick={() => applyMarkdownFormat("rule")} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" title="分隔线"><Minus className="h-4 w-4" /><span className="hidden lg:inline">分隔线</span></button>
            <span className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
            <button type="button" onClick={() => { setFindOpen((open) => !open); setFormatMenu(null); }} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${findOpen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"}`} title="查找替换（Ctrl/⌘+F）"><Search className="h-4 w-4" /><span className="hidden lg:inline">查找替换</span></button>
          </div> : null}
          {formatMenu ? <div ref={formatMenuRef} className={`absolute top-11 z-50 max-w-[calc(100%_-_1rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900 ${formatMenu === "table" ? "right-2 w-52" : formatMenu === "code" ? "left-2 w-72" : "left-2 w-56"}`}>
            {formatMenu === "heading" ? <><div className="mb-1.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">标题级别</div><div className="grid grid-cols-3 gap-1">{[1, 2, 3, 4, 5, 6].map((level) => <button key={level} type="button" onClick={() => { applyMarkdownFormat("heading", { headingLevel: level }); setFormatMenu(null); }} className="flex h-9 items-center justify-center rounded-md text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-950/50 dark:hover:text-blue-300">H{level}</button>)}</div></> : null}
            {formatMenu === "code" ? <><button type="button" onClick={() => { applyMarkdownFormat("code"); setFormatMenu(null); }} className="mb-1 flex h-9 w-full items-center gap-2 rounded-md px-2 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"><Code2 className="h-3.5 w-3.5" />行内代码</button><div className="mb-1.5 mt-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">代码块语言</div><div className="grid grid-cols-3 gap-1">{codeLanguagePresets.map((language) => <button key={language.label} type="button" onClick={() => { applyMarkdownFormat("code", { codeLanguage: language.value }); setFormatMenu(null); }} className="h-8 rounded-md px-1 text-[11px] text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-blue-950/50 dark:hover:text-blue-300">{language.label}</button>)}</div></> : null}
            {formatMenu === "table" ? <><div className="flex items-center justify-between px-0.5 text-[11px]"><span className="font-medium text-slate-500 dark:text-slate-400">表格大小</span><span className="tabular-nums text-blue-600 dark:text-blue-300">{tableSize.rows} 行 × {tableSize.columns} 列</span></div><div className="mt-1.5 grid grid-cols-6 gap-0.5">{Array.from({ length: 5 }, (_, rowIndex) => Array.from({ length: 6 }, (_, columnIndex) => { const rows = rowIndex + 1; const columns = columnIndex + 1; const active = rows <= tableSize.rows && columns <= tableSize.columns; return <button key={`${rows}-${columns}`} type="button" onMouseEnter={() => setTableSize({ rows, columns })} onFocus={() => setTableSize({ rows, columns })} onClick={() => { applyMarkdownFormat("table", { tableRows: rows, tableColumns: columns, tableAlignment }); setFormatMenu(null); }} className={`aspect-square rounded-sm border ${active ? "border-blue-400 bg-blue-100 dark:border-blue-600 dark:bg-blue-950/70" : "border-slate-200 bg-slate-50 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800"}`} aria-label={`插入 ${rows} 行 ${columns} 列表格`} />; }))}</div><div className="mb-1 mt-2 px-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">内容对齐</div><div className="grid grid-cols-3 gap-0.5">{(["left", "center", "right"] as const).map((alignment) => <button key={alignment} type="button" onClick={() => setTableAlignment(alignment)} className={`h-7 rounded-md text-[11px] ${tableAlignment === alignment ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{alignment === "left" ? "左对齐" : alignment === "center" ? "居中" : "右对齐"}</button>)}</div></> : null}
          </div> : null}
          {findOpen ? <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-8 min-w-44 flex-1 items-center rounded-md border border-slate-200 bg-white focus-within:border-blue-400 dark:border-slate-700 dark:bg-slate-950"><Search className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" /><input ref={findInputRef} value={findText} onChange={(event) => setFindText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") findNextMatch(event.shiftKey ? -1 : 1); if (event.key === "Escape") setFindOpen(false); }} placeholder="查找" className="min-w-0 flex-1 bg-transparent px-2 outline-none" /><span className="pr-2 text-[10px] tabular-nums text-slate-400">{findMatchCount}</span></div>
            <button type="button" onClick={() => findNextMatch(-1)} disabled={!findText} className="h-8 rounded-md px-2 text-slate-600 hover:bg-white disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800">上一个</button>
            <button type="button" onClick={() => findNextMatch(1)} disabled={!findText} className="h-8 rounded-md px-2 text-slate-600 hover:bg-white disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800">下一个</button>
            <div className="flex h-8 min-w-40 flex-1 items-center rounded-md border border-slate-200 bg-white focus-within:border-blue-400 dark:border-slate-700 dark:bg-slate-950"><input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") replaceCurrentMatch(); }} placeholder="替换为" className="min-w-0 flex-1 bg-transparent px-2 outline-none" /></div>
            <button type="button" onClick={replaceCurrentMatch} disabled={!findText} className="h-8 rounded-md px-2 text-slate-600 hover:bg-white disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800">替换</button>
            <button type="button" onClick={replaceAllMatches} disabled={!findText || !findMatchCount} className="h-8 rounded-md px-2 text-slate-600 hover:bg-white disabled:opacity-35 dark:text-slate-300 dark:hover:bg-slate-800">全部替换</button>
            <button type="button" onClick={() => setMatchCase((value) => !value)} className={`h-8 rounded-md px-2 ${matchCase ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800"}`} aria-pressed={matchCase}>区分大小写</button>
            <button type="button" onClick={() => setFindOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="关闭查找替换"><X className="h-4 w-4" /></button>
          </div> : null}
          <div className={`relative grid min-h-0 flex-1 ${isMarkdown ? "md:grid-cols-2" : "grid-cols-1"}`}>
            <section className={`relative min-h-0 min-w-0 ${isMarkdown ? "md:border-r md:border-slate-200 md:dark:border-slate-800" : ""}`} aria-label={isMarkdown ? "Markdown 源文编辑" : "文本编辑"}>
              {isMarkdown ? <div className="pointer-events-none absolute left-4 top-2 z-10 hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 md:block dark:bg-slate-800 dark:text-slate-400">源码</div> : null}
              <textarea
                ref={editorRef}
                value={draftText}
                onChange={(event) => {
                  const value = event.target.value;
                  const cursor = event.target.selectionStart;
                  commitDraftText(value, "typing");
                  window.requestAnimationFrame(() => syncLivePreviewToCursor(cursor, value));
                }}
                onSelect={(event) => syncLivePreviewToCursor(event.currentTarget.selectionStart, event.currentTarget.value)}
                onScroll={syncLivePreviewToEditorScroll}
                onKeyDown={handleEditorKeyDown}
                spellCheck={isMarkdown}
                aria-label={`编辑 ${name}`}
                className={`h-full w-full resize-none overscroll-contain bg-transparent p-4 font-mono text-[13px] leading-6 text-slate-800 outline-none selection:bg-blue-200/70 sm:px-6 dark:text-slate-100 dark:selection:bg-blue-800/70 ${isMarkdown ? "md:pt-9" : ""}`}
              />
              <div className="pointer-events-none absolute bottom-3 right-4 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-400">{dirty ? "有未保存修改 · Ctrl/⌘+S 保存" : "已保存"}</div>
            </section>
            {isMarkdown ? <section className="hidden min-h-0 min-w-0 flex-col bg-white md:flex dark:bg-slate-950" aria-label="Markdown 实时预览">
              <div ref={(node) => { livePreviewRef.current = node; renderedContentRef.current = node; }} className="min-h-0 flex-1 overflow-auto overscroll-contain px-6 py-5"><div className="mx-auto max-w-3xl text-[15px]">
                {hasMarkdownImages && !imagesEnabled ? <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />图片默认不加载，可在顶部“图片”操作中启用。</div> : null}
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} urlTransform={safeMarkdownUrl} components={markdownComponents}>{displayedText}</ReactMarkdown>
              </div></div>
            </section> : null}
          </div>
        </div>
      ) : isMarkdown && viewMode === "preview" ? (
        <div className="relative flex min-h-0 flex-1 overscroll-contain bg-[#fbfcfe] dark:bg-gray-950">
          {outlineOpen ? <aside className="hidden w-56 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-950"><div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300"><List className="h-3.5 w-3.5" />文档大纲</div><nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">{headings.map((heading) => <button type="button" key={heading.id} onClick={() => scrollToHeading(heading)} className="block w-full rounded px-2 py-1.5 text-left text-xs leading-5 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" style={{ paddingLeft: `${8 + Math.max(0, heading.level - 1) * 10}px` }}>{heading.text}</button>)}</nav></aside> : null}
          {outlineOpen ? <div className="absolute inset-0 z-20 md:hidden"><button type="button" className="absolute inset-0 bg-slate-950/25" onClick={() => setOutlineOpen(false)} aria-label="关闭文档大纲" /><aside className="absolute inset-y-0 left-0 flex w-[min(18rem,84vw)] flex-col border-r border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"><div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"><List className="h-3.5 w-3.5" />文档大纲</span><button type="button" onClick={() => setOutlineOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="关闭大纲"><X className="h-4 w-4" /></button></div><nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">{headings.map((heading) => <button type="button" key={heading.id} onClick={() => scrollToHeading(heading)} className="block w-full rounded px-2 py-2 text-left text-xs leading-5 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" style={{ paddingLeft: `${8 + Math.max(0, heading.level - 1) * 10}px` }}>{heading.text}</button>)}</nav></aside></div> : null}
          <div ref={renderedContentRef} className="min-w-0 flex-1 overflow-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-7"><div className="mx-auto max-w-4xl text-[15px]" >
            {hasMarkdownImages && !imagesEnabled ? <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />文档中的图片默认未加载，点击“加载图片”后才会请求图片地址。</div> : null}
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} urlTransform={safeMarkdownUrl} components={markdownComponents}>{displayedText}</ReactMarkdown>
          </div></div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[#fbfcfe] dark:bg-gray-950"><pre className="min-w-max p-0 text-[13px] leading-6 text-slate-800 dark:text-slate-100"><code className="block py-3">{lines.map((line, idx) => <span key={idx} className="flex min-h-6"><span className="sticky left-0 shrink-0 select-none border-r border-slate-200 bg-slate-50 px-2 text-right font-mono tabular-nums text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500" style={{ width: lineNumberWidth }} aria-hidden="true">{idx + 1}</span><span className="px-4 font-mono whitespace-pre">{highlightLine(line, ext).map((token, tokenIdx) => <span key={tokenIdx} className={token.className}>{token.text}</span>)}</span></span>)}</code></pre></div>
      )}
    </div>
  );
}
