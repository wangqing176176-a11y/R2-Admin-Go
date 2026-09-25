"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Highlighter,
  MessageSquareText,
  MousePointer2,
  Pencil,
  RotateCw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import LoadingState from "./LoadingState";
import Modal from "./Modal";

type PdfJsDocument = Awaited<ReturnType<(typeof import("pdfjs-dist/legacy/build/pdf.mjs"))["getDocument"]>["promise"]>;
type PdfLoadingTask = { destroy: () => Promise<void>; promise: Promise<PdfJsDocument> };
type PdfViewport = ReturnType<Awaited<ReturnType<PdfJsDocument["getPage"]>>["getViewport"]>;
type Tool = "select" | "highlight" | "draw" | "rectangle" | "arrow" | "text" | "note";
type FontFamily = "sans" | "serif" | "mono";
type Point = { x: number; y: number };
type Annotation =
  | { id: string; page: number; type: "highlight"; start: Point; end: Point; color: string }
  | { id: string; page: number; type: "draw"; points: Point[]; color: string; thickness: number }
  | { id: string; page: number; type: "rectangle"; start: Point; end: Point; color: string; thickness: number }
  | { id: string; page: number; type: "arrow"; start: Point; end: Point; color: string; thickness: number }
  | { id: string; page: number; type: "text"; point: Point; text: string; color: string; fontSize: number; fontFamily: FontFamily }
  | { id: string; page: number; type: "note"; point: Point; text: string };
type PointerState =
  | { mode: "draw"; id: number; start: Point; points: Point[] }
  | { mode: "move"; id: number; start: Point; annotation: Annotation };

const nextId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const fontStacks: Record<FontFamily, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Songti SC", "SimSun", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
};
const standardColorPresets = ["#000000", "#ffffff", "#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050", "#00b0f0", "#0070c0", "#002060", "#7030a0"];
const thicknessPresets = [
  { value: 1.5, label: "细" },
  { value: 3, label: "中" },
  { value: 6, label: "粗" },
];
const fontSizePresets = [12, 14, 16, 18, 20, 24, 28, 32, 40];
const annotationDeleteLabels: Record<Annotation["type"], string> = {
  highlight: "删除高亮",
  draw: "删除画笔",
  rectangle: "删除框线",
  arrow: "删除箭头",
  text: "删除文字",
  note: "删除批注",
};

const hexToRgb = (value: string) => {
  const normalized = value.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((part) => `${part}${part}`).join("") : normalized;
  const numeric = Number.parseInt(full, 16);
  if (!Number.isFinite(numeric) || full.length !== 6) return { r: 0.15, g: 0.39, b: 0.92 };
  return { r: ((numeric >> 16) & 255) / 255, g: ((numeric >> 8) & 255) / 255, b: (numeric & 255) / 255 };
};

const createTextNotePng = (text: string) => {
  const maxWidth = 420;
  const padding = 22;
  const lineHeight = 34;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法生成文字批注");
  context.font = `24px ${fontStacks.sans}`;
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
  context.font = `24px ${fontStacks.sans}`;
  context.fillStyle = "#422006";
  visibleLines.forEach((value, index) => context.fillText(value, padding, padding + 25 + index * lineHeight));
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width / 2, height: canvas.height / 2 };
};

