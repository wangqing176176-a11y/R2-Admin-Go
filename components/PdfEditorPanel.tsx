"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Highlighter,
  Pencil,
  RotateCw,
  Save,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import LoadingState from "./LoadingState";
import Modal from "./Modal";

type PdfJsDocument = Awaited<ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>["promise"]>;
type PdfLoadingTask = { destroy: () => Promise<void>; promise: Promise<PdfJsDocument> };
type PdfViewport = ReturnType<Awaited<ReturnType<PdfJsDocument["getPage"]>>["getViewport"]>;
type Tool = "highlight" | "draw" | "text";
type Point = { x: number; y: number };
type Annotation =
  | { id: string; page: number; type: "highlight"; start: Point; end: Point }
  | { id: string; page: number; type: "draw"; points: Point[] }
  | { id: string; page: number; type: "text"; point: Point; text: string };

const nextId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createTextNotePng = (text: string) => {
  const maxWidth = 420;
  const padding = 22;
  const lineHeight = 34;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法生成文字注释");
  context.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
  const chars = Array.from(text.trim());
  const lines: string[] = [];
  let line = "";
  for (const char of chars) {
    const candidate = `${line}${char}`;
    if (line && context.measureText(candidate).width > maxWidth - padding * 2) {
      lines.push(line);
      line = char;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, 8);
  canvas.width = maxWidth;
  canvas.height = Math.max(78, visibleLines.length * lineHeight + padding * 2);
  context.fillStyle = "rgba(254, 249, 195, 0.96)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#eab308";
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  context.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
  context.fillStyle = "#422006";
  visibleLines.forEach((value, index) => context.fillText(value, padding, padding + 25 + index * lineHeight));
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width / 2, height: canvas.height / 2 };
};

