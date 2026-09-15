"use client";

import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from "react";

export const FILE_LIST_BATCH_SIZE = 50;

export default function useFileListWindow<T>(items: T[], resetKey: string, scrollRef: RefObject<HTMLDivElement | null>) {
  const [window, setWindow] = useState({ key: resetKey, count: FILE_LIST_BATCH_SIZE });
  if (window.key !== resetKey) setWindow({ key: resetKey, count: FILE_LIST_BATCH_SIZE });
  const count = window.key === resetKey ? window.count : FILE_LIST_BATCH_SIZE;
  const visibleItems = useMemo(() => items.slice(0, count), [items, count]);

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [resetKey, scrollRef]);

  const showMore = useCallback(() => {
    setWindow((previous) => ({
      key: resetKey,
      count: Math.min(items.length, (previous.key === resetKey ? previous.count : FILE_LIST_BATCH_SIZE) + FILE_LIST_BATCH_SIZE),
    }));
  }, [items.length, resetKey]);

  return { visibleItems, hasHiddenItems: visibleItems.length < items.length, showMore };
}
