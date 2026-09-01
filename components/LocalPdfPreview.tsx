"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Images, ListTree, Maximize, Maximize2, Menu, MoreHorizontal, PanelLeftClose, Printer, RefreshCw, RotateCw, Rows3, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { useResponsivePreviewToolbar } from "./useResponsivePreviewToolbar";

type PdfDocument = Awaited<ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>["promise"]>;
type PdfOutline = Awaited<ReturnType<PdfDocument["getOutline"]>>;
type PdfOutlineItem = PdfOutline[number];
type SearchResult = { page: number; snippet: string; matches: number };
type PdfTextItem = { str: string; transform: number[]; width: number; height: number };
type PdfTextHighlight = { left: number; top: number; width: number; height: number };
type FitMode = "width" | "page" | "custom";
type ViewMode = "single" | "continuous";
type PdfRenderTask = { cancel: () => void; promise: Promise<void> };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const IOS_MAX_CANVAS_PIXELS = 12_000_000;
const isIOSDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

export default function LocalPdfPreview({ sourceUrl, name = "document.pdf" }: { sourceUrl: string; name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const mobileMoreRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  const renderRunRef = useRef(0);
  const searchRunRef = useRef(0);
  const currentPageRef = useRef(1);
  const textItemsCacheRef = useRef(new Map<number, PdfTextItem[]>());
  const continuousPageRefs = useRef(new Map<number, HTMLDivElement>());
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [outline, setOutline] = useState<PdfOutline>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [renderedScale, setRenderedScale] = useState(1);
  const [zoomEditing, setZoomEditing] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const [fitMode, setFitMode] = useState<FitMode>("custom");
  const [viewMode, setViewMode] = useState<ViewMode>("continuous");
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"pages" | "outline" | "search">("pages");
  const [expandedOutline, setExpandedOutline] = useState(() => new Set<string>());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [textHighlights, setTextHighlights] = useState<PdfTextHighlight[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [viewportVersion, setViewportVersion] = useState(0);

  const loadTextItems = useCallback(async (page: Awaited<ReturnType<PdfDocument["getPage"]>>) => {
    const content = await page.getTextContent();
    return content.items.flatMap((item) => {
      if (!("str" in item) || !item.str) return [];
      return [{
        str: item.str,
        transform: item.transform,
        width: Number(item.width ?? 0),
        height: Number(item.height ?? Math.abs(item.transform[3] ?? 10)),
      }];
    });
  }, []);

  const getTextItems = useCallback(async (page: number) => {
    const cached = textItemsCacheRef.current.get(page);
    if (cached) return cached;
    if (!pdfDocument) return [];
    const items = await loadTextItems(await pdfDocument.getPage(page));
    textItemsCacheRef.current.set(page, items);
    return items;
  }, [loadTextItems, pdfDocument]);

  const goToPage = (page: number) => {
    if (!pdfDocument) return;
    const next = clamp(Math.round(page), 1, pdfDocument.numPages);
    setPageNumber(next);
    setPageInput(String(next));
    if (viewMode === "continuous") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        continuousPageRefs.current.get(next)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    }
  };

  const changeViewMode = (next: ViewMode) => {
    const currentPage = pageNumber;
    setViewMode(next);
    if (next === "continuous") {
      if (window.matchMedia("(max-width: 767px)").matches) setFitMode("width");
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        continuousPageRefs.current.get(currentPage)?.scrollIntoView({ block: "start" });
      }));
    }
  };

  const registerContinuousPage = useCallback((page: number, node: HTMLDivElement | null) => {
    if (node) continuousPageRefs.current.set(page, node);
    else continuousPageRefs.current.delete(page);
  }, []);

  const handleContinuousScale = useCallback((page: number, scale: number) => {
    if (page === currentPageRef.current) setRenderedScale(scale);
  }, []);

  useEffect(() => {
    currentPageRef.current = pageNumber;
  }, [pageNumber]);

  const applyPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) goToPage(parsed);
    else setPageInput(String(pageNumber));
  };

  const changeZoom = (delta: number) => {
    setFitMode("custom");
    setZoom(clamp((fitMode === "custom" ? zoom : renderedScale) + delta, 0.25, 4));
  };

  const startZoomEditing = () => {
    setZoomInput(String(Math.round(renderedScale * 100)));
    setZoomEditing(true);
  };

  const applyZoomInput = () => {
    const parsed = Number.parseFloat(zoomInput);
    if (Number.isFinite(parsed)) {
      setFitMode("custom");
      setZoom(clamp(parsed / 100, 0.25, 4));
    }
    setZoomEditing(false);
  };

  const openOutlineDestination = async (item: PdfOutlineItem) => {
    if (!pdfDocument) return;
    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const destination = typeof item.dest === "string" ? await pdfDocument.getDestination(item.dest) : item.dest;
      if (!destination?.length) return;
      goToPage((await pdfDocument.getPageIndex(destination[0])) + 1);
    } catch {
      // Ignore malformed outline entries while keeping the document usable.
    }
  };

  const runSearch = async () => {
    if (!pdfDocument || !searchQuery.trim()) {
      setActiveSearchQuery("");
      setSearchResults([]);
      return;
    }
    const runId = ++searchRunRef.current;
    const query = searchQuery.trim().toLocaleLowerCase();
    setActiveSearchQuery(query);
    setSearching(true);
    setSearchResults([]);
    const results: SearchResult[] = [];
    try {
      for (let page = 1; page <= pdfDocument.numPages; page += 1) {
        if (searchRunRef.current !== runId) return;
        const text = (await getTextItems(page)).map((item) => item.str).join(" ").replace(/\s+/g, " ");
        const lowerText = text.toLocaleLowerCase();
        const first = lowerText.indexOf(query);
        if (first < 0) continue;
        let matches = 0;
        for (let index = first; index >= 0; index = lowerText.indexOf(query, index + query.length)) matches += 1;
        const start = Math.max(0, first - 36);
        const end = Math.min(text.length, first + query.length + 64);
        results.push({ page, matches, snippet: `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}` });
        setSearchResults([...results]);
      }
    } finally {
      if (searchRunRef.current === runId) setSearching(false);
    }
  };

  const clearSearch = () => {
    searchRunRef.current += 1;
    setSearchQuery("");
    setActiveSearchQuery("");
    setSearchResults([]);
    setSearching(false);
  };

  const downloadPdf = () => {
    const link = window.document.createElement("a");
    link.href = sourceUrl;
    link.download = name;
    link.click();
  };

  const printPdf = () => {
    const frame = window.document.createElement("iframe");
    Object.assign(frame.style, { position: "fixed", width: "1px", height: "1px", opacity: "0" });
    frame.src = sourceUrl;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 30_000);
    };
    window.document.body.appendChild(frame);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.innerWidth >= 768) setSidebarOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
    let disposed = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    searchRunRef.current += 1;
    textItemsCacheRef.current.clear();
    setLoading(true);
    setError("");
    setPdfDocument(null);
    setOutline([]);
    setPageNumber(1);
    setPageInput("1");
    setZoom(1);
    setViewMode("continuous");
    setFitMode(window.matchMedia("(max-width: 767px)").matches ? "width" : "custom");
    setRotation(0);
    setActiveSearchQuery("");
    setSearchResults([]);
    setTextHighlights([]);
    setCanvasSize({ width: 0, height: 0 });

    void (async () => {
      const ios = isIOSDevice();
      const pdfjs = ios ? await import("pdfjs-dist/legacy/build/pdf.mjs") : await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = ios
        ? new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString()
        : new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const task = pdfjs.getDocument({
        url: sourceUrl,
        ...(ios ? {
          isImageDecoderSupported: false,
          isOffscreenCanvasSupported: false,
          useWasm: false,
        } : {}),
      });
      loadingTask = task;
      try {
        const nextDocument = await task.promise;
        if (disposed) return;
        setPdfDocument(nextDocument);
        setLoading(false);
        const nextOutline = await nextDocument.getOutline().catch(() => [] as PdfOutline);
        if (!disposed) {
          setOutline(nextOutline ?? []);
          setExpandedOutline(new Set((nextOutline ?? []).map((_, index) => String(index))));
        }
      } catch (reason) {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "PDF 加载失败");
          setLoading(false);
        }
      }
    })().catch((reason) => {
      if (!disposed) {
        setError(reason instanceof Error ? reason.message : "PDF 加载失败");
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      searchRunRef.current += 1;
      renderRunRef.current += 1;
      renderTaskRef.current?.cancel();
      void loadingTask?.destroy();
    };
  }, [sourceUrl]);

  useEffect(() => {
    const target = canvasAreaRef.current;
    if (!target) return;
    const updateSize = () => {
      setViewerSize({ width: target.clientWidth, height: target.clientHeight });
      setViewportVersion((value) => value + 1);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (viewMode !== "continuous" || !pdfDocument || !canvasAreaRef.current) return;
    const root = canvasAreaRef.current;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => Math.abs(left.boundingClientRect.top - root.getBoundingClientRect().top) - Math.abs(right.boundingClientRect.top - root.getBoundingClientRect().top));
      const page = Number((visible[0]?.target as HTMLElement | undefined)?.dataset.pdfPage);
      if (Number.isFinite(page)) {
        setPageNumber(page);
        setPageInput(String(page));
      }
    }, { root, rootMargin: "-8% 0px -76% 0px", threshold: [0, 0.01] });
    continuousPageRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pdfDocument, viewMode]);

  useEffect(() => {
    if (viewMode !== "single" || !pdfDocument || !canvasRef.current || !canvasAreaRef.current) return;
    let disposed = false;
    const runId = ++renderRunRef.current;
    let localRenderTask: PdfRenderTask | null = null;
    void (async () => {
      const previousTask = renderTaskRef.current;
      if (previousTask) {
        previousTask.cancel();
        await previousTask.promise.catch(() => undefined);
      }
      if (disposed || renderRunRef.current !== runId || !canvasRef.current || !canvasAreaRef.current) return;
      const page = await pdfDocument.getPage(pageNumber);
      if (disposed || renderRunRef.current !== runId || !canvasRef.current || !canvasAreaRef.current) return;
      const baseViewport = page.getViewport({ scale: 1, rotation });
      const availableWidth = Math.max(240, canvasAreaRef.current.clientWidth - 32);
      const availableHeight = Math.max(240, canvasAreaRef.current.clientHeight - 32);
      const scale = fitMode === "width" ? availableWidth / baseViewport.width : fitMode === "page" ? Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height) : zoom;
      const safeScale = clamp(scale, 0.1, 6);
      const viewport = page.getViewport({ scale: safeScale, rotation });
      const requestedRatio = Math.min(window.devicePixelRatio || 1, 2);
      const maxRatio = isIOSDevice() ? Math.sqrt(IOS_MAX_CANVAS_PIXELS / Math.max(1, viewport.width * viewport.height)) : requestedRatio;
      const ratio = Math.max(0.1, Math.min(requestedRatio, maxRatio));
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setCanvasSize({ width: viewport.width, height: viewport.height });
      setRenderedScale(safeScale);
      if (isIOSDevice()) await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (disposed || renderRunRef.current !== runId) return;
      localRenderTask = page.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      renderTaskRef.current = localRenderTask;
      await localRenderTask.promise;
      if (renderTaskRef.current === localRenderTask) renderTaskRef.current = null;
    })().catch((reason) => {
      if (!disposed && String((reason as { name?: unknown })?.name ?? "") !== "RenderingCancelledException") setError("PDF 页面渲染失败");
    });
    return () => {
      disposed = true;
      localRenderTask?.cancel();
    };
  }, [fitMode, loading, pageNumber, pdfDocument, rotation, viewMode, viewportVersion, zoom]);

  useEffect(() => {
    if (viewMode !== "single" || !pdfDocument || !activeSearchQuery || !canvasSize.width || !canvasSize.height) {
      setTextHighlights([]);
      return;
    }
    let disposed = false;
    void (async () => {
      const page = await pdfDocument.getPage(pageNumber);
      const items = await getTextItems(pageNumber);
      const viewport = page.getViewport({ scale: renderedScale, rotation });
      const highlights: PdfTextHighlight[] = [];
      for (const item of items) {
        const lowerText = item.str.toLocaleLowerCase();
        for (let index = lowerText.indexOf(activeSearchQuery); index >= 0; index = lowerText.indexOf(activeSearchQuery, index + activeSearchQuery.length)) {
          const itemWidth = Math.max(item.width, 1);
          const startX = item.transform[4] + itemWidth * (index / item.str.length);
          const endX = item.transform[4] + itemWidth * ((index + activeSearchQuery.length) / item.str.length);
          const baseY = item.transform[5];
          const itemHeight = Math.max(item.height, Math.abs(item.transform[3] ?? 10), 4);
          const [startPoint, endPoint] = [
            viewport.convertToViewportPoint(startX, baseY),
            viewport.convertToViewportPoint(endX, baseY + itemHeight),
          ];
          highlights.push({
            left: Math.min(startPoint[0], endPoint[0]),
            top: Math.min(startPoint[1], endPoint[1]),
            width: Math.max(2, Math.abs(endPoint[0] - startPoint[0])),
            height: Math.max(4, Math.abs(endPoint[1] - startPoint[1])),
          });
        }
      }
      if (!disposed) setTextHighlights(highlights);
    })().catch(() => {
      if (!disposed) setTextHighlights([]);
    });
    return () => {
      disposed = true;
    };
  }, [activeSearchQuery, canvasSize.height, canvasSize.width, getTextItems, pageNumber, pdfDocument, renderedScale, rotation, viewMode]);

  const renderOutline = (items: PdfOutline, parentPath = "") => items.map((item, index) => {
    const path = parentPath ? `${parentPath}.${index}` : String(index);
    const hasChildren = item.items.length > 0;
    const expanded = expandedOutline.has(path);
    return <div key={path}><div className="flex items-center rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/50" style={{ paddingLeft: `${path.split(".").length * 8}px` }}><button type="button" disabled={!hasChildren} onClick={() => setExpandedOutline((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; })} className="flex h-7 w-6 shrink-0 items-center justify-center text-gray-400 disabled:opacity-0 dark:text-gray-500" aria-label={expanded ? "折叠目录" : "展开目录"}>{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button><button type="button" onClick={() => void openOutlineDestination(item)} className="min-w-0 flex-1 truncate py-1.5 pr-2 text-left text-xs text-gray-700 dark:text-gray-200" title={item.title}>{item.title || "未命名章节"}</button></div>{hasChildren && expanded ? renderOutline(item.items, path) : null}</div>;
  });

  const mobileActions = [
    { id: "search", label: "查找文档", shortLabel: "查找", icon: <Search className="h-4 w-4" />, active: sidebarOpen && sidebarTab === "search", run: () => { setSidebarOpen(true); setSidebarTab("search"); } },
    { id: "view-mode", label: viewMode === "single" ? "切换连续阅读" : "切换单页阅读", shortLabel: viewMode === "single" ? "连续" : "单页", icon: <Rows3 className="h-4 w-4" />, active: viewMode === "continuous", run: () => changeViewMode(viewMode === "single" ? "continuous" : "single") },
    { id: "print", label: "打印 PDF", shortLabel: "打印", icon: <Printer className="h-4 w-4" />, active: false, run: printPdf },
    { id: "download", label: "下载 PDF", shortLabel: "下载", icon: <Download className="h-4 w-4" />, active: false, run: downloadPdf },
    { id: "fit-width", label: "适合页面宽度", shortLabel: "适宽", icon: <Maximize className="h-4 w-4" />, active: fitMode === "width", run: () => setFitMode("width") },
    { id: "fit-page", label: "显示完整页面", shortLabel: "整页", icon: <Maximize2 className="h-4 w-4" />, active: fitMode === "page", run: () => setFitMode("page") },
    { id: "rotate", label: "顺时针旋转", shortLabel: "旋转", icon: <RotateCw className="h-4 w-4" />, active: false, run: () => setRotation((value) => (value + 90) % 360) },
  ];
  const { measureRef: mobileToolbarMeasureRef, visibleCount: mobileVisibleActionCount } = useResponsivePreviewToolbar({
    fixedWidths: [32, 32, 48, 32, 32, 32],
    actionWidths: mobileActions.map(() => 44),
    moreWidth: 44,
    fallbackVisibleCount: 0,
  });
  const mobileOverflowActions = mobileActions.slice(mobileVisibleActionCount);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-100 text-gray-800 outline-none dark:bg-gray-950 dark:text-gray-100" tabIndex={0} onKeyDown={(event) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowLeft" || (viewMode === "single" && event.key === "PageUp")) goToPage(pageNumber - 1);
      else if (event.key === "ArrowRight" || (viewMode === "single" && event.key === "PageDown")) goToPage(pageNumber + 1);
      else if (event.key === "Home") goToPage(1);
      else if (event.key === "End" && pdfDocument) goToPage(pdfDocument.numPages);
      else if (event.key === "+" || event.key === "=") changeZoom(0.15);
      else if (event.key === "-") changeZoom(-0.15);
    }}>
      <div ref={mobileToolbarMeasureRef} className="relative flex h-11 shrink-0 items-center justify-center gap-0.5 overflow-visible border-b border-gray-200 bg-white px-1 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 lg:hidden">
        <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="显示或隐藏侧栏" aria-label="显示或隐藏侧栏"><Menu className="h-4 w-4" /></button>
        <button type="button" onClick={() => goToPage(pageNumber - 1)} disabled={!pdfDocument || pageNumber <= 1} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="上一页" aria-label="上一页"><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex h-8 w-12 shrink-0 items-center justify-center gap-1">
          <input aria-label="当前页码" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))} onBlur={applyPageInput} onKeyDown={(event) => { if (event.key === "Enter") { applyPageInput(); event.currentTarget.blur(); } }} className="w-6 min-w-0 border-b border-transparent bg-transparent pb-px text-right text-[11px] text-gray-800 outline-none transition-colors focus:border-blue-500 dark:text-gray-100 dark:focus:border-blue-400" />
          <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-500 dark:text-gray-400">/ {pdfDocument?.numPages ?? "--"}</span>
        </div>
        <button type="button" onClick={() => goToPage(pageNumber + 1)} disabled={!pdfDocument || pageNumber >= pdfDocument.numPages} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="下一页" aria-label="下一页"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => changeZoom(-0.15)} disabled={!pdfDocument} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="缩小" aria-label="缩小"><ZoomOut className="h-4 w-4" /></button>
        <button type="button" onClick={() => changeZoom(0.15)} disabled={!pdfDocument} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="放大" aria-label="放大"><ZoomIn className="h-4 w-4" /></button>
        {mobileActions.slice(0, mobileVisibleActionCount).map((action) => <button key={action.id} type="button" onClick={action.run} className={`inline-flex h-10 w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-md leading-none ${action.active ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title={action.label} aria-label={action.label}>{action.icon}<span className="text-[9px] leading-[0.75rem]">{action.shortLabel}</span></button>)}
        {mobileOverflowActions.length ? <div ref={mobileMoreRef} className="relative shrink-0">
          <button type="button" onClick={() => setMobileMoreOpen((value) => !value)} className={`inline-flex h-10 w-11 flex-col items-center justify-center gap-1 rounded-md leading-none ${mobileMoreOpen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="更多 PDF 工具" aria-label="更多 PDF 工具" aria-expanded={mobileMoreOpen}><MoreHorizontal className="h-4 w-4" /><span className="text-[9px] leading-[0.75rem]">更多</span></button>
          {mobileMoreOpen ? (
            <div className="absolute right-0 top-11 z-40 grid w-44 gap-0.5 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-700 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              {mobileOverflowActions.map((action) => <button key={action.id} type="button" onClick={() => { action.run(); setMobileMoreOpen(false); }} className={`flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs ${action.active ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`}>{action.icon}<span>{action.label}</span></button>)}
            </div>
          ) : null}
        </div> : null}
      </div>

      <div className="hidden h-12 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 lg:flex">
        <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="显示或隐藏侧栏"><Menu className="h-4 w-4" /><span>侧栏</span></button>
        <button type="button" onClick={() => changeViewMode(viewMode === "single" ? "continuous" : "single")} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${viewMode === "continuous" ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title={viewMode === "continuous" ? "切换为单页阅读" : "切换为连续阅读"}><Rows3 className="h-4 w-4" /><span>{viewMode === "continuous" ? "连续" : "单页"}</span></button>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />
        <button type="button" onClick={() => goToPage(pageNumber - 1)} disabled={!pdfDocument || pageNumber <= 1} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><ChevronLeft className="h-4 w-4" />上一页</button>
        <div className="flex h-8 shrink-0 items-center px-1"><input aria-label="当前页码" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))} onBlur={applyPageInput} onKeyDown={(event) => { if (event.key === "Enter") { applyPageInput(); event.currentTarget.blur(); } }} className="w-9 border-b border-transparent bg-transparent pb-px text-center text-xs text-gray-800 outline-none transition-colors focus:border-blue-500 dark:text-gray-100 dark:focus:border-blue-400" /><span className="whitespace-nowrap pr-1 text-xs text-gray-500 dark:text-gray-400">/ {pdfDocument?.numPages ?? "--"}</span></div>
        <button type="button" onClick={() => goToPage(pageNumber + 1)} disabled={!pdfDocument || pageNumber >= pdfDocument.numPages} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300">下一页<ChevronRight className="h-4 w-4" /></button>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />
        <button type="button" onClick={() => changeZoom(-0.15)} disabled={!pdfDocument} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="缩小"><ZoomOut className="h-4 w-4" /></button>{zoomEditing ? <input autoFocus aria-label="PDF 缩放比例" value={zoomInput} onChange={(event) => setZoomInput(event.target.value.replace(/[^\d.]/g, ""))} onFocus={(event) => event.currentTarget.select()} onBlur={applyZoomInput} onKeyDown={(event) => { if (event.key === "Enter") { applyZoomInput(); event.currentTarget.blur(); } else if (event.key === "Escape") setZoomEditing(false); }} className="min-w-12 w-12 shrink-0 bg-transparent text-center text-xs text-gray-600 outline-none dark:text-gray-300" /> : <button type="button" onClick={startZoomEditing} disabled={!pdfDocument} className="min-w-12 shrink-0 text-center text-xs text-gray-600 dark:text-gray-300" aria-label="编辑 PDF 缩放比例">{Math.round(renderedScale * 100)}%</button>}<button type="button" onClick={() => changeZoom(0.15)} disabled={!pdfDocument} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="放大"><ZoomIn className="h-4 w-4" /></button>
        <button type="button" onClick={() => setFitMode("width")} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs ${fitMode === "width" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="适合页面宽度"><Maximize className="h-4 w-4" />适宽</button><button type="button" onClick={() => setFitMode("page")} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs ${fitMode === "page" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="显示完整页面"><Maximize2 className="h-4 w-4" />整页</button><button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="顺时针旋转"><RotateCw className="h-4 w-4" />旋转</button>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" /><button type="button" onClick={() => { setSidebarOpen(true); setSidebarTab("search"); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Search className="h-4 w-4" />查找</button>
        <div className="ml-auto flex shrink-0 items-center gap-1"><button type="button" onClick={downloadPdf} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="下载 PDF"><Download className="h-4 w-4" />下载</button><button type="button" onClick={printPdf} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="打印 PDF"><Printer className="h-4 w-4" />打印</button></div>
      </div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen ? <button type="button" aria-label="关闭侧栏" onClick={() => setSidebarOpen(false)} className="absolute inset-0 z-10 bg-black/20 md:hidden" /> : null}
        <aside className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-20 w-[min(82vw,19rem)] flex-col border-r border-gray-200 bg-white shadow-xl md:relative md:w-64 md:shrink-0 md:shadow-none dark:border-gray-800 dark:bg-gray-900`}>
          <div className="flex h-11 shrink-0 items-center border-b border-gray-200 p-1 dark:border-gray-800"><button type="button" onClick={() => setSidebarTab("pages")} className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs ${sidebarTab === "pages" ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"}`}><Images className="h-4 w-4" />页面</button><button type="button" onClick={() => setSidebarTab("outline")} className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs ${sidebarTab === "outline" ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"}`}><ListTree className="h-4 w-4" />书签</button><button type="button" onClick={() => setSidebarTab("search")} className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-md text-xs ${sidebarTab === "search" ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"}`}><Search className="h-4 w-4" />查找</button><button type="button" onClick={() => setSidebarOpen(false)} className="ml-1 hidden h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 md:flex dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200" title="收起侧栏"><PanelLeftClose className="h-4 w-4" /></button></div>
          {sidebarTab === "pages" ? <div className="min-h-0 flex-1 overflow-auto bg-gray-50 p-3 dark:bg-gray-950">{pdfDocument ? Array.from({ length: pdfDocument.numPages }, (_, index) => <PdfThumbnail key={index + 1} pdfDocument={pdfDocument} page={index + 1} active={pageNumber === index + 1} onSelect={() => { goToPage(index + 1); if (window.innerWidth < 768) setSidebarOpen(false); }} />) : null}</div> : sidebarTab === "outline" ? <div className="min-h-0 flex-1 overflow-auto p-2">{outline.length ? renderOutline(outline) : <div className="px-3 py-8 text-center text-xs leading-5 text-gray-400 dark:text-gray-500">此 PDF 未包含可用的书签目录</div>}</div> : <div className="flex min-h-0 flex-1 flex-col"><form onSubmit={(event) => { event.preventDefault(); void runSearch(); }} className="flex gap-1.5 border-b border-gray-100 p-2 dark:border-gray-800"><div className="relative min-w-0 flex-1"><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="查找文档内容" className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 pr-8 text-xs text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500" autoFocus />{searchQuery ? <button type="button" onClick={clearSearch} className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-300" aria-label="清除搜索内容" title="清除"><X className="h-3.5 w-3.5" /></button> : null}</div><button type="submit" disabled={!searchQuery.trim() || searching} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500">{searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</button></form><div className="min-h-0 flex-1 overflow-auto p-2">{searchResults.map((result) => <button type="button" key={result.page} onClick={() => { goToPage(result.page); if (window.innerWidth < 768) setSidebarOpen(false); }} className="mb-1 w-full rounded-md p-2 text-left hover:bg-blue-50 dark:hover:bg-blue-950/50"><span className="flex items-center justify-between text-xs font-medium text-blue-700 dark:text-blue-300"><span>第 {result.page} 页</span><span>{result.matches} 处</span></span><span className="mt-1 line-clamp-3 block text-xs leading-5 text-gray-500 dark:text-gray-400">{result.snippet}</span></button>)}{!searching && searchQuery && !searchResults.length ? <div className="px-3 py-8 text-center text-xs text-gray-400 dark:text-gray-500">未找到匹配内容</div> : null}{!searchQuery ? <div className="px-3 py-8 text-center text-xs leading-5 text-gray-400 dark:text-gray-500">输入关键词后，将在当前 PDF 的全部页面中查找</div> : null}</div></div>}
        </aside>
        <div ref={canvasAreaRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto p-3 text-gray-700 sm:p-4 dark:bg-gray-950 dark:text-gray-200">
          {loading ? <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-gray-100 text-gray-600 dark:bg-gray-950 dark:text-gray-300"><span className="r2-loader-orbit h-5 w-5 shrink-0" /><span className="text-sm">PDF加载中…</span></div> : null}
          {error ? <div className="absolute inset-0 flex items-center justify-center bg-gray-100 px-6 text-center text-sm text-red-600 dark:bg-gray-950 dark:text-red-300">{error}</div> : null}
          {!error && viewMode === "single" ? <div className="relative mx-auto" style={canvasSize.width && canvasSize.height ? { width: canvasSize.width, height: canvasSize.height } : undefined}><canvas ref={canvasRef} className="block bg-white shadow-lg dark:shadow-black/50" />{textHighlights.length ? <div className="pointer-events-none absolute inset-0" aria-hidden="true">{textHighlights.map((highlight, index) => <span key={`${highlight.left}-${highlight.top}-${index}`} className="absolute rounded-[2px] bg-yellow-300/60 ring-1 ring-yellow-400/40 dark:bg-yellow-300/50 dark:ring-yellow-200/40" style={{ left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height }} />)}</div> : null}</div> : null}
          {!error && viewMode === "continuous" && pdfDocument ? (
            <div className="flex min-w-full flex-col items-center gap-4 pb-2 sm:gap-5">
              {Array.from({ length: pdfDocument.numPages }, (_, index) => {
                const page = index + 1;
                return <PdfContinuousPage key={page} pdfDocument={pdfDocument} page={page} fitMode={fitMode} zoom={zoom} rotation={rotation} availableWidth={Math.max(240, viewerSize.width - (viewerSize.width < 640 ? 24 : 32))} availableHeight={Math.max(240, viewerSize.height - 32)} active={page === pageNumber} activeSearchQuery={activeSearchQuery} getTextItems={getTextItems} scrollRootRef={canvasAreaRef} registerPage={registerContinuousPage} onRenderedScale={handleContinuousScale} />;
              })}
            </div>
          ) : null}
          {!sidebarOpen ? <button type="button" onClick={() => setSidebarOpen(true)} className="absolute left-3 top-3 z-30 inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white/95 px-2 text-xs text-gray-600 shadow-sm hover:bg-blue-50 hover:text-blue-700 md:hidden dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Images className="h-4 w-4" />页面</button> : null}
        </div>
      </div>
    </div>
  );
}

function PdfContinuousPage({
  pdfDocument,
  page,
  fitMode,
  zoom,
  rotation,
  availableWidth,
  availableHeight,
  active,
  activeSearchQuery,
  getTextItems,
  scrollRootRef,
  registerPage,
  onRenderedScale,
}: {
  pdfDocument: PdfDocument;
  page: number;
  fitMode: FitMode;
  zoom: number;
  rotation: number;
  availableWidth: number;
  availableHeight: number;
  active: boolean;
  activeSearchQuery: string;
  getTextItems: (page: number) => Promise<PdfTextItem[]>;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  registerPage: (page: number, node: HTMLDivElement | null) => void;
  onRenderedScale: (page: number, scale: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearby, setNearby] = useState(page <= 2);
  const [pageSize, setPageSize] = useState(() => ({ width: availableWidth, height: availableWidth * 1.414 }));
  const [pageScale, setPageScale] = useState(1);
  const [highlights, setHighlights] = useState<PdfTextHighlight[]>([]);
  const [renderError, setRenderError] = useState(false);

  const setWrapperRef = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    registerPage(page, node);
  }, [page, registerPage]);

  useEffect(() => {
    const target = wrapperRef.current;
    const root = scrollRootRef.current;
    if (!target || !root) return;
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), {
      root,
      rootMargin: "900px 0px",
      threshold: 0,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRootRef]);

  useEffect(() => {
    let disposed = false;
    let renderTask: PdfRenderTask | null = null;
    void (async () => {
      const pdfPage = await pdfDocument.getPage(page);
      if (disposed) return;
      const baseViewport = pdfPage.getViewport({ scale: 1, rotation });
      const scale = fitMode === "width"
        ? availableWidth / baseViewport.width
        : fitMode === "page"
          ? Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height)
          : zoom;
      const safeScale = clamp(scale, 0.1, 6);
      const viewport = pdfPage.getViewport({ scale: safeScale, rotation });
      setPageSize({ width: viewport.width, height: viewport.height });
      setPageScale(safeScale);
      if (!nearby || !canvasRef.current) return;
      const requestedRatio = Math.min(window.devicePixelRatio || 1, 2);
      const maxRatio = isIOSDevice() ? Math.sqrt(IOS_MAX_CANVAS_PIXELS / Math.max(1, viewport.width * viewport.height)) : requestedRatio;
      const ratio = Math.max(0.1, Math.min(requestedRatio, maxRatio));
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      if (isIOSDevice()) await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (disposed || !canvasRef.current) return;
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (!disposed) setRenderError(false);
    })().catch((reason) => {
      if (!disposed && String((reason as { name?: unknown })?.name ?? "") !== "RenderingCancelledException") setRenderError(true);
    });
    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [availableHeight, availableWidth, fitMode, nearby, page, pdfDocument, rotation, zoom]);

  useEffect(() => {
    if (active) onRenderedScale(page, pageScale);
  }, [active, onRenderedScale, page, pageScale]);

  useEffect(() => {
    if (!nearby || !activeSearchQuery || !pageScale) return;
    let disposed = false;
    void (async () => {
      const pdfPage = await pdfDocument.getPage(page);
      const items = await getTextItems(page);
      const viewport = pdfPage.getViewport({ scale: pageScale, rotation });
      const nextHighlights: PdfTextHighlight[] = [];
      for (const item of items) {
        const lowerText = item.str.toLocaleLowerCase();
        for (let index = lowerText.indexOf(activeSearchQuery); index >= 0; index = lowerText.indexOf(activeSearchQuery, index + activeSearchQuery.length)) {
          const itemWidth = Math.max(item.width, 1);
          const startX = item.transform[4] + itemWidth * (index / item.str.length);
          const endX = item.transform[4] + itemWidth * ((index + activeSearchQuery.length) / item.str.length);
          const baseY = item.transform[5];
          const itemHeight = Math.max(item.height, Math.abs(item.transform[3] ?? 10), 4);
          const [startPoint, endPoint] = [
            viewport.convertToViewportPoint(startX, baseY),
            viewport.convertToViewportPoint(endX, baseY + itemHeight),
          ];
          nextHighlights.push({
            left: Math.min(startPoint[0], endPoint[0]),
            top: Math.min(startPoint[1], endPoint[1]),
            width: Math.max(2, Math.abs(endPoint[0] - startPoint[0])),
            height: Math.max(4, Math.abs(endPoint[1] - startPoint[1])),
          });
        }
      }
      if (!disposed) setHighlights(nextHighlights);
    })().catch(() => {
      if (!disposed) setHighlights([]);
    });
    return () => {
      disposed = true;
    };
  }, [activeSearchQuery, getTextItems, nearby, page, pageScale, pdfDocument, rotation]);

  return (
    <div ref={setWrapperRef} data-pdf-page={page} className="scroll-mt-3 sm:scroll-mt-4">
      <div className="relative overflow-hidden bg-white shadow-lg ring-1 ring-black/5 dark:shadow-black/50 dark:ring-white/10" style={{ width: pageSize.width, height: pageSize.height }}>
        {nearby ? <canvas ref={canvasRef} className="block bg-white" /> : <div className="flex h-full w-full items-center justify-center bg-white text-xs text-gray-400 dark:text-gray-500">第 {page} 页</div>}
        {renderError ? <div className="absolute inset-0 flex items-center justify-center bg-white text-xs text-red-500 dark:text-red-400">第 {page} 页渲染失败</div> : null}
        {nearby && activeSearchQuery && highlights.length ? <div className="pointer-events-none absolute inset-0" aria-hidden="true">{highlights.map((highlight, index) => <span key={`${highlight.left}-${highlight.top}-${index}`} className="absolute rounded-[2px] bg-yellow-300/60 ring-1 ring-yellow-400/40 dark:bg-yellow-300/50 dark:ring-yellow-200/40" style={{ left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height }} />)}</div> : null}
      </div>
      <div className={`mx-auto mt-2 w-fit rounded-full px-2 py-0.5 text-[11px] transition-colors ${active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>{page} / {pdfDocument.numPages}</div>
    </div>
  );
}

