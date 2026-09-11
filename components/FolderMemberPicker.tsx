"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";

type Member = {
  userId: string;
  displayName: string;
  role: "super_admin" | "admin" | "member";
  status: "active" | "disabled";
};

type Props = {
  members: Member[];
  selectedIds: string[];
  reservedIds: string[];
  excludedIds?: string[];
  currentUserId: string;
  disabled?: boolean;
  onToggle: (userId: string) => void;
};

const roleLabels = { super_admin: "超级管理员", admin: "管理员", member: "协作成员" };
const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

function positionPanel(anchor: HTMLElement, preferredHeight: number): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const edge = 12;
  const viewportBottom = viewportTop + viewportHeight - edge;
  const minTop = viewportTop + edge;
  const belowTop = Math.max(minTop, Math.min(rect.bottom + 8, viewportBottom));
  const aboveBottom = Math.max(minTop, Math.min(rect.top - 8, viewportBottom));
  const below = Math.max(0, viewportBottom - belowTop);
  const above = Math.max(0, aboveBottom - minTop);
  const placeBelow = below >= preferredHeight || below >= above;
  const width = Math.min(340, Math.max(0, viewportWidth - edge * 2));

  return {
    position: "fixed",
    zIndex: 320,
    width,
    left: Math.max(viewportLeft + edge, Math.min(rect.left, viewportLeft + viewportWidth - edge - width)),
    maxHeight: Math.min(360, placeBelow ? below : above),
    ...(placeBelow ? { top: belowTop } : { bottom: window.innerHeight - aboveBottom }),
  };
}

function focusableElements(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) =>
    element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[inert]") && element.getClientRects().length > 0,
  );
}

export default function FolderMemberPicker({ members, selectedIds, reservedIds, excludedIds = [], currentUserId, disabled = false, onToggle }: Props) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<CSSProperties>({});
  const visible = open && !disabled;
  const selected = new Set([...selectedIds, ...reservedIds]);
  const reserved = new Set(reservedIds);
  const excluded = new Set(excludedIds);
  const selectedCount = new Set(members.filter((member) => member.status === "active" && selected.has(member.userId) && !excluded.has(member.userId)).map((member) => member.userId)).size;
  const hasReservedMembers = members.some((member) => member.status === "active" && reserved.has(member.userId) && !excluded.has(member.userId));
  const query = search.trim().toLocaleLowerCase();
  const filteredMembers = members.filter((member) => !query || member.displayName.toLocaleLowerCase().includes(query) || member.userId.toLocaleLowerCase().includes(query));
  const preferredHeight = Math.min(360, 54 + members.length * 44 + (hasReservedMembers ? 32 : 0));

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const toggleOpen = () => {
    if (visible) {
      close();
      return;
    }
    if (!triggerRef.current || disabled) return;
    setSearch("");
    setPosition(positionPanel(triggerRef.current, preferredHeight));
    setOpen(true);
  };

  useEffect(() => {
    if (!disabled || !open) return;
    const frame = window.requestAnimationFrame(() => setOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [disabled, open]);

  useEffect(() => {
    if (!visible) return;
    searchRef.current?.focus({ preventScroll: true });
    let frame = 0;
    const reposition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (triggerRef.current) setPosition(positionPanel(triggerRef.current, preferredHeight));
      });
    };
    const isInside = (target: EventTarget | null) => target instanceof Node
      && (triggerRef.current?.contains(target) || panelRef.current?.contains(target));
    const outsidePress = (event: PointerEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const focusChanged = (event: FocusEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };

    document.addEventListener("pointerdown", outsidePress, true);
    document.addEventListener("focusin", focusChanged);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outsidePress, true);
      document.removeEventListener("focusin", focusChanged);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [visible, preferredHeight]);

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const fields = focusableElements(panelRef.current);
    if (event.shiftKey && document.activeElement === fields[0]) {
      event.preventDefault();
      close(true);
    } else if (!event.shiftKey && document.activeElement === fields[fields.length - 1]) {
      // A portal sits outside the form in the DOM; continue after its trigger.
      const formFields = focusableElements(document).filter((element) => !panelRef.current?.contains(element));
      const triggerIndex = formFields.indexOf(triggerRef.current!);
      const next = triggerIndex >= 0 ? formFields[triggerIndex + 1] : undefined;
      if (next) {
        event.preventDefault();
        close();
        next.focus({ preventScroll: true });
      }
    }
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      aria-expanded={visible}
      aria-controls={visible ? panelId : undefined}
      onClick={toggleOpen}
      onKeyDown={(event) => {
        if (event.key === "Escape" && visible) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
      className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-blue-600 outline-none transition-colors hover:text-blue-700 focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300 dark:focus-visible:ring-offset-gray-900"
    >
      已选 {selectedCount} 人
      <ChevronDown aria-hidden="true" className={"h-4 w-4 transition-transform " + (visible ? "rotate-180" : "")} />
    </button>
    {visible && typeof document !== "undefined" ? createPortal(
      <div
        id={panelId}
        ref={panelRef}
        role="group"
        aria-label="选择成员"
        onKeyDown={handlePanelKeyDown}
        className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.14)] dark:border-gray-700 dark:bg-gray-900"
        style={position}
      >
        <div className="relative shrink-0 border-b border-gray-100 dark:border-gray-800">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            aria-label="搜索成员"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索成员"
            className="h-11 w-full bg-transparent pl-9 pr-10 text-sm text-gray-800 outline-none focus:bg-blue-50/40 dark:text-gray-100 dark:focus:bg-blue-950/20 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search ? <button type="button" aria-label="清除搜索" onClick={() => { setSearch(""); searchRef.current?.focus(); }} className="absolute right-2 top-2 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-blue-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"><X aria-hidden="true" className="h-4 w-4" /></button> : null}
        </div>
        <div className="folder-access-member-list min-h-0 overflow-y-auto overscroll-contain p-1.5">
          {filteredMembers.map((member) => {
            const active = member.status === "active";
            const fixed = reserved.has(member.userId);
            const restricted = excluded.has(member.userId);
            const checked = active && !restricted && selected.has(member.userId);
            const status = restricted ? "已限制访问" : !active ? "已停用" : fixed ? (member.userId === currentUserId ? "你" : "创建者") : roleLabels[member.role];
            return <label key={member.userId} className={[
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              fixed || !active || restricted ? "cursor-default" : "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800",
              checked ? "bg-blue-50/70 dark:bg-blue-950/30" : "",
            ].join(" ")}>
              <input
                type="checkbox"
                aria-label={member.displayName + (restricted ? "，已限制访问" : fixed && active ? "，" + status + "，保留访问权限" : !active ? "，已停用" : "")}
                checked={checked}
                disabled={fixed || !active || restricted || disabled}
                onChange={() => onToggle(member.userId)}
                className="h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600 focus-visible:outline-blue-500 disabled:opacity-50"
              />
              <span title={member.displayName} className={"min-w-0 flex-1 truncate " + (active ? "text-gray-800 dark:text-gray-200" : "text-gray-400 dark:text-gray-500")}>{member.displayName}</span>
              <span className="shrink-0 text-xs text-gray-400">{status}</span>
            </label>;
          })}
          {!filteredMembers.length ? <div className="py-7 text-center text-sm text-gray-400">{query ? "没有匹配的成员" : "暂无可选成员"}</div> : null}
        </div>
        {hasReservedMembers ? <div className="shrink-0 border-t border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-gray-800">你和创建者保留访问权限</div> : null}
      </div>,
      document.body,
    ) : null}
  </>;
}
