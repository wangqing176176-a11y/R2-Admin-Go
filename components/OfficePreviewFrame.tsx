"use client";

import { useEffect, useState } from "react";
import LoadingState from "@/components/LoadingState";

type OfficePreviewFrameProps = {
  sourceUrl: string;
  className?: string;
};

export default function OfficePreviewFrame({ sourceUrl, className = "" }: OfficePreviewFrameProps) {
  const [loadedSource, setLoadedSource] = useState("");
  const [slowSource, setSlowSource] = useState("");
  const loaded = loadedSource === sourceUrl;

  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => setSlowSource(sourceUrl), 12_000);
    return () => window.clearTimeout(timer);
  }, [loaded, sourceUrl]);

  const params = new URLSearchParams({ src: sourceUrl, wdOrigin: "R2_ADMIN_GO" });
  const microsoftUrl = `https://view.officeapps.live.com/op/embed.aspx?${params.toString()}`;

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
      {!loaded ? (
        <LoadingState
          variant="preview"
          label={slowSource === sourceUrl ? "服务响应较慢，请稍候…" : "正在打开文件…"}
          className="pointer-events-none absolute inset-0 bg-white/90 dark:bg-gray-900/90"
        />
      ) : null}
    </div>
  );
}
