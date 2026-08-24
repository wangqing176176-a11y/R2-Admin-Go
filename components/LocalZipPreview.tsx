"use client";

import { useEffect, useRef, useState } from "react";
import JSZip, { type JSZipObject } from "jszip";
import { Archive, Box, ChevronDown, ChevronRight, ChevronsDownUp, Download, File, FileText, Film, Folder, FolderOpen, Image as ImageIcon, Menu, MoreHorizontal, Music, RefreshCw, ScanLine, Search, ShieldCheck, X } from "lucide-react";
import ArtVideoPlayer from "./ArtVideoPlayer";
import AudioPreviewPlayer from "./AudioPreviewPlayer";
import LocalImagePreview from "./LocalImagePreview";
import LocalModelPreview from "./LocalModelPreview";
import LocalPdfPreview from "./LocalPdfPreview";
import TextPreviewPanel from "./TextPreviewPanel";
import { buildMlightCadPreviewUrl } from "@/lib/mlightcad";
import { SAFE_PREVIEW_SETTINGS, resolvePreviewKind } from "@/lib/preview-policy";

type ArchiveNode = {
  name: string;
  path: string;
  directory: boolean;
  size?: number;
  entry?: JSZipObject;
  children: ArchiveNode[];
};

type EntryPreview =
  | { kind: "empty" }
  | { kind: "folder"; node: ArchiveNode }
  | { kind: "loading" }
  | { kind: "unsupported"; message: string }
  | { kind: "error"; message: string }
  | { kind: "text"; text: string }
  | { kind: "image" | "pdf" | "audio" | "video" | "model" | "cad"; url: string };

type PreviewableKind = "text" | "image" | "pdf" | "audio" | "video" | "model" | "cad";

const localPreviewKind = (name: string): PreviewableKind | "unsupported" => {
  const kind = resolvePreviewKind(name, SAFE_PREVIEW_SETTINGS);
  return kind === "text" || kind === "image" || kind === "pdf" || kind === "audio" || kind === "video" || kind === "model" || kind === "cad"
    ? kind
    : "unsupported";
};

const getExtension = (name: string) => name.includes(".") ? name.split(".").pop()!.toLocaleLowerCase() : "";

const formatSize = (bytes?: number) => {
  if (!Number.isFinite(bytes ?? NaN)) return "—";
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const entrySize = (entry: JSZipObject) => (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;

const mimeType = (extension: string) => {
  const types: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
    mp4: "video/mp4", webm: "video/webm", m4v: "video/x-m4v",
    glb: "model/gltf-binary", gltf: "model/gltf+json", obj: "model/obj", stl: "model/stl", "3mf": "model/3mf", dae: "model/vnd.collada+xml", wrl: "model/vrml",
    dwg: "application/acad", dxf: "image/vnd.dxf", dwt: "application/acad",
  };
  return types[extension] ?? "application/octet-stream";
};

const sortTree = (node: ArchiveNode) => {
  node.children.sort((left, right) => Number(right.directory) - Number(left.directory) || left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
  node.children.forEach(sortTree);
};

const buildTree = (files: Record<string, JSZipObject>) => {
  const root: ArchiveNode = { name: "压缩包", path: "", directory: true, children: [] };
  const map = new Map<string, ArchiveNode>([["", root]]);
  Object.values(files).forEach((entry) => {
    const normalized = entry.name.replace(/^\/+|\/+$/g, "");
    if (!normalized) return;
    const parts = normalized.split("/").filter(Boolean);
    let parent = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const isLast = index === parts.length - 1;
      const directory = !isLast || entry.dir;
      let node = map.get(path);
      if (!node) {
        node = { name: part, path, directory, children: [] };
        map.set(path, node);
        parent.children.push(node);
      }
      if (isLast) {
        node.directory = entry.dir;
        node.entry = entry.dir ? undefined : entry;
        node.size = entry.dir ? undefined : entrySize(entry);
      }
      parent = node;
    });
  });
  sortTree(root);
  return { root, map };
};

