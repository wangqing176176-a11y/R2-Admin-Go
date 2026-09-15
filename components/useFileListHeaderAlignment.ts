"use client";

import { useCallback, type RefObject } from "react";

export default function useFileListHeaderAlignment(scrollRef: RefObject<HTMLDivElement | null>, headerRef: RefObject<HTMLDivElement | null>) {
  return useCallback((scroller: HTMLDivElement | null) => {
    scrollRef.current = scroller;
    const header = headerRef.current;
    if (!scroller || !header) return;
    // The body scrollbar reduces its grid width. Match only the header's
    // content width while keeping the original card edges and rounded corners.
    const update = () => {
      const gutter = Math.max(0, scroller.offsetWidth - scroller.clientWidth);
      header.style.setProperty("--file-list-body-gutter", `${gutter}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      header.style.removeProperty("--file-list-body-gutter");
      if (scrollRef.current === scroller) scrollRef.current = null;
    };
  }, [scrollRef, headerRef]);
}