const createPlainTextPng = (text: string, fontSize: number, color: string, fontFamily: FontFamily) => {
  const ratio = 2;
  const lines = text.replace(/\r\n/g, "\n").split("\n").slice(0, 20);
  const logicalLineHeight = fontSize * 1.3;
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("浏览器无法生成文字");
  measureContext.font = `${fontSize}px ${fontStacks[fontFamily]}`;
  const logicalWidth = Math.max(fontSize, ...lines.map((line) => measureContext.measureText(line || " ").width));
  const logicalHeight = Math.max(logicalLineHeight, lines.length * logicalLineHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((logicalWidth + 4) * ratio);
  canvas.height = Math.ceil((logicalHeight + 4) * ratio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法生成文字");
  context.scale(ratio, ratio);
  context.font = `${fontSize}px ${fontStacks[fontFamily]}`;
  context.textBaseline = "top";
  context.fillStyle = color;
  lines.forEach((line, index) => context.fillText(line, 2, 2 + index * logicalLineHeight));
  return { dataUrl: canvas.toDataURL("image/png"), width: logicalWidth + 4, height: logicalHeight + 4 };
};

const getArrowHead = (start: Point, end: Point, thickness: number) => {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 9 + thickness * 2.5;
  return [
    { x: end.x - size * Math.cos(angle - Math.PI / 6), y: end.y - size * Math.sin(angle - Math.PI / 6) },
    { x: end.x - size * Math.cos(angle + Math.PI / 6), y: end.y - size * Math.sin(angle + Math.PI / 6) },
  ] as const;
};

const translateAnnotation = (annotation: Annotation, dx: number, dy: number): Annotation => {
  const movePoint = (point: Point) => ({ x: point.x + dx, y: point.y + dy });
  if (annotation.type === "draw") return { ...annotation, points: annotation.points.map(movePoint) };
  if (annotation.type === "text" || annotation.type === "note") return { ...annotation, point: movePoint(annotation.point) };
  return { ...annotation, start: movePoint(annotation.start), end: movePoint(annotation.end) };
};

export default function PdfEditorPanel({ sourceUrl, name, onClose, onSave, onNotify, onDirtyChange }: {
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
  const pointerRef = useRef<PointerState | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfJsDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [viewport, setViewport] = useState<PdfViewport | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [strokeColor, setStrokeColor] = useState("#e11d48");
  const [strokeThickness, setStrokeThickness] = useState(3);
  const [fontSize, setFontSize] = useState(18);
  const [customFontSizeInput, setCustomFontSizeInput] = useState("18");
  const [fontFamily, setFontFamily] = useState<FontFamily>("sans");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [deletedPages, setDeletedPages] = useState<Set<number>>(() => new Set());
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | null>(null);
  const [saving, setSaving] = useState(false);
  const [stageWidth, setStageWidth] = useState(900);
  const [zoom, setZoom] = useState(1);
  const [zoomInput, setZoomInput] = useState("100");
  const [fitMode, setFitMode] = useState<"width" | "original">(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "width" : "original"
  ));
  const [renderedScale, setRenderedScale] = useState(1);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const dirty = annotations.length > 0 || deletedPages.size > 0 || Object.keys(pageRotations).length > 0;

  const activeAnnotations = useMemo(() => annotations.filter((annotation) => annotation.page === pageNumber), [annotations, pageNumber]);
  const selectedAnnotation = useMemo(() => annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null, [annotations, selectedAnnotationId]);
  const visiblePages = useMemo(() => {
    if (!pdfDocument) return [];
    return Array.from({ length: pdfDocument.numPages }, (_, index) => index + 1).filter((page) => !deletedPages.has(page));
  }, [deletedPages, pdfDocument]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    const target = stageRef.current;
    if (!target) return;
    const update = () => setStageWidth(Math.max(260, target.clientWidth - (window.innerWidth < 640 ? 16 : 32)));
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
    setFitMode(window.matchMedia("(max-width: 767px)").matches ? "width" : "original");
    setZoom(1);
    setZoomInput("100");
    void (async () => {
      const response = await fetch(sourceUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`PDF 下载失败（HTTP ${response.status}）`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (disposed) return;
      bytesRef.current = bytes;
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const assetBase = new URL(`/pdfjs/${pdfjs.version}/`, window.location.href).href;
      loadingTask = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: `${assetBase}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assetBase}standard_fonts/`, wasmUrl: `${assetBase}wasm/` });
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
      const rotation = ((page.rotate ?? 0) + (pageRotations[pageNumber] ?? 0)) % 360;
      const base = page.getViewport({ scale: 1, rotation });
      const baseScale = fitMode === "width" ? stageWidth / Math.max(1, base.width) : 1;
      const scale = clamp(baseScale * zoom, 0.15, 6);
      setRenderedScale(scale);
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
      const task = page.render({ canvas, canvasContext: context, viewport: nextViewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      renderTaskRef.current = task;
      await task.promise;
    })().catch((reason) => {
      if (!disposed && String((reason as { name?: unknown })?.name ?? "") !== "RenderingCancelledException") setError("当前页面渲染失败");
    });
    return () => { disposed = true; renderTaskRef.current?.cancel(); };
  }, [deletedPages, fitMode, pageNumber, pageRotations, pdfDocument, stageWidth, zoom]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
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

  const chooseTool = (next: Tool) => {
    const deactivating = tool === next;
    setTool(deactivating ? null : next);
    setSelectedAnnotationId(null);
    if (deactivating) return;
    if (next === "highlight") setStrokeColor("#facc15");
    else if (["draw", "rectangle", "arrow", "text"].includes(next)) setStrokeColor("#ef4444");
  };
  const updateSelectedAnnotation = (patch: Partial<Annotation>) => {
    if (!selectedAnnotationId) return;
    setAnnotations((current) => current.map((annotation) => annotation.id === selectedAnnotationId ? { ...annotation, ...patch } as Annotation : annotation));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool === "select") {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-annotation-id]") : null;
      const annotationId = target?.dataset.annotationId ?? null;
      setSelectedAnnotationId(annotationId);
      const point = toPdfPoint(event.clientX, event.clientY);
      const annotation = annotationId ? annotations.find((item) => item.id === annotationId) : null;
      if (point && annotation) {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current = { mode: "move", id: event.pointerId, start: point, annotation };
      }
      return;
    }
    if (!tool) return;
    const point = toPdfPoint(event.clientX, event.clientY);
    if (!point) return;
    if (tool === "text" || tool === "note") {
      const value = textDraft.trim();
      if (!value) {
        onNotify?.({ kind: "warning", message: tool === "note" ? "请先输入批注内容" : "请先输入文字内容" });
        return;
      }
      const id = nextId();
      const annotation: Annotation = tool === "text" ? { id, page: pageNumber, type: "text", point, text: value, color: strokeColor, fontSize, fontFamily } : { id, page: pageNumber, type: "note", point, text: value };
      setAnnotations((current) => [...current, annotation]);
      setSelectedAnnotationId(id);
      setTextDraft("");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { mode: "draw", id: event.pointerId, start: point, points: [point] };
    if (tool === "highlight") setDraftAnnotation({ id: "draft", page: pageNumber, type: "highlight", start: point, end: point, color: strokeColor });
    else if (tool === "draw") setDraftAnnotation({ id: "draft", page: pageNumber, type: "draw", points: [point], color: strokeColor, thickness: strokeThickness });
    else setDraftAnnotation({ id: "draft", page: pageNumber, type: tool, start: point, end: point, color: strokeColor, thickness: strokeThickness });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const point = toPdfPoint(event.clientX, event.clientY);
    if (!point) return;
    if (pointer.mode === "move") {
      const moved = translateAnnotation(pointer.annotation, point.x - pointer.start.x, point.y - pointer.start.y);
      setAnnotations((current) => current.map((annotation) => annotation.id === moved.id ? moved : annotation));
      return;
    }
    if (tool === "draw") {
      pointer.points.push(point);
      setDraftAnnotation({ id: "draft", page: pageNumber, type: "draw", points: [...pointer.points], color: strokeColor, thickness: strokeThickness });
    } else if (tool === "highlight") setDraftAnnotation({ id: "draft", page: pageNumber, type: "highlight", start: pointer.start, end: point, color: strokeColor });
    else if (tool === "rectangle" || tool === "arrow") setDraftAnnotation({ id: "draft", page: pageNumber, type: tool, start: pointer.start, end: point, color: strokeColor, thickness: strokeThickness });
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.mode === "move") {
      pointerRef.current = null;
      return;
    }
    const draft = draftAnnotation;
    pointerRef.current = null;
    setDraftAnnotation(null);
    if (!draft) return;
    if (draft.type === "draw") {
      if (draft.points.length < 2) return;
    } else if (draft.type !== "text" && draft.type !== "note") {
      const start = toViewPoint(draft.start);
      const end = toViewPoint(draft.end);
      if (Math.hypot(end.x - start.x, end.y - start.y) < 5) return;
    }
    const id = nextId();
    setAnnotations((current) => [...current, { ...draft, id }]);
    setSelectedAnnotationId(id);
  };

  const goRelative = (direction: -1 | 1) => {
    const index = visiblePages.indexOf(pageNumber);
    const next = visiblePages[index + direction];
    if (next) { setPageNumber(next); setSelectedAnnotationId(null); }
  };

  const deleteSelectedAnnotation = () => {
    if (!selectedAnnotationId) return;
    setAnnotations((current) => current.filter((annotation) => annotation.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  };

  useEffect(() => {
    if (!selectedAnnotationId) return;
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      setAnnotations((current) => current.filter((annotation) => annotation.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    };
    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  }, [selectedAnnotationId]);

  const deleteCurrentPage = () => {
    if (visiblePages.length <= 1) { onNotify?.({ kind: "warning", message: "PDF 至少需要保留一页" }); return; }
    const index = visiblePages.indexOf(pageNumber);
    const nextPage = visiblePages[index + 1] ?? visiblePages[index - 1];
    setDeletedPages((current) => new Set(current).add(pageNumber));
    setAnnotations((current) => current.filter((annotation) => annotation.page !== pageNumber));
    setSelectedAnnotationId(null);
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
      for (const annotation of annotations.filter((item) => item.page === originalPage)) {
        if (annotation.type === "highlight") {
          const color = hexToRgb(annotation.color);
          page.drawRectangle({ x: Math.min(annotation.start.x, annotation.end.x), y: Math.min(annotation.start.y, annotation.end.y), width: Math.max(1, Math.abs(annotation.end.x - annotation.start.x)), height: Math.max(1, Math.abs(annotation.end.y - annotation.start.y)), color: rgb(color.r, color.g, color.b), opacity: 0.34 });
        } else if (annotation.type === "draw") {
          const color = hexToRgb(annotation.color);
          for (let index = 1; index < annotation.points.length; index += 1) page.drawLine({ start: annotation.points[index - 1], end: annotation.points[index], color: rgb(color.r, color.g, color.b), thickness: annotation.thickness, opacity: 0.95 });
        } else if (annotation.type === "rectangle") {
          const color = hexToRgb(annotation.color);
          page.drawRectangle({ x: Math.min(annotation.start.x, annotation.end.x), y: Math.min(annotation.start.y, annotation.end.y), width: Math.max(1, Math.abs(annotation.end.x - annotation.start.x)), height: Math.max(1, Math.abs(annotation.end.y - annotation.start.y)), borderColor: rgb(color.r, color.g, color.b), borderWidth: annotation.thickness, borderOpacity: 0.95 });
        } else if (annotation.type === "arrow") {
          const color = hexToRgb(annotation.color);
          const arrowColor = rgb(color.r, color.g, color.b);
          const [headA, headB] = getArrowHead(annotation.start, annotation.end, annotation.thickness);
          page.drawLine({ start: annotation.start, end: annotation.end, color: arrowColor, thickness: annotation.thickness, opacity: 0.95 });
          page.drawLine({ start: annotation.end, end: headA, color: arrowColor, thickness: annotation.thickness, opacity: 0.95 });
          page.drawLine({ start: annotation.end, end: headB, color: arrowColor, thickness: annotation.thickness, opacity: 0.95 });
        } else if (annotation.type === "text") {
          const textImage = createPlainTextPng(annotation.text, annotation.fontSize, annotation.color, annotation.fontFamily);
          const image = await document.embedPng(textImage.dataUrl);
          const { width: pageWidth, height: pageHeight } = page.getSize();
          const width = Math.min(textImage.width, Math.max(20, pageWidth - 8));
          const height = textImage.height * (width / textImage.width);
          page.drawImage(image, { x: clamp(annotation.point.x, 2, Math.max(2, pageWidth - width - 2)), y: clamp(annotation.point.y - height, 2, Math.max(2, pageHeight - height - 2)), width, height });
        } else {
          const note = createTextNotePng(annotation.text);
          const image = await document.embedPng(note.dataUrl);
          const { width: pageWidth, height: pageHeight } = page.getSize();
          const width = Math.min(note.width, Math.max(80, pageWidth - 20));
          const height = note.height * (width / note.width);
          page.drawImage(image, { x: clamp(annotation.point.x, 4, Math.max(4, pageWidth - width - 4)), y: clamp(annotation.point.y - height, 4, Math.max(4, pageHeight - height - 4)), width, height });
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
      setAnnotations([]); setDeletedPages(new Set()); setPageRotations({}); setSelectedAnnotationId(null);
      onNotify?.({ kind: "success", message: "PDF 修改已保存" });
    } catch (reason) {
      onNotify?.({ kind: "error", message: reason instanceof Error ? reason.message : "PDF 保存失败" });
    } finally { setSaving(false); }
  };

  const downloadCopy = async () => {
    setSaving(true);
    try {
      const data = await buildPdf();
      const blob = new Blob([data as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = name.replace(/\.pdf$/i, "") + "-已编辑.pdf"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      onNotify?.({ kind: "success", message: "已另存编辑后的 PDF" });
    } catch (reason) {
      onNotify?.({ kind: "error", message: reason instanceof Error ? reason.message : "PDF 导出失败" });
    } finally { setSaving(false); }
  };

  const closeEditor = () => { if (dirty) setCloseConfirmOpen(true); else onClose(); };
  const setZoomPercent = (value: number) => {
    const next = clamp(Math.round(value), 25, 400);
    setZoom(next / 100);
    setZoomInput(String(next));
  };
  const commitZoomInput = () => {
    const next = Number.parseFloat(zoomInput);
    if (!Number.isFinite(next)) {
      setZoomInput(String(Math.round(zoom * 100)));
      return;
    }
    setZoomPercent(next);
  };
  const annotationLayer = [...activeAnnotations, ...(draftAnnotation ? [draftAnnotation] : [])];
  const configType = selectedAnnotation?.type ?? tool;
  const showsStrokeSettings = Boolean(configType && ["highlight", "draw", "rectangle", "arrow", "text"].includes(configType));
  const showsThickness = Boolean(configType && ["draw", "rectangle", "arrow"].includes(configType));
  const showsTextSettings = configType === "text" || configType === "note";
  const currentText = selectedAnnotation && (selectedAnnotation.type === "text" || selectedAnnotation.type === "note") ? selectedAnnotation.text : textDraft;
  const currentColor = selectedAnnotation && "color" in selectedAnnotation ? selectedAnnotation.color : strokeColor;
  const currentThickness = selectedAnnotation && "thickness" in selectedAnnotation ? selectedAnnotation.thickness : strokeThickness;
  const currentFontSize = selectedAnnotation?.type === "text" ? selectedAnnotation.fontSize : fontSize;
  const currentFontFamily = selectedAnnotation?.type === "text" ? selectedAnnotation.fontFamily : fontFamily;
  const selectedAnnotationDeleteLabel = selectedAnnotation ? annotationDeleteLabels[selectedAnnotation.type] : "删除标注";
  const hasToolSettings = Boolean(selectedAnnotation || showsTextSettings || showsStrokeSettings);
  const showPageActions = !tool || tool === "select";
  const showDeletePage = (!tool || tool === "select") && !selectedAnnotation;
  const setColor = (value: string) => { setStrokeColor(value); if (selectedAnnotation && "color" in selectedAnnotation) updateSelectedAnnotation({ color: value }); };
  const setThickness = (value: number) => { setStrokeThickness(value); if (selectedAnnotation && "thickness" in selectedAnnotation) updateSelectedAnnotation({ thickness: value }); };
  const setAnnotationText = (value: string) => { if (selectedAnnotation && (selectedAnnotation.type === "text" || selectedAnnotation.type === "note")) updateSelectedAnnotation({ text: value }); else setTextDraft(value); };
  const setAnnotationFontSize = (value: number) => { setFontSize(value); if (selectedAnnotation?.type === "text") updateSelectedAnnotation({ fontSize: value }); };
  const applyCustomFontSize = () => {
    const parsed = Number.parseFloat(customFontSizeInput);
    if (!Number.isFinite(parsed)) return false;
    const next = clamp(Math.round(parsed), 6, 200);
    setAnnotationFontSize(next);
    setCustomFontSizeInput(String(next));
    return true;
  };
  const setAnnotationFontFamily = (value: FontFamily) => { setFontFamily(value); if (selectedAnnotation?.type === "text") updateSelectedAnnotation({ fontFamily: value }); };
  const toolButtons: Array<{ id: Tool; label: string; icon: React.ReactNode }> = [
    { id: "select", label: "选择", icon: <MousePointer2 className="h-4 w-4" /> },
    { id: "highlight", label: "高亮", icon: <Highlighter className="h-4 w-4" /> },
    { id: "draw", label: "画笔", icon: <Pencil className="h-4 w-4" /> },
    { id: "rectangle", label: "框线", icon: <Square className="h-4 w-4" /> },
    { id: "arrow", label: "箭头", icon: <ArrowUpRight className="h-4 w-4" /> },
    { id: "text", label: "文字", icon: <Type className="h-4 w-4" /> },
    { id: "note", label: "批注", icon: <MessageSquareText className="h-4 w-4" /> },
  ];
  const renderColorPicker = (alignRight = false) => <details className="relative shrink-0">
    <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-xs hover:bg-gray-50 [&::-webkit-details-marker]:hidden dark:border-gray-700 dark:bg-gray-950 dark:hover:bg-gray-800" title="选择颜色"><span className="h-5 w-5 rounded-full border border-black/15 shadow-sm" style={{ backgroundColor: currentColor }} /><span>颜色</span></summary>
    <div className={`absolute top-10 z-[80] w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-2xl ${alignRight ? "right-0" : "left-0"} dark:border-gray-700 dark:bg-gray-900`}>
      <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">自定义颜色</div>
      <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/30">
        <input type="color" value={currentColor} onChange={(event) => setColor(event.target.value)} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0" aria-label="打开自定义颜色选择器" />
        <span className="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-300">选择任意颜色</span>
        <span className="text-[10px] uppercase tabular-nums text-gray-400">{currentColor}</span>
      </label>
      <div className="mb-2 mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">标准色</div>
      <div className="grid grid-cols-6 gap-1.5">{standardColorPresets.map((color) => <button key={color} type="button" onClick={(event) => { setColor(color); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} className={`h-7 w-7 justify-self-center rounded-sm border transition-transform hover:scale-110 ${currentColor.toLowerCase() === color ? "relative z-10 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900" : "border-black/15 dark:border-white/20"}`} style={{ backgroundColor: color }} title={color} aria-label={`选择颜色 ${color}`} />)}</div>
    </div>
  </details>;
  const renderFontSizePicker = (alignRight = false) => <details className="group relative shrink-0" onToggle={(event) => { if (event.currentTarget.open) setCustomFontSizeInput(String(currentFontSize)); }}>
    <summary className="inline-flex h-8 min-w-14 cursor-pointer list-none items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] hover:bg-gray-50 [&::-webkit-details-marker]:hidden dark:border-gray-700 dark:bg-gray-950 dark:hover:bg-gray-800" title="选择字号"><span className="tabular-nums">{currentFontSize}px</span><ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /></summary>
    <div className={`absolute top-10 z-[90] w-40 rounded-lg border border-gray-200 bg-white p-2 shadow-xl ${alignRight ? "right-0" : "left-0"} dark:border-gray-700 dark:bg-gray-900`}>
      <div className="mb-1.5 px-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">字号</div>
      <div className="grid grid-cols-3 gap-1">
        {fontSizePresets.map((size) => <button key={size} type="button" onClick={(event) => { setAnnotationFontSize(size); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} className={`h-8 rounded-md text-xs tabular-nums transition-colors ${currentFontSize === size ? "bg-blue-50 font-medium text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`} aria-label={`字号 ${size} 像素`}>{size}</button>)}
        <div className="col-span-3 flex h-8 min-w-0 items-stretch overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-blue-400 dark:border-gray-700 dark:bg-gray-950">
          <input type="number" min="6" max="200" step="1" value={customFontSizeInput} onChange={(event) => setCustomFontSizeInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && applyCustomFontSize()) (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} className="min-w-0 flex-1 bg-transparent px-1.5 text-[11px] tabular-nums outline-none" aria-label="自定义字号，范围 6 到 200 像素" />
          <span className="inline-flex items-center text-[10px] text-gray-400">px</span>
          <button type="button" onClick={(event) => { if (applyCustomFontSize()) (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} className="ml-1 border-l border-gray-200 px-1.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-blue-950/50">确定</button>
        </div>
      </div>
    </div>
  </details>;
  const getViewBounds = (annotation: Annotation) => {
    if (annotation.type === "text" || annotation.type === "note") return null;
    const sourcePoints = annotation.type === "draw" ? annotation.points : [annotation.start, annotation.end];
    const points = sourcePoints.map(toViewPoint);
    const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
    const left = Math.min(...xs); const top = Math.min(...ys);
    return { left, top, width: Math.max(8, Math.max(...xs) - left), height: Math.max(8, Math.max(...ys) - top) };
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="relative z-40 flex h-12 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1 text-gray-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:overflow-visible dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        <button type="button" onClick={closeEditor} className="mr-0.5 inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800" title="退出 PDF 编辑"><ArrowLeft className="h-4 w-4" /><span>退出编辑</span></button>
        <span className="mx-1 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
        <div className="flex shrink-0 items-center gap-0.5" role="toolbar" aria-label="PDF 标注工具">
          {toolButtons.filter((item) => item.id !== "note").map((item) => <button key={item.id} type="button" onClick={() => chooseTool(item.id)} className={`inline-flex h-10 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-[8px] leading-none md:h-8 md:flex-row md:text-xs lg:w-auto lg:gap-1.5 lg:px-2 ${tool === item.id ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`} title={`${item.label}${tool === item.id ? "（再次点击退出）" : ""}`} aria-label={item.label}>{item.icon}<span className="md:hidden">{item.label}</span><span className="hidden lg:inline">{item.label}</span></button>)}
          {hasToolSettings ? <div className="order-3 hidden min-w-0 items-center gap-1.5 md:flex">
            {selectedAnnotation ? <button type="button" onClick={deleteSelectedAnnotation} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50" title={`${selectedAnnotationDeleteLabel}（也可按退格键或 Delete 键）`}><Trash2 className="h-4 w-4" /><span>{selectedAnnotationDeleteLabel}</span></button> : null}
            {showsTextSettings ? <input value={currentText} onChange={(event) => setAnnotationText(event.target.value)} placeholder={configType === "note" ? "输入批注后点击页面" : "输入文字后点击页面"} className="h-8 w-32 min-w-24 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-blue-400 lg:w-44 2xl:w-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /> : null}
            {showsStrokeSettings ? renderColorPicker(true) : null}
            {showsThickness ? <div className="inline-flex h-8 shrink-0 items-center rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-950" aria-label="线条粗细">{thicknessPresets.map((item) => <button key={item.value} type="button" onClick={() => setThickness(item.value)} className={`inline-flex h-7 w-8 items-center justify-center rounded ${currentThickness === item.value ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"}`} title={`${item.label}线`} aria-label={`${item.label}线`}><span className="block w-4 rounded-full bg-current" style={{ height: item.value }} /></button>)}</div> : null}
            {configType === "text" ? <>{renderFontSizePicker()}<select value={currentFontFamily} onChange={(event) => setAnnotationFontFamily(event.target.value as FontFamily)} className="hidden h-8 shrink-0 rounded-md border border-gray-200 bg-white px-2 text-[11px] outline-none 2xl:block dark:border-gray-700 dark:bg-gray-950"><option value="sans">无衬线</option><option value="serif">衬线</option><option value="mono">等宽</option></select></> : null}
          </div> : null}
          {toolButtons.filter((item) => item.id === "note").map((item) => <button key={item.id} type="button" onClick={() => chooseTool(item.id)} className={`order-1 inline-flex h-10 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-[8px] leading-none md:h-8 md:flex-row md:text-xs lg:w-auto lg:gap-1.5 lg:px-2 ${tool === item.id ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`} title={`${item.label}${tool === item.id ? "（再次点击退出）" : ""}`} aria-label={item.label}>{item.icon}<span className="md:hidden">{item.label}</span><span className="hidden lg:inline">{item.label}</span></button>)}
          {hasToolSettings ? <span className="order-2 mx-1 hidden h-5 w-px shrink-0 bg-gray-200 md:block dark:bg-gray-700" aria-hidden="true" /> : null}
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-1.5 md:flex">
          <button type="button" onClick={() => { const last = annotations[annotations.length - 1]; setAnnotations((current) => current.slice(0, -1)); if (last?.id === selectedAnnotationId) setSelectedAnnotationId(null); }} disabled={!annotations.length} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-gray-100 disabled:opacity-35 dark:hover:bg-gray-800" title="撤销上一个标注"><Undo2 className="h-4 w-4" /><span>撤销</span></button>
          {showPageActions ? <button type="button" onClick={() => setPageRotations((current) => ({ ...current, [pageNumber]: ((current[pageNumber] ?? 0) + 90) % 360 }))} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"><RotateCw className="h-4 w-4" /><span>旋转</span></button> : null}
          {showDeletePage ? <button type="button" onClick={deleteCurrentPage} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"><Trash2 className="h-4 w-4" /><span>删除页面</span></button> : null}
        </div>
        <div className="ml-auto inline-flex shrink-0 items-center md:hidden">
          <button type="button" onClick={() => { const last = annotations[annotations.length - 1]; setAnnotations((current) => current.slice(0, -1)); if (last?.id === selectedAnnotationId) setSelectedAnnotationId(null); }} disabled={!annotations.length} className="inline-flex h-10 w-9 flex-col items-center justify-center gap-0.5 rounded-md text-[8px] leading-none hover:bg-gray-100 disabled:opacity-35 dark:hover:bg-gray-800" title="撤销上一个标注"><Undo2 className="h-4 w-4" /><span>撤销</span></button>
          {showPageActions ? <button type="button" onClick={() => setPageRotations((current) => ({ ...current, [pageNumber]: ((current[pageNumber] ?? 0) + 90) % 360 }))} className="inline-flex h-10 w-9 flex-col items-center justify-center gap-0.5 rounded-md text-[8px] leading-none hover:bg-gray-100 dark:hover:bg-gray-800" title="旋转"><RotateCw className="h-4 w-4" /><span>旋转</span></button> : null}
          {showDeletePage ? <button type="button" onClick={deleteCurrentPage} className="inline-flex h-10 w-11 flex-col items-center justify-center gap-0.5 rounded-md text-[8px] leading-none text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50" title="删除页面"><Trash2 className="h-4 w-4" /><span>删除页面</span></button> : null}
        </div>
        {onSave ? <div className="ml-1.5 inline-flex h-8 shrink-0 items-stretch rounded-md bg-blue-600 text-white shadow-sm">
          <button type="button" onClick={() => void saveChanges()} disabled={!dirty || saving || loading} className="inline-flex items-center gap-1 rounded-l-md px-2.5 text-xs font-medium hover:bg-blue-700 disabled:opacity-40"><Save className="h-4 w-4" /><span className="hidden sm:inline">{saving ? "处理中" : "保存"}</span></button>
          <details className="relative border-l border-white/25"><summary className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-r-md hover:bg-blue-700 [&::-webkit-details-marker]:hidden" title="更多保存操作" aria-label="更多保存操作"><ChevronDown className="h-3.5 w-3.5" /></summary><div className="absolute right-0 top-10 z-[90] w-36 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-700 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"><button type="button" onClick={(event) => { void downloadCopy(); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} disabled={saving || loading} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-xs hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"><Download className="h-4 w-4" />另存为</button></div></details>
        </div> : null}
      </div>
      {hasToolSettings ? <div className="relative z-30 flex h-11 shrink-0 items-center gap-1.5 border-b border-gray-200 bg-white px-2 md:hidden dark:border-gray-800 dark:bg-gray-900">
        {selectedAnnotation ? <button type="button" onClick={deleteSelectedAnnotation} className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50" title={`${selectedAnnotationDeleteLabel}（也可按退格键或 Delete 键）`}><Trash2 className="h-4 w-4" /><span>{selectedAnnotationDeleteLabel}</span></button> : null}
        {showsTextSettings ? <input value={currentText} onChange={(event) => setAnnotationText(event.target.value)} placeholder={configType === "note" ? "输入批注后点击页面" : "输入文字后点击页面"} className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /> : <span className="min-w-0 flex-1" />}
        {showsStrokeSettings ? renderColorPicker(true) : null}
        {showsThickness ? <div className="inline-flex h-8 shrink-0 items-center rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-950">{thicknessPresets.map((item) => <button key={item.value} type="button" onClick={() => setThickness(item.value)} className={`inline-flex h-7 w-7 items-center justify-center rounded ${currentThickness === item.value ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "text-gray-500 dark:text-gray-400"}`} title={`${item.label}线`}><span className="w-4 rounded-full bg-current" style={{ height: item.value }} /></button>)}</div> : null}
        {configType === "text" ? renderFontSizePicker(true) : null}
      </div> : null}

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto bg-gray-100 p-2 sm:p-4 dark:bg-gray-950">
        {loading ? <LoadingState variant="preview" label="正在打开 PDF 编辑器…" className="absolute inset-0 z-20 bg-gray-100 dark:bg-gray-950" /> : null}
        {error ? <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center text-sm text-red-600 dark:text-red-300">{error}</div> : null}
        {!error && pdfDocument ? <div className={`relative mx-auto select-none bg-white shadow-xl ${viewport ? "" : "invisible"}`} style={{ width: viewport?.width ?? 1, height: viewport?.height ?? 1 }}><canvas ref={canvasRef} className="block" />{viewport ? <div className={`absolute inset-0 touch-none ${!tool || tool === "select" ? "cursor-default" : tool === "text" || tool === "note" ? "cursor-text" : "cursor-crosshair"}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {annotationLayer.map((annotation) => {
              const selected = annotation.id === selectedAnnotationId;
              if (annotation.type === "highlight") { const start = toViewPoint(annotation.start); const end = toViewPoint(annotation.end); return <rect key={annotation.id} data-annotation-id={annotation.id} x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} fill={annotation.color} fillOpacity=".34" stroke={selected ? "#2563eb" : annotation.color} strokeOpacity={selected ? 1 : 0.7} strokeWidth={selected ? 2 : 1} pointerEvents={tool === "select" ? "all" : "none"} style={{ cursor: tool === "select" ? "move" : undefined }} />; }
              if (annotation.type === "draw") { const points = annotation.points.map(toViewPoint).map((point) => `${point.x},${point.y}`).join(" "); return <g key={annotation.id} data-annotation-id={annotation.id} pointerEvents={tool === "select" ? "stroke" : "none"} style={{ cursor: tool === "select" ? "move" : undefined }}><polyline points={points} fill="none" stroke={annotation.color} strokeWidth={annotation.thickness * renderedScale} strokeLinecap="round" strokeLinejoin="round" /><polyline points={points} fill="none" stroke="transparent" strokeWidth={Math.max(12, annotation.thickness * renderedScale + 8)} /></g>; }
              if (annotation.type === "rectangle") { const start = toViewPoint(annotation.start); const end = toViewPoint(annotation.end); return <rect key={annotation.id} data-annotation-id={annotation.id} x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} fill="transparent" stroke={annotation.color} strokeWidth={annotation.thickness * renderedScale} pointerEvents={tool === "select" ? "all" : "none"} style={{ cursor: tool === "select" ? "move" : undefined }} />; }
              if (annotation.type === "arrow") { const start = toViewPoint(annotation.start); const end = toViewPoint(annotation.end); const [headA, headB] = getArrowHead(start, end, annotation.thickness * renderedScale); return <g key={annotation.id} data-annotation-id={annotation.id} fill="none" stroke={annotation.color} strokeWidth={annotation.thickness * renderedScale} strokeLinecap="round" strokeLinejoin="round" pointerEvents={tool === "select" ? "stroke" : "none"} style={{ cursor: tool === "select" ? "move" : undefined }}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} /><line x1={end.x} y1={end.y} x2={headA.x} y2={headA.y} /><line x1={end.x} y1={end.y} x2={headB.x} y2={headB.y} /><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={Math.max(12, annotation.thickness * renderedScale + 8)} /></g>; }
              return null;
            })}
            {selectedAnnotation ? (() => { const bounds = getViewBounds(selectedAnnotation); return bounds ? <rect x={bounds.left - 4} y={bounds.top - 4} width={bounds.width + 8} height={bounds.height + 8} fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5 3" pointerEvents="none" /> : null; })() : null}
          </svg>
          {annotationLayer.filter((annotation): annotation is Extract<Annotation, { type: "text" | "note" }> => annotation.type === "text" || annotation.type === "note").map((annotation) => { const point = toViewPoint(annotation.point); if (annotation.type === "note") return <div key={annotation.id} data-annotation-id={annotation.id} className={`absolute max-w-56 whitespace-pre-wrap rounded border border-amber-400 bg-yellow-100/95 px-2 py-1.5 text-xs leading-5 text-amber-950 shadow ${tool === "select" ? "pointer-events-auto cursor-move" : "pointer-events-none"} ${annotation.id === selectedAnnotationId ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ left: point.x, top: point.y }}>{annotation.text}</div>; return <div key={annotation.id} data-annotation-id={annotation.id} className={`absolute max-w-80 whitespace-pre-wrap leading-[1.3] ${tool === "select" ? "pointer-events-auto cursor-move" : "pointer-events-none"} ${annotation.id === selectedAnnotationId ? "rounded-sm ring-2 ring-blue-500 ring-offset-2" : ""}`} style={{ left: point.x, top: point.y, color: annotation.color, fontSize: annotation.fontSize * renderedScale, fontFamily: fontStacks[annotation.fontFamily] }}>{annotation.text}</div>; })}
        </div> : null}</div> : <canvas ref={canvasRef} className="hidden" />}
      </div>

      <div className="grid h-9 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-gray-200 bg-white px-1.5 text-xs text-gray-600 sm:px-2.5 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        <span className={`justify-self-start whitespace-nowrap text-[10px] sm:text-[11px] ${dirty ? "font-medium text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}><span className="sm:hidden">{dirty ? "未保存" : "已保存"}</span><span className="hidden sm:inline">{dirty ? "有未保存修改" : "已保存"}</span></span>
        <div className="flex items-center justify-center gap-0.5 sm:gap-2">
          <button type="button" onClick={() => goRelative(-1)} disabled={visiblePages.indexOf(pageNumber) <= 0} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800" title="上一页"><ChevronLeft className="h-4 w-4" /></button>
          <span className="whitespace-nowrap">第 {visiblePages.indexOf(pageNumber) + 1} / {visiblePages.length || 1} 页<span className="hidden sm:inline">{deletedPages.size ? ` · 已删除 ${deletedPages.size} 页` : ""}</span></span>
          <button type="button" onClick={() => goRelative(1)} disabled={visiblePages.indexOf(pageNumber) >= visiblePages.length - 1} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800" title="下一页"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="inline-flex h-7 justify-self-end items-center gap-0.5" aria-label="页面缩放">
          <button type="button" onClick={() => setZoomPercent(zoom * 100 - 10)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800" disabled={zoom <= 0.25} title="缩小"><ZoomOut className="h-3.5 w-3.5" /></button>
          <input type="range" min="25" max="400" step="5" value={Math.round(zoom * 100)} onChange={(event) => setZoomPercent(Number(event.target.value))} className="h-1 w-12 cursor-pointer appearance-none rounded-full bg-gray-300 outline-none sm:w-20 lg:w-28 dark:bg-gray-600 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600" aria-label="缩放比例" />
          <button type="button" onClick={() => setZoomPercent(zoom * 100 + 10)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800" disabled={zoom >= 4} title="放大"><ZoomIn className="h-3.5 w-3.5" /></button>
          <details className="group relative shrink-0">
            <summary className="inline-flex h-7 min-w-12 cursor-pointer list-none items-center justify-end gap-0.5 rounded px-1 text-[11px] font-medium tabular-nums hover:bg-gray-100 [&::-webkit-details-marker]:hidden dark:hover:bg-gray-800" title="输入或选择缩放比例"><span>{Math.round(zoom * 100)}%</span><ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /></summary>
            <div className="absolute bottom-9 right-0 z-[90] w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-200">缩放比例</div>
              <div className="flex h-8 items-stretch rounded-md border border-gray-200 bg-white focus-within:border-blue-400 dark:border-gray-700 dark:bg-gray-950">
                <input type="number" min="25" max="400" step="1" value={zoomInput} onChange={(event) => setZoomInput(event.target.value)} onBlur={commitZoomInput} onKeyDown={(event) => { if (event.key === "Enter") { commitZoomInput(); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); } }} className="min-w-0 flex-1 bg-transparent px-2 text-xs tabular-nums outline-none" aria-label="手动输入缩放百分比" />
                <span className="inline-flex items-center border-l border-gray-200 px-2 text-xs text-gray-400 dark:border-gray-700">%</span>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { commitZoomInput(); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} className="border-l border-gray-200 px-2 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-blue-950/50">应用</button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {[50, 75, 100, 125, 150, 200].map((value) => <button key={value} type="button" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { setZoomPercent(value); (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} className={`h-7 rounded text-[11px] tabular-nums ${Math.round(zoom * 100) === value ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>{value}%</button>)}
              </div>
            </div>
          </details>
        </div>
      </div>
      <Modal open={closeConfirmOpen} title="退出 PDF 编辑" onClose={() => setCloseConfirmOpen(false)} closeOnBackdropClick zIndex={520} panelClassName="max-w-md" footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setCloseConfirmOpen(false)} className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">继续编辑</button><button type="button" onClick={() => { setCloseConfirmOpen(false); onDirtyChange?.(false); onClose(); }} className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">放弃修改并退出</button></div>}><div className="py-1"><p className="text-sm font-medium text-gray-900 dark:text-gray-100">当前修改还没有保存</p><p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">退出后，本次添加的标注和页面调整都会丢失。</p></div></Modal>
    </div>
  );
}
