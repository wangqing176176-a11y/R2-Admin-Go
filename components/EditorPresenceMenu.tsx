"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Radio } from "lucide-react";
import FadeArc from "./loading-ui/FadeArc";
import type { FileEditorParticipant, FileEditorPresenceStatus } from "./useFileEditorPresence";

type EditorPresenceMenuProps = {
  editors: FileEditorParticipant[];
  status: FileEditorPresenceStatus;
  currentUserId?: string;
  className?: string;
  density?: "default" | "compact";
  mobileLayout?: "stacked" | "inline";
};

const avatarColor = (value: string) => {
  const colors = [
    "bg-violet-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-indigo-500",
  ];
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
};

const initialFor = (name: string) => Array.from(name.trim())[0]?.toUpperCase() || "员";

const FilledCollaboratorsIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <g opacity=".72">
      <circle cx="16.5" cy="7.5" r="3" />
      <path d="M12.25 19.5v-1.25a5 5 0 0 1 10 0v1.25a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1Z" />
    </g>
    <circle cx="8" cy="7" r="3.5" />
    <path d="M1.5 19.5v-1.25a6.5 6.5 0 0 1 13 0v1.25a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />
  </svg>
);

const formatOnlineTime = (value?: string) => {
  if (!value) return "正在协作";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "正在协作";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())} ${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())} 加入协作`;
};

export default function EditorPresenceMenu({
  editors,
  status,
  currentUserId,
  className = "",
  density = "default",
  mobileLayout = "stacked",
}: EditorPresenceMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleEditors = useMemo(() => editors.slice(0, 3), [editors]);
  const compact = density === "compact";
  const inlineOnMobile = mobileLayout === "inline";

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.document.addEventListener("pointerdown", close);
    window.document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.removeEventListener("pointerdown", close);
      window.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const collaborationLabel = editors.length === 0 ? "没有人协作" : `${editors.length} 人协作中`;
  const statusLabel = status === "connected"
    ? collaborationLabel
    : status === "error"
      ? "协作服务暂不可用"
      : "协作读取中";
  const triggerStateClass = open
    ? "border-blue-500 bg-blue-50/80 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
    : status === "error"
      ? "border-blue-400/70 bg-blue-50/70 text-red-600 hover:border-blue-500 hover:bg-blue-100/70 dark:border-blue-700/80 dark:bg-blue-950/30 dark:text-red-400 dark:hover:border-blue-600 dark:hover:bg-blue-950/50"
      : "border-blue-400/70 bg-blue-50/70 text-blue-600 hover:border-blue-500 hover:bg-blue-100/70 dark:border-blue-700/80 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:border-blue-600 dark:hover:bg-blue-950/50";

  return (
    <div ref={rootRef} className={`group/presence relative flex shrink-0 items-center ${compact ? "h-8 gap-1.5 md:h-7" : inlineOnMobile ? "h-8 gap-2" : "h-10 gap-2 md:h-8"} ${className}`}>
      {visibleEditors.length > 0 ? (
        <span className={`hidden shrink-0 items-center pl-0.5 md:flex ${compact ? "h-6" : "h-8"}`} aria-hidden="true">
          {visibleEditors.map((editor, index) => (
            <span
              key={editor.id}
              className={`relative flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-1 ring-inset ring-white/70 dark:ring-slate-900/70 ${compact ? `h-6 w-6 text-[10px] ${index > 0 ? "-ml-2" : ""}` : `h-8 w-8 text-xs ${index > 0 ? "-ml-2.5" : ""}`} ${avatarColor(editor.id)}`}
              style={{ zIndex: visibleEditors.length - index }}
              title={editor.name}
            >
              {initialFor(editor.name)}
              <span className={`absolute bottom-0 right-0 rounded-full border-white bg-blue-500 dark:border-slate-900 ${compact ? "h-1.5 w-1.5 border" : "h-2.5 w-2.5 border-2"}`} />
            </span>
          ))}
        </span>
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={`inline-flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border px-0 font-medium leading-none tabular-nums transition-colors md:w-auto md:min-w-0 md:flex-row md:rounded-full md:leading-normal ${compact ? "h-6 w-auto min-w-0 flex-row gap-1 px-2 text-[10px] md:gap-1 md:px-2 md:text-[11px]" : inlineOnMobile ? "h-8 min-w-[6.5rem] flex-row gap-1.5 px-2.5 text-xs md:h-[30px]" : "h-10 w-11 text-[9px] md:h-[30px] md:gap-1.5 md:px-2.5 md:text-xs"} ${triggerStateClass}`}
        aria-label={`当前协作成员，${statusLabel}`}
        aria-expanded={open}
        title={statusLabel}
      >
        <span className="inline-flex items-center gap-0.5 md:hidden">
          {status === "connecting" || status === "idle" ? (
            <FadeArc aria-hidden="true" className="h-4 w-4" />
          ) : status === "error" ? (
            <>
              <FilledCollaboratorsIcon className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" />
            </>
          ) : (
            <>
              <FilledCollaboratorsIcon className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
              <span className="text-[10px] font-semibold">{editors.length}</span>
            </>
          )}
        </span>
        <span className={`md:hidden ${status === "error" ? "text-red-600 dark:text-red-400" : ""}`}>{compact ? "协作" : "团队协作"}</span>
        <span className="hidden items-center gap-1.5 md:inline-flex">
          {status === "connecting" ? <FadeArc aria-hidden="true" className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> : status === "error" ? <FilledCollaboratorsIcon className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0 text-red-600 dark:text-red-400`} /> : <FilledCollaboratorsIcon className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0 text-blue-500 dark:text-blue-400`} />}
          <span className={`whitespace-nowrap ${status === "error" ? "text-red-600 dark:text-red-400" : ""}`}>{status === "connected" ? collaborationLabel : status === "error" ? "协作不可用" : "协作读取中"}</span>
          <ChevronDown className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      <div
        className={`absolute right-0 top-[calc(100%+0.55rem)] z-[80] w-80 max-w-[calc(100vw-1.25rem)] origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-2xl shadow-slate-950/20 ring-1 ring-black/5 backdrop-blur-xl transition duration-150 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 ${
          open
            ? "visible translate-y-0 scale-100 opacity-100"
            : "invisible -translate-y-1 scale-[0.98] opacity-0 group-hover/presence:visible group-hover/presence:translate-y-0 group-hover/presence:scale-100 group-hover/presence:opacity-100 group-focus-within/presence:visible group-focus-within/presence:translate-y-0 group-focus-within/presence:scale-100 group-focus-within/presence:opacity-100"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3.5 py-2.5 dark:border-slate-700">
          <div className="text-[13px] font-semibold text-slate-950 dark:text-white">当前协作成员</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{status === "connected" ? (editors.length === 0 ? "没有人协作" : `${editors.length} 人`) : statusLabel}</div>
        </div>

        {status === "error" ? (
          <div className="m-2.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            协作服务暂不可用
          </div>
        ) : status !== "connected" ? (
          <div className="flex items-center gap-2 px-3.5 py-4 text-xs text-slate-500 dark:text-slate-400">
            <FadeArc aria-hidden="true" className="h-4 w-4" />
            正在建立实时协作频道…
          </div>
        ) : editors.length === 0 ? (
          <div className="px-3.5 py-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            当前没有用户处于编辑状态。
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto px-3 py-1">
            {editors.map((editor, index) => (
              <div
                key={editor.id}
                className={`flex min-h-11 items-center gap-2.5 px-1 py-1.5 ${index > 0 ? "border-t border-slate-200/80 dark:border-slate-700/80" : ""}`}
              >
                <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(editor.id)}`}>
                  {initialFor(editor.name)}
                  <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 dark:border-slate-900" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold leading-4 text-slate-900 dark:text-slate-100">{editor.name}</span>
                    {editor.id === currentUserId ? <span className="shrink-0 text-[10px] text-blue-500">我</span> : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{formatOnlineTime(editor.onlineAt)}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-slate-200 px-3.5 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <Radio className={`h-3.5 w-3.5 shrink-0 ${status === "connected" ? "text-blue-500" : ""}`} />
          <span className="whitespace-nowrap">多人协作时，以最后保存者的版本为准</span>
        </div>
      </div>
    </div>
  );
}
