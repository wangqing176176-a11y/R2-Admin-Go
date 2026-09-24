"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, List, Minus, Moon, Plus, Sun, X } from "lucide-react";
import type { Book, Location, NavItem, Rendition } from "epubjs";
import LoadingState from "./LoadingState";

type ReaderTheme = "light" | "dark";

const themeRules = (theme: ReaderTheme) => ({
  html: {
    color: theme === "dark" ? "#e5e7eb !important" : "#1f2937 !important",
    background: theme === "dark" ? "#111827 !important" : "#ffffff !important",
    "color-scheme": `${theme} !important`,
  },
  body: {
    color: theme === "dark" ? "#e5e7eb !important" : "#1f2937 !important",
    background: theme === "dark" ? "#111827 !important" : "#ffffff !important",
    "line-height": "1.75 !important",
    "padding-left": "4% !important",
    "padding-right": "4% !important",
  },
  "body, p, div, section, article, span, li, dt, dd, td, th, h1, h2, h3, h4, h5, h6": {
    color: theme === "dark" ? "#e5e7eb !important" : "#1f2937 !important",
  },
  "section, article, main": {
    background: "transparent !important",
  },
  a: { color: theme === "dark" ? "#93c5fd !important" : "#2563eb !important" },
  "pre, code, kbd, samp": {
    color: theme === "dark" ? "#dbeafe !important" : "#1e3a5f !important",
    background: theme === "dark" ? "#1e293b !important" : "#f1f5f9 !important",
  },
  blockquote: {
    color: theme === "dark" ? "#cbd5e1 !important" : "#475569 !important",
    "border-color": theme === "dark" ? "#475569 !important" : "#cbd5e1 !important",
  },
  "table, td, th, hr": {
    "border-color": theme === "dark" ? "#475569 !important" : "#d1d5db !important",
  },
  "table, thead, tbody, tr, td, th": {
    background: "transparent !important",
  },
  img: { "max-width": "100% !important", "object-fit": "contain !important" },
});

