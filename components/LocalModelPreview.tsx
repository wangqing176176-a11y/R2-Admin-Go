"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Camera, Check, Focus, Info, Moon, MoreHorizontal, RefreshCw, ScanLine, Sun, ZoomIn, ZoomOut } from "lucide-react";

type OvModule = typeof import("online-3d-viewer");
type EmbeddedViewerInstance = InstanceType<OvModule["EmbeddedViewer"]>;

type ModelInfo = {
  nodes: number;
  meshes: number;
  meshInstances: number;
  materials: number;
};

export default function LocalModelPreview({ sourceUrl, name }: { sourceUrl: string; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<EmbeddedViewerInstance | null>(null);
  const ovRef = useRef<OvModule | null>(null);
  const darkBackgroundRef = useRef(false);
  const mobileMoreRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [showEdges, setShowEdges] = useState(false);
  const [orthographic, setOrthographic] = useState(false);
  const [darkBackground, setDarkBackground] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const fitModel = () => {
    const core = viewerRef.current?.GetViewer();
    if (!core) return;
    const sphere = core.GetBoundingSphere(() => true);
    if (sphere) core.FitSphereToWindow(sphere, true);
  };

  const zoomModel = (factor: number) => {
    const core = viewerRef.current?.GetViewer();
    const OV = ovRef.current;
    if (!core || !OV) return;
    const camera = core.GetCamera().Clone();
    const direction = OV.SubCoord3D(camera.eye, camera.center).Normalize();
    const distance = OV.CoordDistance3D(camera.eye, camera.center);
    camera.eye = camera.center.Clone().Offset(direction, Math.max(distance * factor, 0.001));
    core.SetCamera(camera);
  };

  const setStandardView = (view: "front" | "right" | "top") => {
    const core = viewerRef.current?.GetViewer();
    const OV = ovRef.current;
    if (!core || !OV) return;
    const sphere = core.GetBoundingSphere(() => true);
    if (!sphere) return;
    const center = new OV.Coord3D(sphere.center.x, sphere.center.y, sphere.center.z);
    const distance = Math.max(sphere.radius * 3, 1);
    const eye = view === "front"
      ? new OV.Coord3D(center.x, center.y, center.z + distance)
      : view === "right"
        ? new OV.Coord3D(center.x + distance, center.y, center.z)
        : new OV.Coord3D(center.x, center.y + distance, center.z);
    const up = view === "top" ? new OV.Coord3D(0, 0, -1) : new OV.Coord3D(0, 1, 0);
    core.SetCamera(new OV.Camera(eye, center.Clone(), up, core.GetCamera().fov));
    core.FitSphereToWindow(sphere, false);
    core.AdjustClippingPlanesToSphere(sphere);
  };

  const toggleEdges = () => {
    const core = viewerRef.current?.GetViewer();
    const OV = ovRef.current;
    if (!core || !OV) return;
    const next = !showEdges;
    core.SetEdgeSettings(new OV.EdgeSettings(next, new OV.RGBColor(30, 64, 175), 1));
    setShowEdges(next);
  };

  const toggleProjection = () => {
    const core = viewerRef.current?.GetViewer();
    const OV = ovRef.current;
    if (!core || !OV) return;
    const next = !orthographic;
    core.SetProjectionMode(next ? OV.ProjectionMode.Orthographic : OV.ProjectionMode.Perspective);
    setOrthographic(next);
    window.setTimeout(fitModel, 0);
  };

  const toggleBackground = () => {
    const core = viewerRef.current?.GetViewer();
    const OV = ovRef.current;
    if (!core || !OV) return;
    const next = !darkBackground;
    core.SetBackgroundColor(
      next
        ? new OV.RGBAColor(15, 23, 42, 255)
        : new OV.RGBAColor(255, 255, 255, 255),
    );
    darkBackgroundRef.current = next;
    setDarkBackground(next);
  };

  const saveScreenshot = () => {
    const core = viewerRef.current?.GetViewer();
    if (!core) return;
    const dataUrl = core.GetImageAsDataUrl(1600, 900, false);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${name.replace(/\.[^.]+$/, "") || "model"}-preview.png`;
    link.click();
  };

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let viewer: EmbeddedViewerInstance | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;
    setStatus("loading");
    setErrorMessage("");
    void Promise.all([
      import("online-3d-viewer"),
      fetch(sourceUrl, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`模型文件读取失败（${response.status}）`);
        const blob = await response.blob();
        return new File([blob], name, { type: blob.type || "application/octet-stream" });
      }),
    ]).then(([OV, file]) => {
      if (disposed || !containerRef.current) return;
      viewer = new OV.EmbeddedViewer(containerRef.current, {
        backgroundColor: darkBackgroundRef.current
          ? new OV.RGBAColor(15, 23, 42, 255)
          : new OV.RGBAColor(255, 255, 255, 255),
        defaultColor: new OV.RGBColor(59, 130, 246),
        edgeSettings: new OV.EdgeSettings(false, new OV.RGBColor(30, 41, 59), 1),
        onModelLoaded: () => {
          const model = viewerRef.current?.GetModel();
          if (model) {
            setModelInfo({
              nodes: model.NodeCount(),
              meshes: model.MeshCount(),
              meshInstances: model.MeshInstanceCount(),
              materials: model.MaterialCount(),
            });
          }
          setStatus("ready");
        },
        onModelLoadFailed: () => {
          setErrorMessage("模型内容解析失败，文件可能损坏或依赖未一并提供。");
          setStatus("error");
        },
      });
      viewerRef.current = viewer;
      ovRef.current = OV;
      resizeObserver = new ResizeObserver(() => {
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          if (disposed || !viewer) return;
          viewer.Resize();
          const core = viewer.GetViewer();
          const sphere = core.GetBoundingSphere(() => true);
          if (sphere) core.FitSphereToWindow(sphere, false);
        });
      });
      resizeObserver.observe(containerRef.current);
      viewer.LoadModelFromFileList([file]);
    }).catch((reason) => {
      if ((reason as { name?: unknown })?.name === "AbortError") return;
      setErrorMessage(reason instanceof Error ? reason.message : "模型预览加载失败");
      setStatus("error");
    });
    return () => {
      disposed = true;
      controller.abort();
      resizeObserver?.disconnect();
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      viewer?.Destroy();
      viewerRef.current = null;
      ovRef.current = null;
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [name, sourceUrl]);

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

  return (
    <div className={`relative h-full w-full ${darkBackground ? "bg-slate-950" : "bg-white"}`}>
      <div ref={containerRef} className="h-full w-full [&>canvas]:block" />
      {status === "ready" ? (
        <>
          <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-0.5 overflow-visible rounded-lg border border-blue-200 bg-white/95 p-1 text-gray-700 shadow-md backdrop-blur dark:border-blue-900 dark:bg-slate-900/95 dark:text-gray-200 lg:hidden">
            <button type="button" onClick={fitModel} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="适配窗口" aria-label="适配窗口"><Focus className="h-4 w-4" /></button>
            <button type="button" onClick={() => zoomModel(0.8)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="放大" aria-label="放大"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={() => zoomModel(1.25)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="缩小" aria-label="缩小"><ZoomOut className="h-4 w-4" /></button>
            <button type="button" onClick={() => setStandardView("front")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300" title="前视图" aria-label="前视图">前</button>
            <button type="button" onClick={toggleBackground} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${darkBackground ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="切换背景" aria-label="切换背景">{darkBackground ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</button>
            <div ref={mobileMoreRef} className="relative shrink-0">
              <button type="button" onClick={() => setMobileMoreOpen((value) => !value)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${mobileMoreOpen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"}`} title="更多模型工具" aria-label="更多模型工具" aria-expanded={mobileMoreOpen}><MoreHorizontal className="h-5 w-5" /></button>
              {mobileMoreOpen ? (
                <div className="absolute right-0 top-9 z-40 grid w-40 gap-0.5 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-700 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <button type="button" onClick={() => { setStandardView("right"); setMobileMoreOpen(false); }} className="flex h-9 items-center rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300">右视图</button>
                  <button type="button" onClick={() => { setStandardView("top"); setMobileMoreOpen(false); }} className="flex h-9 items-center rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300">顶视图</button>
                  <button type="button" onClick={() => { toggleProjection(); setMobileMoreOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Box className="h-4 w-4" />{orthographic ? "切换透视投影" : "切换正交投影"}</button>
                  <button type="button" onClick={() => { toggleEdges(); setMobileMoreOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><ScanLine className="h-4 w-4" />{showEdges ? "隐藏模型边线" : "显示模型边线"}</button>
                  <div className="my-0.5 border-t border-gray-100 dark:border-gray-800" />
                  <button type="button" onClick={() => { saveScreenshot(); setMobileMoreOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Camera className="h-4 w-4" />保存截图</button>
                  <button type="button" onClick={() => { setInfoOpen((value) => !value); setMobileMoreOpen(false); }} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"><Info className="h-4 w-4" />模型信息</button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="absolute left-1/2 top-3 z-10 hidden max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-lg border border-blue-200 bg-white/95 p-1.5 text-gray-700 shadow-md backdrop-blur dark:border-blue-900 dark:bg-slate-900/95 dark:text-gray-200 lg:flex">
            <button type="button" onClick={fitModel} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" title="适配窗口"><Focus className="h-4 w-4" /><span className="hidden sm:inline">适配</span></button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-blue-100 dark:bg-blue-900" />
            <button type="button" onClick={() => zoomModel(0.8)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" title="放大"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={() => zoomModel(1.25)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" title="缩小"><ZoomOut className="h-4 w-4" /></button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-blue-100 dark:bg-blue-900" />
            <button type="button" onClick={() => setStandardView("front")} className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300">前视</button>
            <button type="button" onClick={() => setStandardView("right")} className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300">右视</button>
            <button type="button" onClick={() => setStandardView("top")} className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-xs hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300">顶视</button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-blue-100 dark:bg-blue-900" />
            <button type="button" onClick={toggleProjection} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${orthographic ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title="切换投影方式"><Box className="h-4 w-4" /><span className="hidden sm:inline">{orthographic ? "正交" : "透视"}</span></button>
            <button type="button" onClick={toggleEdges} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${showEdges ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title="显示模型边线"><ScanLine className="h-4 w-4" /><span className="hidden sm:inline">边线</span></button>
            <button type="button" onClick={toggleBackground} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs ${darkBackground ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title={`切换为${darkBackground ? "白色" : "黑色"}背景`} aria-pressed={darkBackground}>{darkBackground ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}<span className="hidden sm:inline">{darkBackground ? "黑色" : "白色"}</span></button>
            <button type="button" onClick={saveScreenshot} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300" title="保存截图"><Camera className="h-4 w-4" /></button>
            <button type="button" onClick={() => setInfoOpen((value) => !value)} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${infoOpen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"}`} title="模型信息"><Info className="h-4 w-4" /></button>
          </div>

          {infoOpen ? (
            <div className="absolute left-3 right-3 top-14 z-10 rounded-lg border border-blue-200 bg-white/95 p-3 text-xs text-gray-600 shadow-lg backdrop-blur sm:left-auto sm:right-3 sm:top-16 sm:w-60 dark:border-blue-900 dark:bg-slate-900/95 dark:text-gray-300">
              <div className="mb-2 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"><Info className="h-4 w-4 text-blue-600 dark:text-blue-300" />模型信息</div>
              <div className="truncate border-b border-blue-50 pb-2 font-medium text-gray-800 dark:border-blue-950 dark:text-gray-200" title={name}>{name}</div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                <span>节点数量</span><span className="text-right font-medium text-gray-900 dark:text-gray-100">{modelInfo?.nodes ?? "-"}</span>
                <span>网格数量</span><span className="text-right font-medium text-gray-900 dark:text-gray-100">{modelInfo?.meshes ?? "-"}</span>
                <span>网格实例</span><span className="text-right font-medium text-gray-900 dark:text-gray-100">{modelInfo?.meshInstances ?? "-"}</span>
                <span>材质数量</span><span className="text-right font-medium text-gray-900 dark:text-gray-100">{modelInfo?.materials ?? "-"}</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1.5 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"><Check className="h-3.5 w-3.5" />文件仅在当前浏览器内解析</div>
            </div>
          ) : null}
        </>
      ) : null}
      {status === "loading" ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-white/90 text-sm text-gray-600 dark:bg-gray-950/90 dark:text-gray-300"><RefreshCw className="h-5 w-5 animate-spin text-blue-600" />模型加载中…</div> : null}
      {status === "error" ? <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center text-sm text-red-600 dark:bg-gray-950 dark:text-red-300">{errorMessage || "模型预览加载失败"}</div> : null}
    </div>
  );
}
