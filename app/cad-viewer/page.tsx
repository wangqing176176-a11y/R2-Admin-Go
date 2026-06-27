"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { App as VueApp } from "vue";

const DEFAULT_CAD_BASE_URL = "/assets/cad-data/";

const normalizeBaseUrl = (value: string) => {
  const baseUrl = value.trim() || DEFAULT_CAD_BASE_URL;
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
};

const CAD_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_MLIGHTCAD_DATA_BASE_URL || DEFAULT_CAD_BASE_URL);

const StatusPanel = ({
  title,
  detail,
  sourceUrl,
}: {
  title: string;
  detail?: string;
  sourceUrl?: string;
}) => (
  <div className="flex h-dvh items-center justify-center bg-gray-950 p-6 text-center text-gray-100">
    <div className="max-w-xl rounded-xl border border-white/10 bg-gray-900/90 p-6 shadow-2xl shadow-black/30">
      <div className="text-base font-semibold">{title}</div>
      {detail ? <div className="mt-2 break-all text-sm leading-6 text-gray-400">{detail}</div> : null}
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          下载文件
        </a>
      ) : null}
    </div>
  </div>
);

const CadViewerClient = () => {
  const searchParams = useSearchParams();
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<{ title: string; detail?: string; sourceUrl?: string }>({
    title: "正在加载 CAD 预览器...",
    detail: "首次加载需要初始化本地 mlightcad 模块。",
  });
  const sourceUrl = searchParams.get("url") ?? "";
  const filename = searchParams.get("filename") ?? "drawing.dwg";

  useEffect(() => {
    let disposed = false;
    let vueApp: VueApp<Element> | null = null;

    const init = async () => {
      if (!sourceUrl) {
        setStatus({ title: "CAD 文件加载失败", detail: "缺少 CAD 文件地址" });
        return;
      }

      try {
        setStatus({ title: "正在加载 mlightcad 模块...", detail: filename });
        const [{ createApp, h }, { MlCadViewer, i18n }] = await Promise.all([
          import("vue"),
          import("@mlightcad/cad-viewer"),
        ]);
        if (disposed || !mountRef.current) return;

        setStatus({ title: "正在读取 CAD 文件...", detail: filename });
        const response = await fetch(sourceUrl, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(`CAD 文件读取失败：HTTP ${response.status}`);
        const blob = await response.blob();
        if (disposed || !mountRef.current) return;
        const cadFile = new File([blob], filename, {
          type: blob.type || "application/octet-stream",
          lastModified: Date.now(),
        });

        setStatus({ title: "正在打开 CAD 文件...", detail: filename });
        mountRef.current.innerHTML = "";
        vueApp = createApp({
          setup() {
            return () =>
              h(MlCadViewer, {
                locale: "zh",
                localFile: cadFile,
                baseUrl: CAD_BASE_URL,
                useMainThreadDraw: true,
                theme: "dark",
              });
          },
        });
        vueApp.use(i18n);
        vueApp.mount(mountRef.current);
      } catch (error) {
        if (disposed) return;
        console.error(error);
        setStatus({
          title: "CAD 文件加载失败",
          detail: error instanceof Error ? error.message : "请下载后使用本地 CAD 软件打开。",
          sourceUrl,
        });
      }
    };

    void init();

    return () => {
      disposed = true;
      if (vueApp) vueApp.unmount();
    };
  }, [filename, sourceUrl]);

  return (
    <div className="h-dvh w-screen overflow-hidden bg-gray-950">
      <div ref={mountRef} className="h-full w-full">
        <StatusPanel {...status} />
      </div>
    </div>
  );
};

export default function CadViewerPage() {
  return (
    <>
      <link rel="stylesheet" href="/assets/element-plus.css" />
      <link rel="stylesheet" href="/assets/mlightcad-viewer.css" />
      <Suspense fallback={<StatusPanel title="正在加载 CAD 预览器..." />}>
        <CadViewerClient />
      </Suspense>
    </>
  );
}