const normalizeHref = (value: string) => {
  const path = String(value ?? "").split("#", 1)[0];
  try {
    return decodeURIComponent(path).replace(/^\.\//, "");
  } catch {
    return path.replace(/^\.\//, "");
  }
};

const findChapterLabel = (items: NavItem[], href: string): string => {
  const normalized = normalizeHref(href);
  for (const item of items) {
    const candidate = normalizeHref(item.href);
    if (candidate && normalized && (normalized.endsWith(candidate) || candidate.endsWith(normalized))) return String(item.label ?? "").trim();
    const nested = findChapterLabel(item.subitems ?? [], href);
    if (nested) return nested;
  }
  return "";
};

const MAX_EPUB_BYTES = 200 * 1024 * 1024;

export default function LocalEpubPreview({ sourceUrl, name, size }: { sourceUrl: string; name: string; size?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const readerThemeRef = useRef<ReaderTheme>("light");
  const manualThemeRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [toc, setToc] = useState<NavItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>("light");
  const [fontSize, setFontSize] = useState(100);
  const [title, setTitle] = useState(name.replace(/\.epub$/i, ""));
  const [creator, setCreator] = useState("");
  const [chapter, setChapter] = useState("");
  const [pageLabel, setPageLabel] = useState("");
  const tooLarge = Number.isFinite(size ?? NaN) && (size ?? 0) > MAX_EPUB_BYTES;

  useEffect(() => {
    const root = window.document.documentElement;
    const syncWithAppTheme = () => {
      if (manualThemeRef.current) return;
      const nextTheme: ReaderTheme = root.classList.contains("dark") ? "dark" : "light";
      readerThemeRef.current = nextTheme;
      setTheme(nextTheme);
    };
    syncWithAppTheme();
    const observer = new MutationObserver(syncWithAppTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const hostElement = hostRef.current;
    const controller = new AbortController();
    let disposed = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;
    setStatus("loading");
    setError("");
    setToc([]);
    setChapter("");
    setPageLabel("");
    if (tooLarge) {
      setError("EPUB 超过 200 MB。为避免浏览器占用过多内存，请下载后使用本地阅读器打开。");
      setStatus("error");
      return () => controller.abort();
    }

    void Promise.all([
      import("epubjs"),
      fetch(sourceUrl, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`EPUB 文件读取失败（${response.status}）`);
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (contentLength > MAX_EPUB_BYTES) throw new Error("EPUB 超过 200 MB。为避免浏览器占用过多内存，请下载后使用本地阅读器打开。");
        return response.arrayBuffer();
      }),
    ]).then(async ([module, buffer]) => {
      if (disposed) return;
      book = module.default(buffer);
      bookRef.current = book;
      const [navigation, metadata] = await Promise.all([book.loaded.navigation, book.loaded.metadata]);
      if (disposed || !hostElement) return;
      setToc(navigation.toc ?? []);
      setTitle(metadata.title?.trim() || name.replace(/\.epub$/i, ""));
      setCreator(metadata.creator?.trim() || "");

      rendition = book.renderTo(hostElement, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "auto",
        minSpreadWidth: 900,
        allowScriptedContent: false,
      });
      renditionRef.current = rendition;
      rendition.themes.default(themeRules(readerThemeRef.current));
      rendition.themes.fontSize("100%");
      rendition.on("relocated", (location: Location) => {
        if (disposed) return;
        const href = location.start?.href ?? "";
        setChapter(findChapterLabel(navigation.toc ?? [], href));
        const displayed = location.start?.displayed;
        setPageLabel(displayed?.total ? `${displayed.page} / ${displayed.total}` : "");
      });
      await rendition.display();
      if (!disposed) setStatus("ready");
    }).catch((reason) => {
      if (disposed || (reason as { name?: unknown })?.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "EPUB 内容解析失败");
      setStatus("error");
    });

    return () => {
      disposed = true;
      controller.abort();
      book?.destroy();
      renditionRef.current = null;
      bookRef.current = null;
      hostElement?.replaceChildren();
    };
  }, [name, sourceUrl, tooLarge]);

  useEffect(() => {
    readerThemeRef.current = theme;
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.themes.default(themeRules(theme));
  }, [theme]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  const goTo = (href: string) => {
    void renditionRef.current?.display(href);
    setTocOpen(false);
  };

  const toggleReaderTheme = () => {
    manualThemeRef.current = true;
    setTheme((value) => value === "light" ? "dark" : "light");
  };

  const renderToc = (items: NavItem[], depth = 0): React.ReactNode => items.map((item) => (
    <div key={`${item.id}-${item.href}`}>
      <button
        type="button"
        onClick={() => goTo(item.href)}
        className="w-full truncate rounded-md py-2 pr-2 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-200 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        title={item.label}
      >
        {item.label}
      </button>
      {item.subitems?.length ? renderToc(item.subitems, depth + 1) : null}
    </div>
  ));

  if (status === "error") {
    return <div className="flex h-full items-center justify-center bg-white px-6 text-center dark:bg-gray-950"><div className="max-w-md"><BookOpen className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" /><div className="mt-4 font-medium text-gray-800 dark:text-gray-100">电子书读取失败</div><div className="mt-2 text-sm leading-6 text-red-600 dark:text-red-300">{error}</div></div></div>;
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-gray-50 text-gray-800 dark:bg-slate-950 dark:text-gray-100">
      {tocOpen ? <button type="button" className="absolute inset-0 z-20 bg-slate-950/55 backdrop-blur-[1px] md:hidden" onClick={() => setTocOpen(false)} aria-label="关闭电子书目录" /> : null}
      <aside className={`${tocOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-30 w-[min(86vw,20rem)] flex-col border-r border-gray-200 bg-white shadow-xl md:relative md:flex md:w-64 md:shrink-0 md:shadow-none dark:border-slate-800 dark:bg-slate-900`}>
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-200 bg-gray-50/80 px-3 dark:border-slate-800 dark:bg-slate-900">
          <BookOpen className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium" title={title}>{title}</div>{creator ? <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">{creator}</div> : null}</div>
          <button type="button" onClick={() => setTocOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 md:hidden dark:hover:bg-gray-800" aria-label="关闭目录"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">{toc.length ? renderToc(toc) : <div className="px-4 py-8 text-center text-xs text-gray-400">此电子书没有可用目录</div>}</div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-slate-950">
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-gray-200 bg-white/95 px-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <button type="button" onClick={() => setTocOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 md:hidden dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="打开目录"><List className="h-4 w-4" /></button>
          <button type="button" onClick={() => void renditionRef.current?.prev()} disabled={status !== "ready"} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-35 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="上一页"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => void renditionRef.current?.next()} disabled={status !== "ready"} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-35 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="下一页"><ChevronRight className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 px-2 text-center"><div className="truncate text-xs font-medium" title={chapter || title}>{chapter || title}</div>{pageLabel ? <div className="text-[10px] text-gray-400 dark:text-gray-500">{pageLabel}</div> : null}</div>
          <button type="button" onClick={() => setFontSize((value) => Math.max(70, value - 10))} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="缩小字号"><Minus className="h-4 w-4" /></button>
          <span className="hidden w-11 text-center text-[10px] text-gray-500 sm:block dark:text-gray-400">{fontSize}%</span>
          <button type="button" onClick={() => setFontSize((value) => Math.min(180, value + 10))} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="放大字号"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={toggleReaderTheme} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title={theme === "light" ? "夜间阅读" : "日间阅读"}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button>
        </div>
        <div className={`relative min-h-0 flex-1 overflow-hidden transition-colors ${theme === "dark" ? "bg-[#111827]" : "bg-white"}`}>
          <div ref={hostRef} className="h-full w-full" />
          {status === "loading" ? <LoadingState variant="preview" label="正在解析 EPUB…" className={`absolute inset-0 ${theme === "dark" ? "bg-[#111827] [&_span]:text-slate-300" : "bg-white"}`} /> : null}
        </div>
      </main>
    </div>
  );
}
