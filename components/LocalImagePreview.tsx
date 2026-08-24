"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FlipHorizontal2, FlipVertical2, Focus, Maximize2, Moon, RefreshCcw, RotateCcw, RotateCw, Sun, ZoomIn, ZoomOut } from "lucide-react";
import Viewer from "viewerjs";
import "viewerjs/dist/viewer.css";

type ImageSize = { width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function LocalImagePreview({ sourceUrl, name }: { sourceUrl: string; name: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [naturalSize, setNaturalSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<ImageSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [fitWindow, setFitWindow] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [darkBackground, setDarkBackground] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const rotated = Math.abs(rotation % 180) === 90;
  const rotatedWidth = rotated ? naturalSize.height : naturalSize.width;
  const rotatedHeight = rotated ? naturalSize.width : naturalSize.height;
  const fitScale = naturalSize.width && viewportSize.width
    ? clamp(Math.min((viewportSize.width - 32) / rotatedWidth, (viewportSize.height - 32) / rotatedHeight, 1), 0.01, 1)
    : 1;
  const displayScale = fitWindow ? fitScale : zoom;
  const displayWidth = Math.max(1, rotatedWidth * displayScale);
  const displayHeight = Math.max(1, rotatedHeight * displayScale);

  const changeZoom = (delta: number) => {
    setZoom(clamp((fitWindow ? fitScale : zoom) + delta, 0.05, 8));
    setFitWindow(false);
  };

  const resetImage = () => {
    setFitWindow(true);
    setZoom(1);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
  };

  const downloadImage = () => {
    const link = document.createElement("a");
    link.href = sourceUrl;
    link.download = name;
    link.click();
  };

  useEffect(() => {
    if (!imageRef.current) return;
    const viewer = new Viewer(imageRef.current, {
      navbar: false,
      title: () => name,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        prev: false,
        play: false,
        next: false,
        rotateLeft: true,
        rotateRight: true,
        flipHorizontal: true,
        flipVertical: true,
      },
      tooltip: true,
      transition: true,
    });
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [name, sourceUrl]);

  useEffect(() => {
    const target = viewportRef.current;
    if (!target) return;
    const updateSize = () => setViewportSize({ width: target.clientWidth, height: target.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white text-gray-700 dark:bg-gray-900 dark:text-gray-200">
      <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-gray-200 bg-white px-1 text-gray-700 sm:h-12 sm:gap-1 sm:px-2 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
        <button type="button" onClick={() => changeZoom(-0.1)} disabled={!naturalSize.width} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="缩小图片"><ZoomOut className="h-4 w-4" /><span className="hidden sm:inline">缩小</span></button>
        <span className="min-w-12 shrink-0 text-center text-xs text-gray-500 dark:text-gray-400">{Math.round(displayScale * 100)}%</span>
        <button type="button" onClick={() => changeZoom(0.1)} disabled={!naturalSize.width} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="放大图片"><ZoomIn className="h-4 w-4" /><span className="hidden sm:inline">放大</span></button>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />
        <button type="button" onClick={() => setFitWindow(true)} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${fitWindow ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="缩放至适合当前窗口"><Focus className="h-4 w-4" /><span className="hidden sm:inline">适应窗口</span></button>
        <button type="button" onClick={() => { setZoom(1); setFitWindow(false); }} className={`inline-flex h-8 shrink-0 items-center rounded-md px-2 text-xs ${!fitWindow && zoom === 1 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="按图片原始像素显示"><span className="sm:hidden">1:1</span><span className="hidden sm:inline">原始尺寸</span></button>
        <button type="button" onClick={resetImage} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="恢复初始显示"><RefreshCcw className="h-4 w-4" /><span className="hidden sm:inline">重置</span></button>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />
        <button type="button" onClick={() => setRotation((value) => value - 90)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="向左旋转"><RotateCcw className="h-4 w-4" /></button>
        <button type="button" onClick={() => setRotation((value) => value + 90)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="向右旋转"><RotateCw className="h-4 w-4" /></button>
        <button type="button" onClick={() => setFlipX((value) => !value)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${flipX ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="水平翻转"><FlipHorizontal2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => setFlipY((value) => !value)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${flipY ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="垂直翻转"><FlipVertical2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => setDarkBackground((value) => !value)} className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs ${darkBackground ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title={`切换为${darkBackground ? "浅色" : "深色"}背景`}>{darkBackground ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}<span className="hidden sm:inline">{darkBackground ? "深色" : "浅色"}</span></button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {naturalSize.width ? <span className="hidden shrink-0 px-2 text-[11px] text-gray-400 xl:inline dark:text-gray-500">{naturalSize.width} × {naturalSize.height}</span> : null}
          <button type="button" onClick={downloadImage} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="下载图片"><Download className="h-4 w-4" /><span className="hidden sm:inline">下载</span></button>
          <button type="button" onClick={() => viewerRef.current?.show()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="进入图片查看器全屏模式"><Maximize2 className="h-4 w-4" /><span className="hidden sm:inline">全屏查看</span></button>
        </div>
      </div>
      <div ref={viewportRef} onWheel={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); changeZoom(event.deltaY > 0 ? -0.1 : 0.1); } }} className={`relative min-h-0 flex-1 overflow-auto ${darkBackground ? "bg-slate-950" : "bg-gray-100 dark:bg-gray-950"}`}>
        <div className="flex min-h-full min-w-full items-center justify-center p-4">
          {loading ? <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-100 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-300"><RefreshCcw className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />正在加载图片...</div> : null}
          {error ? <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-600 dark:text-red-300">图片加载失败或文件格式不受浏览器支持</div> : null}
          <div className="relative shrink-0" style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}>
            <img
              key={sourceUrl}
              ref={imageRef}
              src={sourceUrl}
              alt={name}
              onLoad={(event) => {
                setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                setLoading(false);
                setError(false);
              }}
              onError={() => { setLoading(false); setError(true); }}
              onDoubleClick={() => { if (fitWindow) { setZoom(1); setFitWindow(false); } else setFitWindow(true); }}
              className="absolute left-1/2 top-1/2 max-w-none cursor-zoom-in select-none object-contain shadow-lg"
              style={{
                width: `${naturalSize.width * displayScale}px`,
                height: `${naturalSize.height * displayScale}px`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`,
              }}
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
