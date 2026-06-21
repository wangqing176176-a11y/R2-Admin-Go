"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

type OfficePreviewFrameProps = {
  sourceUrl: string;
  className?: string;
};

export default function OfficePreviewFrame({ sourceUrl, className = "" }: OfficePreviewFrameProps) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
  }, [sourceUrl]);

  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  const microsoftUrl = useMemo(() => {
    const params = new URLSearchParams({ src: sourceUrl, wdOrigin: "R2_ADMIN_GO" });
    return `https://view.officeapps.live.com/op/embed.aspx?${params.toString()}`;
  }, [sourceUrl]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <iframe
        src={microsoftUrl}
        className="h-full w-full border-0 bg-white dark:bg-gray-900"
        title="Microsoft Office Preview"
        scrolling="no"
        allowFullScreen
        onLoad={() => setLoaded(true)}
      />

      {!loaded ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-gray-900/90">
          <div className="flex flex-col items-center gap-2 text-center">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-300" />
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {slow ? "微软预览服务响应较慢，请稍候..." : "正在加载 Office 预览..."}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
