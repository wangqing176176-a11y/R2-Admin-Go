"use client";

import { useMemo, useSyncExternalStore } from "react";
import { buildPhotopeaPreviewUrl, type PhotopeaTheme } from "@/lib/photopea";
import LoadingState from "./LoadingState";
import PreviewIframe from "./PreviewIframe";

type PhotopeaPreviewFrameProps = {
  sourceUrl: string;
  className?: string;
};

type FrameConfig = {
  sourceUrl: string;
  theme: PhotopeaTheme;
};

const subscribeToClientMount = () => () => {};

export default function PhotopeaPreviewFrame({ sourceUrl, className = "" }: PhotopeaPreviewFrameProps) {
  const mounted = useSyncExternalStore(subscribeToClientMount, () => true, () => false);
  const frameConfig = useMemo<FrameConfig | null>(() => mounted ? {
    sourceUrl,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
  } : null, [mounted, sourceUrl]);

  if (!frameConfig || frameConfig.sourceUrl !== sourceUrl) {
    return (
      <div className={`relative h-full w-full overflow-hidden ${className}`}>
        <LoadingState
          variant="preview"
          label="正在加载设计文件预览…"
          className="absolute inset-0 bg-white/95 dark:bg-gray-950/95"
        />
      </div>
    );
  }

  return (
    <PreviewIframe
      src={buildPhotopeaPreviewUrl(frameConfig.sourceUrl, frameConfig.theme)}
      title="Photopea PSD Preview"
      loadingLabel="正在加载设计文件预览…"
      className={className}
    />
  );
}
