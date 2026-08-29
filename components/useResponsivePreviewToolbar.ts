"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ResponsivePreviewToolbarOptions = {
  actionWidths: number[];
  fixedWidths?: number[];
  gap?: number;
  horizontalPadding?: number;
  moreWidth?: number;
  fallbackVisibleCount?: number;
};

const totalWidth = (widths: number[], gap: number, horizontalPadding: number) => {
  if (!widths.length) return horizontalPadding;
  return widths.reduce((total, width) => total + width, 0) + (widths.length - 1) * gap + horizontalPadding;
};

export function useResponsivePreviewToolbar({
  actionWidths,
  fixedWidths = [],
  gap = 2,
  horizontalPadding = 8,
  moreWidth = 32,
  fallbackVisibleCount = 0,
}: ResponsivePreviewToolbarOptions) {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const updateWidth = () => setAvailableWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const visibleCount = useMemo(() => {
    if (!actionWidths.length) return 0;
    if (!availableWidth) return Math.min(actionWidths.length, fallbackVisibleCount);
    if (totalWidth([...fixedWidths, ...actionWidths], gap, horizontalPadding) <= availableWidth) return actionWidths.length;
    for (let count = actionWidths.length - 1; count >= 0; count -= 1) {
      if (totalWidth([...fixedWidths, ...actionWidths.slice(0, count), moreWidth], gap, horizontalPadding) <= availableWidth) return count;
    }
    return 0;
  }, [actionWidths, availableWidth, fallbackVisibleCount, fixedWidths, gap, horizontalPadding, moreWidth]);

  return { measureRef, visibleCount, availableWidth };
}
