"use client";

import { useEffect, useRef, useState } from "react";
import LoadingState from "./LoadingState";

export default function XMindPreviewFrame({ sourceUrl }: { sourceUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setLoading(true);
    if (containerRef.current) containerRef.current.replaceChildren();
    void Promise.all([
      fetch(sourceUrl, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("读取 XMind 文件失败");
        return response.arrayBuffer();
      }),
      import("xmind-embed-viewer"),
    ]).then(([file, module]) => {
      if (!containerRef.current || controller.signal.aborted) return;
      const viewer = new module.XMindEmbedViewer({
        el: containerRef.current,
        file,
        region: "cn",
        styles: { width: "100%", height: "100%" },
      });
      viewer.addEventListener("map-ready", () => setLoading(false));
    }).catch((reason) => {
      if ((reason as { name?: unknown })?.name !== "AbortError") {
        setError(reason instanceof Error ? reason.message : "XMind 预览加载失败");
        setLoading(false);
      }
    });
    return () => {
      controller.abort();
      containerRef.current?.replaceChildren();
    };
  }, [sourceUrl]);

  return <div className="relative h-full w-full"><div ref={containerRef} className="h-full w-full" />{loading ? <LoadingState variant="preview" label="正在加载思维导图…" className="pointer-events-none absolute inset-0 bg-white/90 dark:bg-gray-950/90" /> : null}{error ? <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-600 dark:text-red-300">{error}</div> : null}</div>;
}
