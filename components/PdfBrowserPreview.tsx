"use client";

import { useEffect, useRef, useState } from "react";

export default function PdfBrowserPreview({
  sourceUrl,
  name,
  getProxyUrl,
  className = "",
}: {
  sourceUrl: string;
  name: string;
  getProxyUrl?: () => Promise<string>;
  className?: string;
}) {
  const [fallbackSource, setFallbackSource] = useState<{ sourceUrl: string; url: string } | null>(null);
  const [switchingSource, setSwitchingSource] = useState<string | null>(null);
  const activeSourceUrl = fallbackSource?.sourceUrl === sourceUrl ? fallbackSource.url : sourceUrl;
  const source = new URL(sourceUrl, "https://local.invalid");
  const alreadyProxy = source.pathname === "/api/object" || source.searchParams.get("forceProxy") === "1";
  const getProxyUrlRef = useRef(getProxyUrl);
  const sourceUrlRef = useRef(sourceUrl);
  const fallbackPendingRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    getProxyUrlRef.current = getProxyUrl;
    sourceUrlRef.current = sourceUrl;
  }, [getProxyUrl, sourceUrl]);

  const switchToProxy = () => {
    if (activeSourceUrl !== sourceUrl || alreadyProxy || !getProxyUrlRef.current || fallbackPendingRef.current === sourceUrl) return;
    fallbackPendingRef.current = sourceUrl;
    setSwitchingSource(sourceUrl);
    void getProxyUrlRef.current().then((proxyUrl) => {
      if (mountedRef.current && sourceUrlRef.current === sourceUrl && proxyUrl && proxyUrl !== sourceUrl) {
        setFallbackSource({ sourceUrl, url: proxyUrl });
      }
    }).catch(() => undefined).finally(() => {
      if (fallbackPendingRef.current === sourceUrl) fallbackPendingRef.current = null;
      if (mountedRef.current) setSwitchingSource((current) => current === sourceUrl ? null : current);
    });
  };

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <iframe
        src={activeSourceUrl}
        className="h-full w-full border-0 bg-white dark:bg-gray-900"
        title={`${name}（浏览器原生预览）`}
      />
      {activeSourceUrl !== sourceUrl ? <div role="status" className="absolute bottom-3 right-3 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 shadow dark:bg-amber-950 dark:text-amber-200">已切换代理</div> : !alreadyProxy && getProxyUrl ? <button type="button" onClick={switchToProxy} disabled={switchingSource === sourceUrl} className="absolute bottom-3 right-3 rounded-md border border-gray-200 bg-white/95 px-2 py-1 text-[11px] text-gray-600 shadow hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300">{switchingSource === sourceUrl ? "切换代理中…" : "无法显示？切换代理"}</button> : null}
    </div>
  );
}
