"use client";

import { useEffect, useRef, type RefObject } from "react";
import { RefreshCw } from "lucide-react";

type FileListLoadMoreProps = {
  scrollRef: RefObject<HTMLDivElement | null>;
  visibleCount: number;
  total: number;
  hasMore: boolean;
  loading?: boolean;
  error?: string | null;
  onLoadMore: () => void;
};

export default function FileListLoadMore({ scrollRef, visibleCount, total, hasMore, loading = false, error, onLoadMore }: FileListLoadMoreProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading || error || typeof IntersectionObserver === "undefined") return;
    // Reobserve after each batch so a tall viewport keeps filling until it can scroll.
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      onLoadMore();
    }, { root, rootMargin: "0px 0px 240px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, visibleCount, total, hasMore, loading, error, onLoadMore]);

  return (
    <div
      ref={sentinelRef}
      className="mt-auto flex min-h-12 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-3 text-xs text-gray-400 dark:text-gray-500"
    >
      <span role="status" className="inline-flex items-center gap-1.5">
        {loading ? <><RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />正在加载更多</> : error ? "加载失败，已显示的文件仍可操作" : hasMore ? `已显示 ${visibleCount} 项` : `已显示全部，共 ${total} 项`}
      </span>
      {hasMore && !loading ? (
        <button
          type="button"
          title={error || undefined}
          onClick={(event) => {
            event.stopPropagation();
            onLoadMore();
          }}
          className="rounded px-1 py-0.5 text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-950/40"
        >
          {error ? "重试" : "加载更多"}
        </button>
      ) : null}
    </div>
  );
}
