"use client";

import { useEffect, useRef, useState } from "react";
import type Artplayer from "artplayer";

type ArtVideoPlayerProps = {
  url: string;
  title?: string;
  poster?: string;
  className?: string;
};

export default function ArtVideoPlayer({ url, title, poster, className = "" }: ArtVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<Artplayer | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;

    const destroy = () => {
      artRef.current?.destroy(false);
      artRef.current = null;
    };

    const init = async () => {
      if (!containerRef.current) return;
      setFallback(false);
      destroy();

      try {
        const { default: Art } = await import("artplayer");
        if (disposed || !containerRef.current) return;

        const options: ConstructorParameters<typeof Art>[0] = {
          container: containerRef.current,
          url,
          lang: "zh-cn",
          theme: "#2563eb",
          volume: 0.8,
          setting: true,
          playbackRate: true,
          aspectRatio: true,
          flip: true,
          screenshot: true,
          subtitleOffset: true,
          fullscreen: true,
          fullscreenWeb: true,
          pip: true,
          airplay: true,
          hotkey: true,
          mutex: true,
          miniProgressBar: true,
          playsInline: true,
          lock: true,
          gesture: true,
          fastForward: true,
          autoOrientation: true,
          backdrop: true,
          moreVideoAttr: {
            preload: "metadata",
            crossOrigin: "anonymous",
          },
          settings: [
            {
              html: "循环播放",
              tooltip: "关闭",
              switch: false,
              onSwitch(item) {
                const next = !item.switch;
                this.video.loop = next;
                item.tooltip = next ? "开启" : "关闭";
                if (item.$tooltip) item.$tooltip.textContent = item.tooltip;
                this.notice.show = next ? "已开启循环播放" : "已关闭循环播放";
                return next;
              },
            },
          ],
        };
        if (poster) options.poster = poster;

        artRef.current = new Art(options);
      } catch (error) {
        console.error("ArtPlayer 初始化失败，已退回原生视频控件", error);
        if (!disposed) setFallback(true);
      }
    };

    void init();

    return () => {
      disposed = true;
      destroy();
    };
  }, [poster, url]);

  if (fallback) {
    return (
      <video
        src={url}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        title={title}
        className={`h-full w-full bg-black object-contain ${className}`}
      />
    );
  }

  return <div ref={containerRef} className={`h-full w-full bg-black ${className}`} aria-label={title || "视频播放器"} />;
}