const nodeIcon = (node: ArchiveNode, expanded: boolean) => {
  if (node.directory) return expanded ? <FolderOpen className="h-4 w-4 text-blue-500" /> : <Folder className="h-4 w-4 text-blue-500" />;
  const kind = localPreviewKind(node.name);
  if (kind === "image") return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (kind === "audio") return <Music className="h-4 w-4 text-blue-500" />;
  if (kind === "video") return <Film className="h-4 w-4 text-blue-500" />;
  if (kind === "model") return <Box className="h-4 w-4 text-blue-500" />;
  if (kind === "cad") return <ScanLine className="h-4 w-4 text-blue-500" />;
  if (kind === "text" || kind === "pdf") return <FileText className="h-4 w-4 text-blue-500" />;
  return <File className="h-4 w-4 text-gray-400 dark:text-gray-500" />;
};

export default function LocalZipPreview({ sourceUrl, size }: { sourceUrl: string; size?: number }) {
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<ArchiveNode | null>(null);
  const [nodeMap, setNodeMap] = useState(new Map<string, ArchiveNode>());
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const [selectedPath, setSelectedPath] = useState("");
  const [preview, setPreview] = useState<EntryPreview>({ kind: "empty" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const tooLarge = Number.isFinite(size ?? NaN) && (size ?? 0) > 250 * 1024 * 1024;
  const selectedNode = nodeMap.get(selectedPath) ?? tree;
  const nodes = [...nodeMap.values()];
  const fileCount = nodes.filter((node) => !node.directory).length;
  const folderCount = Math.max(0, nodes.filter((node) => node.directory).length - 1);
  const uncompressedSize = nodes.reduce((total, node) => total + (node.size ?? 0), 0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const resetFrame = window.requestAnimationFrame(() => { if (!disposed) setMobileTreeOpen(false); });
    if (tooLarge) return () => { disposed = true; window.cancelAnimationFrame(resetFrame); controller.abort(); };
    void fetch(sourceUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`读取压缩包失败（${response.status}）`);
        const length = Number(response.headers.get("content-length") ?? 0);
        if (length > 250 * 1024 * 1024) throw new Error("压缩包超过 250 MB，请下载后在本地解压");
        return response.arrayBuffer();
      })
      .then((buffer) => JSZip.loadAsync(buffer))
      .then((zip) => {
        if (disposed) return;
        const next = buildTree(zip.files);
        setTree(next.root);
        setNodeMap(next.map);
        setExpanded(new Set(next.root.children.filter((node) => node.directory).map((node) => node.path)));
        setSelectedPath("");
        if (window.matchMedia("(max-width: 767px)").matches) setMobileTreeOpen(true);
      })
      .catch((reason) => {
        if (!disposed && (reason as { name?: unknown })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "ZIP 解析失败");
      })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(resetFrame);
      controller.abort();
    };
  }, [sourceUrl, tooLarge]);

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    void (async () => {
      if (!selectedNode) {
        setPreview({ kind: "empty" });
        return;
      }
      if (selectedNode.directory) {
        setPreview({ kind: "folder", node: selectedNode });
        return;
      }
      if (!selectedNode.entry) {
        setPreview({ kind: "error", message: "无法读取该文件在压缩包中的数据记录。" });
        return;
      }
      const extension = getExtension(selectedNode.name);
      const kind = localPreviewKind(selectedNode.name);
      if (kind === "unsupported") {
        setPreview({ kind, message: "此文件格式暂未纳入浏览器本地预览范围。为避免将文件提交至外部服务，请下载后使用本地应用打开。" });
        return;
      }
      const limit = kind === "text" ? 5 * 1024 * 1024 : 120 * 1024 * 1024;
      if ((selectedNode.size ?? 0) > limit) {
        setPreview({ kind: "unsupported", message: `该文件体积超过本地${kind === "text" ? "文本" : "文件"}预览上限（${formatSize(limit)}），请下载后查看。` });
        return;
      }
      setPreview({ kind: "loading" });
      try {
        if (kind === "text") {
          const text = await selectedNode.entry.async("text");
          if (disposed) return;
          let displayText = text;
          if (extension === "json") {
            try { displayText = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Keep the original malformed JSON. */ }
          }
          setPreview({ kind, text: displayText });
        } else {
          const blob = await selectedNode.entry.async("blob");
          if (disposed) return;
          objectUrl = URL.createObjectURL(new Blob([blob], { type: mimeType(extension) }));
          setPreview({ kind, url: objectUrl });
        }
      } catch {
        if (!disposed) setPreview({ kind: "error", message: kind === "text" ? "无法解码此文本文件，文件可能使用了不兼容的字符编码。" : "文件解压失败，压缩包可能已损坏或采用了不兼容的加密方式。" });
      }
    })();
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedNode]);

  useEffect(() => {
    if (!mobileActionsOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!mobileActionsRef.current?.contains(event.target as Node)) setMobileActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileActionsOpen(false);
    };
    window.document.addEventListener("pointerdown", closeOnOutsidePress);
    window.document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileActionsOpen]);

  const downloadEntry = async () => {
    if (!selectedNode?.entry) return;
    try {
      const blob = await selectedNode.entry.async("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = selectedNode.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setPreview({ kind: "error", message: "提取文件失败，无法完成下载。" });
    }
  };

  const filteredPaths = (() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return null;
    const paths = new Set<string>();
    nodes.forEach((node) => {
      if (!node.path.toLocaleLowerCase().includes(normalized)) return;
      paths.add(node.path);
      const parts = node.path.split("/");
      while (parts.length > 1) { parts.pop(); paths.add(parts.join("/")); }
    });
    return paths;
  })();

  const selectNode = (node: ArchiveNode) => {
    setSelectedPath(node.path);
    if (node.directory) setExpanded((current) => { const next = new Set(current); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next; });
    else setMobileTreeOpen(false);
  };

  const renderNodes = (items: ArchiveNode[], depth = 0): React.ReactNode => items.map((node) => {
    if (filteredPaths && !filteredPaths.has(node.path)) return null;
    const isExpanded = expanded.has(node.path) || Boolean(query.trim());
    const selected = selectedNode?.path === node.path;
    return <div key={node.path}><button type="button" onClick={() => selectNode(node)} className={`flex h-9 w-full items-center gap-1.5 pr-2 text-left text-xs ${selected ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-gray-100"}`} style={{ paddingLeft: `${8 + depth * 14}px` }}>{node.directory ? <span className="flex h-6 w-4 shrink-0 items-center justify-center text-gray-400 dark:text-gray-500">{isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span> : <span className="w-4 shrink-0" />}{nodeIcon(node, isExpanded)}<span className="min-w-0 flex-1 truncate" title={node.path}>{node.name}</span>{!node.directory ? <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">{formatSize(node.size)}</span> : null}</button>{node.directory && isExpanded ? renderNodes(node.children, depth + 1) : null}</div>;
  });

  const breadcrumbs = selectedNode?.path ? selectedNode.path.split("/") : [];
  const renderPreview = () => {
    if (!selectedNode || preview.kind === "empty") return <EmptyArchiveState onOpenDirectory={() => setMobileTreeOpen(true)} />;
    if (preview.kind === "loading") return <div className="flex h-full items-center justify-center gap-2 bg-white text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-300"><RefreshCw className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />文件解压中…</div>;
    if (preview.kind === "folder") {
      const directFiles = preview.node.children.filter((node) => !node.directory).length;
      const directFolders = preview.node.children.length - directFiles;
      return <div className="flex h-full items-center justify-center p-6"><div className="w-full max-w-sm rounded-xl border border-blue-100 bg-blue-50/60 p-6 text-center dark:border-blue-900 dark:bg-blue-950/20"><FolderOpen className="mx-auto h-12 w-12 text-blue-500" /><div className="mt-3 truncate font-medium text-gray-900 dark:text-gray-100">{preview.node.name}</div><div className="mt-1 text-sm text-gray-500 dark:text-gray-400">包含 {directFolders} 个文件夹、{directFiles} 个文件</div><button type="button" onClick={() => setMobileTreeOpen(true)} className="mx-auto mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 md:hidden dark:bg-blue-600 dark:hover:bg-blue-500"><FolderOpen className="h-4 w-4" />打开文件目录<ChevronRight className="h-4 w-4" /></button><div className="mt-4 hidden text-xs text-blue-700 md:block dark:text-blue-300">从左侧目录选择文件即可在此处预览</div></div></div>;
    }
    if (preview.kind === "unsupported" || preview.kind === "error") return <div className="flex h-full items-center justify-center bg-white p-6 text-center dark:bg-gray-950"><div className="max-w-md"><File className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" /><div className="mt-4 font-medium text-gray-800 dark:text-gray-100">{preview.kind === "unsupported" ? "暂不支持本地预览" : "文件读取失败"}</div><div className={`mt-2 text-sm leading-6 ${preview.kind === "error" ? "text-red-600 dark:text-red-300" : "text-gray-500 dark:text-gray-400"}`}>{preview.message}</div>{selectedNode.entry ? <button type="button" onClick={() => void downloadEntry()} className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"><Download className="h-4 w-4" />下载此文件</button> : null}</div></div>;
    if (preview.kind === "text") return <TextPreviewPanel name={selectedNode.name} text={preview.text} />;
    if (preview.kind === "image") return <LocalImagePreview sourceUrl={preview.url} name={selectedNode.name} />;
    if (preview.kind === "pdf") return <LocalPdfPreview sourceUrl={preview.url} name={selectedNode.name} />;
    if (preview.kind === "model") return <LocalModelPreview sourceUrl={preview.url} name={selectedNode.name} />;
    if (preview.kind === "cad") {
      const cadUrl = buildMlightCadPreviewUrl(preview.url, selectedNode.name);
      return cadUrl ? <iframe src={cadUrl} className="h-full w-full border-0 bg-white dark:bg-gray-950" title={`CAD 预览：${selectedNode.name}`} allowFullScreen /> : <div className="flex h-full items-center justify-center bg-white px-6 text-center text-sm text-red-600 dark:bg-gray-950 dark:text-red-300">CAD 预览器地址未配置</div>;
    }
    if (preview.kind === "audio") return <div className="h-full overflow-hidden bg-white dark:bg-gray-900"><AudioPreviewPlayer name={selectedNode.name} keyPath={selectedNode.path} url={preview.url} size={selectedNode.size} onDownload={() => downloadEntry()} /></div>;
    return <div className="h-full overflow-hidden bg-black"><ArtVideoPlayer url={preview.url} title={selectedNode.name} /></div>;
  };

  if (tooLarge) return <div className="flex h-full items-center justify-center bg-white px-6 text-center text-sm text-amber-700 dark:bg-gray-950 dark:text-amber-300">压缩包超过 250 MB。为避免浏览器内存占用过高，请下载后在本地解压。</div>;
  if (loading || !tree) return <div className="flex h-full items-center justify-center gap-2 bg-white px-6 text-center text-gray-600 dark:bg-gray-950 dark:text-gray-300"><RefreshCw className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" /><span className="text-sm font-medium">压缩包解析中…</span></div>;
  if (error) return <div className="flex h-full items-center justify-center bg-white px-6 text-center text-sm text-red-600 dark:bg-gray-950 dark:text-red-300">{error}</div>;

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100">
      {mobileTreeOpen ? <button type="button" className="absolute inset-0 z-20 bg-black/25 md:hidden" onClick={() => setMobileTreeOpen(false)} aria-label="关闭压缩包目录" /> : null}
      <aside className={`${mobileTreeOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-30 w-[min(86vw,21rem)] flex-col border-r border-gray-200 bg-white shadow-xl md:relative md:flex md:w-72 md:shrink-0 md:shadow-none dark:border-gray-800 dark:bg-gray-900`}>
        <div className="border-b border-gray-200 p-3 dark:border-gray-800"><div className="flex items-center justify-between"><div className="flex min-w-0 items-center gap-2"><Archive className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" /><span className="truncate text-sm font-medium">压缩包目录</span></div><button type="button" onClick={() => setMobileTreeOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 md:hidden dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"><X className="h-4 w-4" /></button></div><div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{fileCount} 个文件 · {folderCount} 个文件夹 · 解压后 {formatSize(uncompressedSize)}</div></div>
        <div className="flex gap-1.5 border-b border-gray-100 p-2 dark:border-gray-800"><label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 dark:border-gray-700 dark:bg-gray-950"><Search className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索压缩包内容" className="min-w-0 flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500" /></label><button type="button" onClick={() => setExpanded(new Set(nodes.filter((node) => node.directory).map((node) => node.path)))} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-400 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="展开全部文件夹"><ChevronsDownUp className="h-4 w-4" /></button><button type="button" onClick={() => setExpanded(new Set())} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-400 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="折叠全部文件夹"><ChevronsDownUp className="h-4 w-4 rotate-180" /></button></div>
        <div className="min-h-0 flex-1 overflow-auto py-1">{tree ? renderNodes(tree.children) : null}{filteredPaths?.size === 0 ? <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">没有匹配的文件或文件夹</div> : null}</div>
        <div className="flex items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400 dark:border-gray-800 dark:text-gray-500"><ShieldCheck className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />全部内容仅在当前浏览器内解压</div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative flex h-11 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-1.5 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 md:hidden">
          <button type="button" onClick={() => setMobileTreeOpen(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="打开压缩包目录" aria-label="打开压缩包目录"><Menu className="h-4 w-4" /></button>
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium" title={selectedNode?.path || "压缩包"}>{selectedNode?.name || "压缩包"}</span>
          {selectedNode?.entry ? <button type="button" onClick={() => void downloadEntry()} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="下载当前文件" aria-label="下载当前文件"><Download className="h-4 w-4" /></button> : null}
          <div ref={mobileActionsRef} className="relative shrink-0">
            <button type="button" onClick={() => setMobileActionsOpen((value) => !value)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${mobileActionsOpen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="更多压缩包工具" aria-label="更多压缩包工具" aria-expanded={mobileActionsOpen}><MoreHorizontal className="h-5 w-5" /></button>
            {mobileActionsOpen ? (
              <div className="absolute right-0 top-9 z-40 grid w-44 gap-0.5 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-700 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <button type="button" onClick={() => { setSelectedPath(""); setMobileActionsOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Archive className="h-4 w-4" />返回压缩包根目录</button>
                {selectedNode?.path ? <button type="button" onClick={() => { const parts = selectedNode.path.split("/"); parts.pop(); setSelectedPath(parts.join("/")); setMobileActionsOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><FolderOpen className="h-4 w-4" />返回上级目录</button> : null}
                <button type="button" onClick={() => { setExpanded(new Set(nodes.filter((node) => node.directory).map((node) => node.path))); setMobileActionsOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><ChevronsDownUp className="h-4 w-4" />展开全部目录</button>
                <button type="button" onClick={() => { setExpanded(new Set()); setMobileActionsOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><ChevronsDownUp className="h-4 w-4 rotate-180" />折叠全部目录</button>
                {selectedNode?.entry ? <><div className="my-0.5 border-t border-gray-100 dark:border-gray-800" /><button type="button" onClick={() => { void downloadEntry(); setMobileActionsOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Download className="h-4 w-4" />下载当前文件</button></> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="hidden h-11 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 md:flex"><div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-gray-500 dark:text-gray-400"><button type="button" onClick={() => setSelectedPath("")} className="shrink-0 rounded px-1.5 py-1 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300">压缩包</button>{breadcrumbs.map((segment, index) => { const path = breadcrumbs.slice(0, index + 1).join("/"); return <span key={path} className="flex shrink-0 items-center gap-1"><ChevronRight className="h-3 w-3 text-gray-300 dark:text-gray-600" /><button type="button" onClick={() => setSelectedPath(path)} className={`max-w-40 truncate rounded px-1.5 py-1 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300 ${index === breadcrumbs.length - 1 ? "font-medium text-gray-800 dark:text-gray-100" : ""}`}>{segment}</button></span>; })}</div>{selectedNode?.entry ? <button type="button" onClick={() => void downloadEntry()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Download className="h-4 w-4" />下载文件</button> : null}</div>
        <div className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-gray-950">{renderPreview()}</div>
      </main>
    </div>
  );
}

function EmptyArchiveState({ onOpenDirectory }: { onOpenDirectory: () => void }) {
  return <div className="flex h-full items-center justify-center bg-white p-6 text-center dark:bg-gray-950"><div><Archive className="mx-auto h-14 w-14 text-blue-200 dark:text-blue-500" /><div className="mt-3 font-medium text-gray-800 dark:text-gray-100">选择一个文件开始预览</div><div className="mt-2 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">支持 PDF、图片、文本与代码、音频、视频、CAD 及 3D 模型等浏览器本地预览格式。其他格式将提供安全提示和下载入口。</div><button type="button" onClick={onOpenDirectory} className="mx-auto mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 md:hidden dark:bg-blue-600 dark:hover:bg-blue-500"><FolderOpen className="h-4 w-4" />打开文件目录<ChevronRight className="h-4 w-4" /></button></div></div>;
}
