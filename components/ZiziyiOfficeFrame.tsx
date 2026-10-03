"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import EditorPresenceMenu from "./EditorPresenceMenu";
import LoadingState from "./LoadingState";
import type { FileEditorPresenceStatus } from "./useFileEditorPresence";
import {
  ZIZIYI_BRIDGE,
  isZiziyiBridgeMessage,
  type ZiziyiEditorMessage,
  type ZiziyiHostMessage,
  type ZiziyiParticipantUser,
} from "@/lib/ziziyi/bridge";

export type ZiziyiOfficeFrameHandle = {
  save: () => Promise<void>;
};

type ZiziyiOfficeFrameProps = {
  sourceUrl: string;
  fileName: string;
  userId: string;
  userName: string;
  participants?: ZiziyiParticipantUser[];
  presenceStatus?: FileEditorPresenceStatus;
  currentUserId?: string;
  mode?: "view" | "edit";
  className?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSave?: (data: Uint8Array<ArrayBuffer>, fileName: string) => Promise<void>;
};

type PendingSave = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
};

const ZiziyiOfficeFrame = forwardRef<ZiziyiOfficeFrameHandle, ZiziyiOfficeFrameProps>(function ZiziyiOfficeFrame({
  sourceUrl,
  fileName,
  userId,
  userName,
  participants = [],
  presenceStatus = "idle",
  currentUserId,
  mode = "view",
  className = "",
  onDirtyChange,
  onSave,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onSaveRef = useRef(onSave);
  const pendingSavesRef = useRef(new Map<string, PendingSave>());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
    onSaveRef.current = onSave;
  }, [onDirtyChange, onSave]);

  useImperativeHandle(ref, () => ({
    save: () => new Promise<void>((resolve, reject) => {
      const child = iframeRef.current?.contentWindow;
      if (!child || !loaded) {
        reject(new Error("ZIZIYI 编辑器尚未准备完成，请稍候再试"));
        return;
      }
      const requestId = `host-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const timeout = window.setTimeout(() => {
        pendingSavesRef.current.delete(requestId);
        reject(new Error("ZIZIYI 保存超时，请重试"));
      }, 120_000);
      pendingSavesRef.current.set(requestId, { resolve, reject, timeout });
      const message: ZiziyiHostMessage = { bridge: ZIZIYI_BRIDGE, type: "save", requestId };
      child.postMessage(message, window.location.origin);
    }),
  }), [loaded]);

  useEffect(() => {
    let cancelled = false;
    let opening = false;
    const pendingSaves = pendingSavesRef.current;
    setLoaded(false);
    setError("");
    onDirtyChangeRef.current?.(false);

    const sendOpen = async () => {
      if (opening) return;
      opening = true;
      try {
        const response = await fetch(sourceUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`读取 Office 文件失败（HTTP ${response.status}）`);
        const data = await response.arrayBuffer();
        if (cancelled) return;
        const child = iframeRef.current?.contentWindow;
        if (!child) throw new Error("ZIZIYI 编辑器窗口未创建");
        const message: ZiziyiHostMessage = {
          bridge: ZIZIYI_BRIDGE,
          type: "open",
          fileName,
          editing: mode === "edit",
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          user: { id: userId, name: userName },
          participants: [],
          data,
        };
        child.postMessage(message, window.location.origin, [data]);
      } catch (openError) {
        if (!cancelled) setError(openError instanceof Error ? openError.message : "ZIZIYI 文档加载失败");
      }
    };

    const onMessage = (event: MessageEvent<ZiziyiEditorMessage>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        !isZiziyiBridgeMessage(event.data)
      ) return;
      const message = event.data as ZiziyiEditorMessage;
      if (message.type === "ready") {
        void sendOpen();
        return;
      }
      if (message.type === "loaded") {
        setLoaded(true);
        setError("");
        return;
      }
      if (message.type === "dirty") {
        onDirtyChangeRef.current?.(message.dirty);
        return;
      }
      if (message.type === "error") {
        setError(message.error || "ZIZIYI 编辑器加载失败");
        return;
      }
      if (message.type === "save-data") {
        const child = iframeRef.current?.contentWindow;
        const finish = (ok: boolean, saveError?: unknown) => {
          if (!child) return;
          const result: ZiziyiHostMessage = {
            bridge: ZIZIYI_BRIDGE,
            type: "save-result",
            requestId: message.requestId,
            ok,
            ...(ok ? {} : { error: saveError instanceof Error ? saveError.message : "R2 保存失败" }),
          };
          child.postMessage(result, window.location.origin);
        };
        if (!onSaveRef.current) {
          finish(false, new Error("当前预览不允许保存"));
          return;
        }
        void onSaveRef.current(new Uint8Array(message.data), message.fileName)
          .then(() => finish(true))
          .catch((saveError) => finish(false, saveError));
        return;
      }
      if (message.type === "save-complete") {
        const pending = pendingSaves.get(message.requestId);
        if (!pending) return;
        window.clearTimeout(pending.timeout);
        pendingSaves.delete(message.requestId);
        if (message.ok) pending.resolve();
        else pending.reject(new Error(message.error || "ZIZIYI 保存失败"));
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      for (const pending of pendingSaves.values()) {
        window.clearTimeout(pending.timeout);
        pending.reject(new Error("ZIZIYI 编辑器已关闭"));
      }
      pendingSaves.clear();
      onDirtyChangeRef.current?.(false);
    };
  }, [fileName, mode, retryKey, sourceUrl, userId, userName]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-white dark:bg-gray-950 ${className}`}>
      <iframe
        key={retryKey}
        ref={iframeRef}
        src={`/ziziyi-editor?retry=${retryKey}`}
        title={`${fileName} - ZIZIYI Office`}
        className="h-full w-full border-0 bg-white dark:bg-gray-950"
        allow="clipboard-read; clipboard-write"
      />
      {loaded && !error ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[70] h-9">
          <div className={`pointer-events-auto absolute inset-y-0 left-0 flex items-center justify-end ${mode === "edit" ? "right-[2.75rem] -translate-y-[5px]" : "right-[5.5rem] -translate-y-[3px]"}`}>
            <EditorPresenceMenu
              editors={participants}
              status={presenceStatus}
              currentUserId={currentUserId}
              density="compact"
            />
          </div>
        </div>
      ) : null}
      {!loaded && !error ? (
        <LoadingState
          variant="preview"
          label="正在浏览器中加载 ZIZIYI Office…"
          className="pointer-events-none absolute inset-0 bg-white/95 dark:bg-gray-950/95"
        />
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white px-6 text-center dark:bg-gray-950">
          <div className="text-sm font-medium text-red-600 dark:text-red-300">{error}</div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">可关闭预览后重试，或在团队设置中切换回原有 Office 预览源。</div>
          <button
            type="button"
            className="mt-4 rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:border-blue-600 dark:hover:bg-blue-950/40"
            onClick={() => {
              setLoaded(false);
              setError("");
              setRetryKey((value) => value + 1);
            }}
          >
            重新加载
          </button>
        </div>
      ) : null}
    </div>
  );
});

ZiziyiOfficeFrame.displayName = "ZiziyiOfficeFrame";

export default ZiziyiOfficeFrame;
