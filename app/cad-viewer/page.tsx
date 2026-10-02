"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { App as VueApp, Ref as VueRef } from "vue";

const DEFAULT_CAD_BASE_URL = "/assets/cad-data/";
const THEME_STORE_KEY = "r2_admin_theme_v1";

type CadTheme = "light" | "dark";

const getWebsiteTheme = (): CadTheme => {
  if (typeof window === "undefined") return "light";

  let mode = "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") mode = stored;
  } catch {
    // Keep following the system theme when storage is unavailable.
  }

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  return mode === "dark" || (mode === "system" && prefersDark) ? "dark" : "light";
};

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
  <div className="flex h-dvh items-center justify-center bg-gray-50 p-6 text-center text-gray-900 dark:bg-gray-950 dark:text-gray-100">
    <div className="max-w-xl rounded-xl border border-gray-200 bg-white/90 p-6 shadow-xl shadow-gray-200/50 dark:border-white/10 dark:bg-gray-900/90 dark:shadow-2xl dark:shadow-black/30">
      <div className="text-base font-semibold">{title}</div>
      {detail ? <div className="mt-2 break-all text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</div> : null}
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
  const vueThemeRef = useRef<VueRef<CadTheme> | null>(null);
  const [viewerTheme, setViewerTheme] = useState<CadTheme>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const [status, setStatus] = useState<{ title: string; detail?: string; sourceUrl?: string }>({
    title: "CAD加载中…",
    detail: "首次加载需要初始化本地 mlightcad 模块。",
  });
  const sourceUrl = searchParams.get("url") ?? "";
  const filename = searchParams.get("filename") ?? "drawing.dwg";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      const nextTheme = getWebsiteTheme();
      const shouldBeDark = nextTheme === "dark";
      if (document.documentElement.classList.contains("dark") !== shouldBeDark) {
        document.documentElement.classList.toggle("dark", shouldBeDark);
      }
      setViewerTheme((currentTheme) => currentTheme === nextTheme ? currentTheme : nextTheme);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORE_KEY) syncTheme();
    };

    syncTheme();
    const rootClassObserver = new MutationObserver(syncTheme);
    rootClassObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    mediaQuery.addEventListener("change", syncTheme);
    window.addEventListener("storage", onStorage);
    return () => {
      rootClassObserver.disconnect();
      mediaQuery.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (vueThemeRef.current) vueThemeRef.current.value = viewerTheme;
  }, [viewerTheme]);

  useEffect(() => {
    let disposed = false;
    let vueApp: VueApp<Element> | null = null;

    const init = async () => {
      if (!sourceUrl) {
        setStatus({ title: "CAD 文件加载失败", detail: "缺少 CAD 文件地址" });
        return;
      }

      try {
        setStatus({ title: "模块加载中…", detail: filename });
        const [{ createApp, h, ref }, { MlCadViewer, i18n }] = await Promise.all([
          import("vue"),
          import("@mlightcad/cad-viewer"),
        ]);
        if (disposed || !mountRef.current) return;

        setStatus({ title: "图纸读取中…", detail: filename });
        const response = await fetch(sourceUrl, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(`CAD 文件读取失败：HTTP ${response.status}`);
        const blob = await response.blob();
        if (disposed || !mountRef.current) return;
        const cadFile = new File([blob], filename, {
          type: blob.type || "application/octet-stream",
          lastModified: Date.now(),
        });

        setStatus({ title: "图纸打开中…", detail: filename });
        mountRef.current.innerHTML = "";
        const cadTheme = ref<CadTheme>(getWebsiteTheme());
        vueThemeRef.current = cadTheme;
        vueApp = createApp({
          setup() {
            return () =>
              h(MlCadViewer, {
                locale: "zh",
                localFile: cadFile,
                baseUrl: CAD_BASE_URL,
                useMainThreadDraw: true,
                theme: cadTheme.value,
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
      vueThemeRef.current = null;
      if (vueApp) vueApp.unmount();
    };
  }, [filename, sourceUrl]);

  return (
    <div className="h-dvh w-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
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
      <Suspense fallback={<StatusPanel title="CAD加载中…" />}>
        <CadViewerClient />
      </Suspense>
    </>
  );
}