export default function PdfEditorPanel({
  sourceUrl,
  name,
  onClose,
  onSave,
  onNotify,
  onDirtyChange,
}: {
  sourceUrl: string;
  name: string;
  onClose: () => void;
  onSave?: (data: Uint8Array) => Promise<void>;
  onNotify?: (notice: { kind: "success" | "error" | "warning" | "info"; message: string }) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const viewportRef = useRef<PdfViewport | null>(null);
  const pointerRef = useRef<{ id: number; start: Point; points: Point[] } | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [viewport, setViewport] = useState<PdfViewport | null>(null);
  const [tool, setTool] = useState<Tool>("highlight");
  const [noteText, setNoteText] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [deletedPages, setDeletedPages] = useState<Set<number>>(() => new Set());
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | null>(null);
  const [saving, setSaving] = useState(false);
  const [stageWidth, setStageWidth] = useState(900);
  const [zoom, setZoom] = useState(1);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const dirty = annotations.length > 0 || deletedPages.size > 0 || Object.keys(pageRotations).length > 0;

  const activeAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.page === pageNumber),
    [annotations, pageNumber],
  );
  const visiblePages = useMemo(() => {
    if (!pdfDocument) return [];
    return Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1).filter((page) => !deletedPages.has(page));
  }, [deletedPages, pdfDocument]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    const target = stageRef.current;
    if (!target) return;
    const update = () => setStageWidth(Math.max(280, target.clientWidth - 32));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PdfLoadingTask | null = null;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      const response = await fetch(sourceUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`PDF 下载失败（HTTP ${response.status}）`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (disposed) return;
      bytesRef.current = bytes;
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const assetBase = new URL(`/pdfjs/${pdfjs.version}/`, window.location.href).href;
      loadingTask = pdfjs.getDocument({
        data: bytes.slice(),
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`,
        wasmUrl: `${assetBase}wasm/`,
      });
      const document = await loadingTask.promise;
      if (disposed) return;
      setPdfDocument(document);
      setLoading(false);
    })().catch((reason) => {
      if (!disposed) {
        setError(reason instanceof Error ? reason.message : "PDF 编辑器加载失败");
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
      controller.abort();
      renderTaskRef.current?.cancel();
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!pdfDocument || deletedPages.has(pageNumber)) return;
    let disposed = false;
    renderTaskRef.current?.cancel();
    void (async () => {
      const page = await pdfDocument.getPage(pageNumber);
      if (disposed || !canvasRef.current) return;
      const baseRotation = page.rotate ?? 0;
      const rotation = (baseRotation + (pageRotations[pageNumber] ?? 0)) % 360;
      const base = page.getViewport({ scale: 1, rotation });
      const fitScale = stageWidth / Math.max(1, base.width);
      const scale = clamp(fitScale * zoom, 0.15, 6);
      const nextViewport = page.getViewport({ scale, rotation });
      viewportRef.current = nextViewport;
      setViewport(nextViewport);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.max(1, Math.floor(nextViewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(nextViewport.height * ratio));
      canvas.style.width = `${nextViewport.width}px`;
      canvas.style.height = `${nextViewport.height}px`;
      const task = page.render({
        canvas,
        canvasContext: context,
        viewport: nextViewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      renderTaskRef.current = task;
      await task.promise;
    })().catch((reason) => {
      if (!disposed && String((reason as { name?: unknown })?.name ?? "") !== "RenderingCancelledException") {
        setError("当前页面渲染失败");
      }
    });
    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
    };
  }, [deletedPages, pageNumber, pageRotations, pdfDocument, stageWidth, zoom]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);

  const toPdfPoint = useCallback((clientX: number, clientY: number) => {
    const currentViewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!currentViewport || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const [x, y] = currentViewport.convertToPdfPoint(clientX - rect.left, clientY - rect.top);
    return { x, y };
  }, []);

  const toViewPoint = useCallback((point: Point) => {
    const currentViewport = viewportRef.current;
    if (!currentViewport) return { x: 0, y: 0 };
    const [x, y] = currentViewport.convertToViewportPoint(point.x, point.y);
    return { x, y };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = toPdfPoint(event.clientX, event.clientY);
    if (!point) return;
    if (tool === "text") {
      const value = noteText.trim();
      if (!value) {
        onNotify?.({ kind: "warning", message: "请先输入文字注释内容" });
        return;
      }
      setAnnotations((current) => [...current, { id: nextId(), page: pageNumber, type: "text", point, text: value }]);
      setNoteText("");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, start: point, points: [point] };
    setDraftAnnotation(tool === "highlight"
      ? { id: "draft", page: pageNumber, type: "highlight", start: point, end: point }
      : { id: "draft", page: pageNumber, type: "draw", points: [point] });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const point = toPdfPoint(event.clientX, event.clientY);
    if (!point) return;
    if (tool === "highlight") {
      setDraftAnnotation({ id: "draft", page: pageNumber, type: "highlight", start: pointer.start, end: point });
    } else {
      pointer.points.push(point);
      setDraftAnnotation({ id: "draft", page: pageNumber, type: "draw", points: [...pointer.points] });
    }
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const draft = draftAnnotation;
    pointerRef.current = null;
    setDraftAnnotation(null);
    if (!draft) return;
    if (draft.type === "highlight") {
      const start = toViewPoint(draft.start);
      const end = toViewPoint(draft.end);
      if (Math.abs(end.x - start.x) < 4 || Math.abs(end.y - start.y) < 4) return;
    } else if (draft.type === "draw" && draft.points.length < 2) return;
    setAnnotations((current) => [...current, { ...draft, id: nextId() }]);
  };

  const goRelative = (direction: -1 | 1) => {
    const index = visiblePages.indexOf(pageNumber);
    const next = visiblePages[index + direction];
    if (next) setPageNumber(next);
  };

  const deleteCurrentPage = () => {
    if (visiblePages.length <= 1) {
      onNotify?.({ kind: "warning", message: "PDF 至少需要保留一页" });
      return;
    }
    const index = visiblePages.indexOf(pageNumber);
    const nextPage = visiblePages[index + 1] ?? visiblePages[index - 1];
    setDeletedPages((current) => new Set(current).add(pageNumber));
    setAnnotations((current) => current.filter((annotation) => annotation.page !== pageNumber));
    if (nextPage) setPageNumber(nextPage);
  };

  const buildPdf = async () => {
    const source = bytesRef.current;
    if (!source) throw new Error("PDF 原始数据尚未加载完成");
    const { PDFDocument, degrees, rgb } = await import("pdf-lib");
    const document = await PDFDocument.load(source, { updateMetadata: false });
    const originalPageCount = document.getPageCount();
    for (let originalPage = 1; originalPage <= originalPageCount; originalPage += 1) {
      if (deletedPages.has(originalPage)) continue;
      const page = document.getPage(originalPage - 1);
      const rotationDelta = pageRotations[originalPage] ?? 0;
      if (rotationDelta) page.setRotation(degrees((page.getRotation().angle + rotationDelta) % 360));
      const pageAnnotations = annotations.filter((annotation) => annotation.page === originalPage);
      for (const annotation of pageAnnotations) {
        if (annotation.type === "highlight") {
          const x = Math.min(annotation.start.x, annotation.end.x);
          const y = Math.min(annotation.start.y, annotation.end.y);
          page.drawRectangle({
            x,
            y,
            width: Math.max(1, Math.abs(annotation.end.x - annotation.start.x)),
            height: Math.max(1, Math.abs(annotation.end.y - annotation.start.y)),
            color: rgb(1, 0.84, 0),
            opacity: 0.34,
          });
        } else if (annotation.type === "draw") {
          for (let index = 1; index < annotation.points.length; index += 1) {
            page.drawLine({
              start: annotation.points[index - 1],
              end: annotation.points[index],
              color: rgb(0.91, 0.16, 0.18),
              thickness: 1.8,
              opacity: 0.9,
            });
          }
        } else {
          const note = createTextNotePng(annotation.text);
          const image = await document.embedPng(note.dataUrl);
          const { width: pageWidth, height: pageHeight } = page.getSize();
          const width = Math.min(note.width, Math.max(80, pageWidth - 20));
          const height = note.height * (width / note.width);
          page.drawImage(image, {
            x: clamp(annotation.point.x, 4, Math.max(4, pageWidth - width - 4)),
            y: clamp(annotation.point.y - height, 4, Math.max(4, pageHeight - height - 4)),
            width,
            height,
          });
        }
      }
    }
    Array.from(deletedPages).sort((a, b) => b - a).forEach((originalPage) => document.removePage(originalPage - 1));
    return document.save();
  };

  const saveChanges = async () => {
    if (!onSave || !dirty || saving) return;
    setSaving(true);
    try {
      const data = await buildPdf();
      await onSave(data);
      setAnnotations([]);
      setDeletedPages(new Set());
      setPageRotations({});
      onNotify?.({ kind: "success", message: "PDF 修改已保存" });
    } catch (reason) {
      onNotify?.({ kind: "error", message: reason instanceof Error ? reason.message : "PDF 保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const downloadCopy = async () => {
    setSaving(true);
    try {
      const data = await buildPdf();
      const blob = new Blob([data as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name.replace(/\.pdf$/i, "") + "-已编辑.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      onNotify?.({ kind: "success", message: "已下载编辑后的 PDF 副本" });
    } catch (reason) {
      onNotify?.({ kind: "error", message: reason instanceof Error ? reason.message : "PDF 导出失败" });
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () => {
    if (dirty) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  };

  const annotationLayer = [...activeAnnotations, ...(draftAnnotation ? [draftAnnotation] : [])];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        <button type="button" onClick={() => setTool("highlight")} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs ${tool === "highlight" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}><Highlighter className="h-4 w-4" />高亮</button>
        <button type="button" onClick={() => setTool("draw")} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs ${tool === "draw" ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}><Pencil className="h-4 w-4" />画笔</button>
        <button type="button" onClick={() => setTool("text")} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs ${tool === "text" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}><Type className="h-4 w-4" />文字</button>
        {tool === "text" ? <input value={noteText} onChange={(event) => setNoteText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setNoteText(""); }} placeholder="输入注释后点击页面" className="h-8 min-w-32 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-blue-400 sm:max-w-64 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /> : null}
        <span className="mx-0.5 hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-700" />
        <button type="button" onClick={() => setAnnotations((current) => current.slice(0, -1))} disabled={!annotations.length} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-gray-100 disabled:opacity-35 dark:hover:bg-gray-800"><Undo2 className="h-4 w-4" />撤销</button>
        <button type="button" onClick={() => setAnnotations((current) => current.filter((annotation) => annotation.page !== pageNumber))} disabled={!activeAnnotations.length} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-gray-100 disabled:opacity-35 dark:hover:bg-gray-800"><Eraser className="h-4 w-4" />清除此页</button>
        <span className="mx-0.5 hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-700" />
        <div className="inline-flex h-8 shrink-0 items-center rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950" aria-label="页面缩放">
          <button type="button" onClick={() => setZoom((value) => clamp(value - 0.15, 0.5, 3))} disabled={zoom <= 0.5} className="inline-flex h-7 w-8 items-center justify-center rounded-l-md hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800" title="缩小页面"><ZoomOut className="h-4 w-4" /></button>
          <button type="button" onClick={() => setZoom(1)} className="h-7 min-w-12 border-x border-gray-200 px-1 text-center text-[11px] tabular-nums hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800" title="恢复适合宽度">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((value) => clamp(value + 0.15, 0.5, 3))} disabled={zoom >= 3} className="inline-flex h-7 w-8 items-center justify-center rounded-r-md hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800" title="放大页面"><ZoomIn className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={() => setPageRotations((current) => ({ ...current, [pageNumber]: ((current[pageNumber] ?? 0) + 90) % 360 }))} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"><RotateCw className="h-4 w-4" />旋转页</button>
        <button type="button" onClick={deleteCurrentPage} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"><Trash2 className="h-4 w-4" />删除页</button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => void downloadCopy()} disabled={saving || loading} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"><Download className="h-4 w-4" /><span className="hidden sm:inline">下载副本</span></button>
          {onSave ? <button type="button" onClick={() => void saveChanges()} disabled={!dirty || saving || loading} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"><Save className="h-4 w-4" />{saving ? "处理中" : "保存"}</button> : null}
          <button type="button" onClick={closeEditor} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800" title="退出编辑"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto bg-gray-100 p-4 dark:bg-gray-950">
        {loading ? <LoadingState variant="preview" label="正在打开 PDF 编辑器…" className="absolute inset-0 z-20 bg-gray-100 dark:bg-gray-950" /> : null}
        {error ? <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center text-sm text-red-600 dark:text-red-300">{error}</div> : null}
        {!error && pdfDocument ? (
          <div className={`relative mx-auto select-none bg-white shadow-xl ${viewport ? "" : "invisible"}`} style={{ width: viewport?.width ?? 1, height: viewport?.height ?? 1 }}>
            <canvas ref={canvasRef} className="block" />
            {viewport ? (
            <div
              className={`absolute inset-0 touch-none ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                {annotationLayer.map((annotation) => {
                  if (annotation.type === "highlight") {
                    const start = toViewPoint(annotation.start);
                    const end = toViewPoint(annotation.end);
                    return <rect key={annotation.id} x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} fill="rgba(250, 204, 21, .38)" stroke="rgba(234, 179, 8, .7)" strokeWidth="1" />;
                  }
                  if (annotation.type === "draw") {
                    const points = annotation.points.map(toViewPoint).map((point) => `${point.x},${point.y}`).join(" ");
                    return <polyline key={annotation.id} points={points} fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
                  }
                  return null;
                })}
              </svg>
              {annotationLayer.filter((annotation): annotation is Extract<Annotation, { type: "text" }> => annotation.type === "text").map((annotation) => {
                const point = toViewPoint(annotation.point);
                return <div key={annotation.id} className="pointer-events-none absolute max-w-56 whitespace-pre-wrap rounded border border-amber-400 bg-yellow-100/95 px-2 py-1.5 text-xs leading-5 text-amber-950 shadow" style={{ left: point.x, top: point.y }}>{annotation.text}</div>;
              })}
            </div>
            ) : null}
          </div>
        ) : <canvas ref={canvasRef} className="hidden" />}
      </div>

      <div className="flex h-11 shrink-0 items-center justify-center gap-3 border-t border-gray-200 bg-white px-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        <button type="button" onClick={() => goRelative(-1)} disabled={visiblePages.indexOf(pageNumber) <= 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"><ChevronLeft className="h-4 w-4" /></button>
        <span>第 {visiblePages.indexOf(pageNumber) + 1} / {visiblePages.length || 1} 页{deletedPages.size ? ` · 已删除 ${deletedPages.size} 页` : ""}</span>
        <button type="button" onClick={() => goRelative(1)} disabled={visiblePages.indexOf(pageNumber) >= visiblePages.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"><ChevronRight className="h-4 w-4" /></button>
        <span className="absolute right-4 hidden text-[10px] text-gray-400 sm:inline dark:text-gray-500">{dirty ? "有未保存修改" : "尚未修改"}</span>
      </div>
      <Modal
        open={closeConfirmOpen}
        title="退出 PDF 编辑"
        onClose={() => setCloseConfirmOpen(false)}
        closeOnBackdropClick
        zIndex={520}
        panelClassName="max-w-md"
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setCloseConfirmOpen(false)} className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">继续编辑</button><button type="button" onClick={() => { setCloseConfirmOpen(false); onDirtyChange?.(false); onClose(); }} className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">放弃修改并退出</button></div>}
      >
        <div className="py-1"><p className="text-sm font-medium text-gray-900 dark:text-gray-100">当前修改还没有保存</p><p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">退出后，本次添加的注释和页面调整都会丢失。</p></div>
      </Modal>
    </div>
  );
}
