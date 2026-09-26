"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { OnlyOfficeMode, OnlyOfficePreviewResponse, OnlyOfficeProvider } from "@/lib/onlyoffice";
import LoadingState from "./LoadingState";

type DocsApiWindow = Window & {
  DocsAPI?: {
    DocEditor: new (id: string, config: Record<string, unknown>) => { destroyEditor?: () => void };
  };
};

type OfficePreviewFrameProps = {
  sourceUrl: string;
  fileName?: string;
  provider?: OnlyOfficeProvider;
  mode?: OnlyOfficeMode;
  className?: string;
  loadOnlyOfficeConfig?: (mode: OnlyOfficeMode) => Promise<OnlyOfficePreviewResponse>;
  onDirtyChange?: (dirty: boolean) => void;
};

const scriptPromises = new Map<string, Promise<void>>();

const loadOnlyOfficeScript = (documentServerUrl: string) => {
  const baseUrl = documentServerUrl.replace(/\/+$/, "");
  const src = `${baseUrl}/web-apps/apps/api/documents/api.js`;
  if ((window as DocsApiWindow).DocsAPI?.DocEditor) return Promise.resolve();
  const existing = scriptPromises.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const previous = document.querySelector<HTMLScriptElement>(`script[data-onlyoffice-src="${src}"]`);
    const script = previous ?? document.createElement("script");
    const onLoad = () => {
      if ((window as DocsApiWindow).DocsAPI?.DocEditor) resolve();
      else reject(new Error("ONLYOFFICE 编辑器脚本加载失败"));
    };
    const onError = () => reject(new Error("无法连接 ONLYOFFICE 文档服务"));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!previous) {
      script.src = src;
      script.async = true;
      script.dataset.onlyofficeSrc = src;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromises.delete(src);
    throw error;
  });
  scriptPromises.set(src, promise);
  return promise;
};

export default function OfficePreviewFrame({
  sourceUrl,
  fileName = "Office 文档",
  provider = "microsoft",
  mode = "view",
  className = "",
  loadOnlyOfficeConfig,
  onDirtyChange,
}: OfficePreviewFrameProps) {
  const rawId = useId();
  const editorId = useMemo(() => `onlyoffice-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [rawId]);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const loadConfigRef = useRef(loadOnlyOfficeConfig);
  const dirtyChangeRef = useRef(onDirtyChange);
  const [loadedSource, setLoadedSource] = useState("");
  const [slowSource, setSlowSource] = useState("");
  const [onlyOfficeLoaded, setOnlyOfficeLoaded] = useState(false);
  const [onlyOfficeError, setOnlyOfficeError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const microsoftLoaded = loadedSource === sourceUrl;
  const slow = slowSource === sourceUrl;

  useEffect(() => {
    loadConfigRef.current = loadOnlyOfficeConfig;
    dirtyChangeRef.current = onDirtyChange;
  }, [loadOnlyOfficeConfig, onDirtyChange]);

  useEffect(() => {
    if (provider !== "microsoft" || microsoftLoaded) return;
    const timer = window.setTimeout(() => setSlowSource(sourceUrl), 12_000);
    return () => window.clearTimeout(timer);
  }, [microsoftLoaded, provider, sourceUrl]);

  const microsoftUrl = useMemo(() => {
    const params = new URLSearchParams({ src: sourceUrl, wdOrigin: "R2_ADMIN_GO" });
    return `https://view.officeapps.live.com/op/embed.aspx?${params.toString()}`;
  }, [sourceUrl]);

  useEffect(() => {
    if (provider !== "onlyoffice") return;
    let cancelled = false;
    dirtyChangeRef.current?.(false);

    const start = async () => {
      if (!loadConfigRef.current) throw new Error("ONLYOFFICE 配置加载器未设置");
      const result = await loadConfigRef.current(mode);
      await loadOnlyOfficeScript(result.documentServerUrl);
      if (cancelled) return;
      const DocsAPI = (window as DocsApiWindow).DocsAPI;
      if (!DocsAPI?.DocEditor) throw new Error("ONLYOFFICE 编辑器未就绪");

      const baseConfig = result.config as Record<string, unknown>;
      const existingEvents = (baseConfig.events ?? {}) as Record<string, (...args: never[]) => unknown>;
      const config: Record<string, unknown> = {
        ...baseConfig,
        events: {
          ...existingEvents,
          onAppReady: () => {
            if (!cancelled) setOnlyOfficeLoaded(true);
          },
          onDocumentReady: () => {
            if (!cancelled) setOnlyOfficeLoaded(true);
          },
          onDocumentStateChange: (event: { data?: unknown }) => {
            if (!cancelled) dirtyChangeRef.current?.(Boolean(event?.data));
          },
          onError: (event: { data?: { errorDescription?: unknown; errorCode?: unknown } }) => {
            if (cancelled) return;
            const description = String(event?.data?.errorDescription ?? "").trim();
            const code = String(event?.data?.errorCode ?? "").trim();
            setOnlyOfficeError(description || (code ? `ONLYOFFICE 加载失败（${code}）` : "ONLYOFFICE 加载失败"));
          },
        },
      };
      editorRef.current = new DocsAPI.DocEditor(editorId, config);
    };

    void start().catch((error) => {
      if (!cancelled) setOnlyOfficeError(error instanceof Error ? error.message : "ONLYOFFICE 加载失败");
    });
    return () => {
      cancelled = true;
      dirtyChangeRef.current?.(false);
      try {
        editorRef.current?.destroyEditor?.();
      } catch {
        // 编辑器尚未完全启动时销毁可能抛错，忽略即可。
      }
      editorRef.current = null;
    };
  }, [editorId, fileName, mode, provider, retryKey, sourceUrl]);

  if (provider === "microsoft") {
    return (
      <div className={`relative h-full w-full overflow-hidden ${className}`}>
        <iframe
          src={microsoftUrl}
          className="h-full w-full border-0 bg-white dark:bg-gray-900"
          title="Microsoft Office Preview"
          scrolling="no"
          allowFullScreen
          onLoad={() => setLoadedSource(sourceUrl)}
        />
        {!microsoftLoaded ? (
          <LoadingState
            variant="preview"
            label={slow ? "服务响应较慢，请稍候…" : "正在加载文档…"}
            className="pointer-events-none absolute inset-0 bg-white/90 dark:bg-gray-900/90"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-white dark:bg-gray-900 ${className}`}>
      <div id={editorId} className="h-full w-full" title={`${fileName} - ONLYOFFICE`} />
      {!onlyOfficeLoaded && !onlyOfficeError ? (
        <LoadingState
          variant="preview"
          label={mode === "edit" ? "正在打开 ONLYOFFICE 在线编辑器…" : "正在加载 ONLYOFFICE 预览…"}
          className="pointer-events-none absolute inset-0 bg-white/95 dark:bg-gray-900/95"
        />
      ) : null}
      {onlyOfficeError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white px-6 text-center dark:bg-gray-900">
          <div className="text-sm font-medium text-red-600 dark:text-red-300">{onlyOfficeError}</div>
          <button
            type="button"
            onClick={() => {
              setOnlyOfficeLoaded(false);
              setOnlyOfficeError("");
              setRetryKey((value) => value + 1);
            }}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            重新加载
          </button>
        </div>
      ) : null}
    </div>
  );
}
