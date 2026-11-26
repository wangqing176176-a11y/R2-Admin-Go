"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

type SlidingTabListProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  activeKey: string | number;
  children: ReactNode;
  indicatorClassName?: string;
  variant?: "pill" | "underline";
};

export default function SlidingTabList({
  activeKey,
  children,
  className = "",
  indicatorClassName = "",
  variant = "pill",
  ...props
}: SlidingTabListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  const positionIndicator = useCallback(() => {
    const root = rootRef.current;
    const indicator = indicatorRef.current;
    const active = root?.querySelector<HTMLElement>('[aria-selected="true"], [data-sliding-active="true"]');
    if (!root || !indicator || !active) {
      if (indicator) indicator.style.opacity = "0";
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const left = activeRect.left - rootRect.left + root.scrollLeft;
    const top = variant === "underline"
      ? activeRect.bottom - rootRect.top - 2
      : activeRect.top - rootRect.top + root.scrollTop;

    indicator.style.width = `${activeRect.width}px`;
    indicator.style.height = variant === "underline" ? "2px" : `${activeRect.height}px`;
    indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    indicator.style.opacity = "1";
  }, [variant]);

  useLayoutEffect(() => {
    positionIndicator();
  }, [activeKey, children, positionIndicator]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(positionIndicator);
    observer?.observe(root);
    for (const child of root.children) {
      if (child instanceof HTMLElement && child !== indicatorRef.current) observer?.observe(child);
    }
    window.addEventListener("resize", positionIndicator);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", positionIndicator);
    };
  }, [children, positionIndicator]);

  return (
    <div ref={rootRef} className={`relative ${className}`} {...props}>
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 z-0 opacity-0 transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          variant === "underline" ? "rounded-full" : "rounded-md"
        } ${indicatorClassName}`}
      />
      {children}
    </div>
  );
}