function PdfThumbnail({ pdfDocument, page, active, onSelect }: { pdfDocument: PdfDocument; page: number; active: boolean; onSelect: () => void }) {
  const wrapperRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(page <= 3);

  useEffect(() => {
    const target = wrapperRef.current;
    if (!target || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let disposed = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    void pdfDocument.getPage(page).then((pdfPage) => {
      if (disposed || !canvasRef.current) return;
      const viewport = pdfPage.getViewport({ scale: 0.24 });
      const ratio = isIOSDevice() ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      void renderTask.promise.catch(() => undefined);
    });
    return () => {
      disposed = true;
      renderTask?.cancel();
    };
  }, [page, pdfDocument, visible]);

  return <button ref={wrapperRef} type="button" onClick={onSelect} className={`mx-auto mb-3 block w-fit rounded-md border-2 p-1.5 text-center transition-colors ${active ? "border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950/50" : "border-transparent hover:border-blue-200 dark:hover:border-blue-800 dark:hover:bg-gray-900"}`} title={`转到第 ${page} 页`}><div className="flex min-h-40 w-36 items-center justify-center bg-white shadow dark:shadow-black/40"><canvas ref={canvasRef} className="block max-w-full" /></div><span className={`mt-1.5 block text-xs ${active ? "font-medium text-blue-700 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`}>第 {page} 页</span></button>;
}
