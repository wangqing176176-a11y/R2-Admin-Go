"use client";

import { useState } from "react";
import LoadingState from "./LoadingState";

type PreviewIframeProps = {
  src: string;
  title: string;
  loadingLabel: string;
  className?: string;
  allowFullScreen?: boolean;
};

export default function PreviewIframe({
  src,
  title,
  loadingLabel,
  className = "",
  allowFullScreen = true,
}: PreviewIframeProps) {
  const [loadedSource, setLoadedSource] = useState("");
  const loaded = loadedSource === src;

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <iframe
        src={src}
        className="h-full w-full border-0 bg-white dark:bg-gray-900"
        title={title}
        allowFullScreen={allowFullScreen}
        onLoad={() => setLoadedSource(src)}
      />
      {!loaded ? (
        <LoadingState
          variant="preview"
          label={loadingLabel}
          className="pointer-events-none absolute inset-0 bg-white/95 dark:bg-gray-950/95"
        />
      ) : null}
    </div>
  );
}
