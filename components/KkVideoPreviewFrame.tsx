"use client";

import { useEffect, useRef, useState } from "react";
import { buildKkFileViewPreviewUrl } from "@/lib/kkfileview";

type KkVideoPreviewFrameProps = {
  sourceUrl: string;
  className?: string;
};

const PLAYER_WIDTH = 900;
const PLAYER_HEIGHT = 600;

export default function KkVideoPreviewFrame({ sourceUrl, className = "" }: KkVideoPreviewFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const widthScale = container.clientWidth / PLAYER_WIDTH;
      const heightScale = container.clientHeight / PLAYER_HEIGHT;
      setScale(Math.min(1, widthScale, heightScale));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden bg-black ${className}`}>
      <iframe
        src={buildKkFileViewPreviewUrl(sourceUrl)}
        title="kkFileView Video Preview"
        scrolling="no"
        allowFullScreen
        className="absolute top-1/2 left-1/2 border-0 bg-black"
        style={{
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
        }}
      />
    </div>
  );
}
