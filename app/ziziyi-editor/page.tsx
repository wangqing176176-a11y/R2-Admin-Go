"use client";

import { useEffect, useRef, useState } from "react";
import { createFetchProxy } from "@/lib/ziziyi/fetch";
import {
  ZIZIYI_BRIDGE,
  isZiziyiBridgeMessage,
  type ZiziyiEditorMessage,
  type ZiziyiHostMessage,
} from "@/lib/ziziyi/bridge";
import { EditorServer } from "@/lib/ziziyi/server";
import { loadCommonZiziyiFonts } from "@/lib/ziziyi/fonts";
import io, { MockSocket } from "@/lib/ziziyi/socket";
import { API_JS, APP_ROOT, PRELOAD_HTML, createZiziyiAssetUrlResolver, getDocumentType } from "@/lib/ziziyi/utils";
import { createXHRProxy } from "@/lib/ziziyi/xhr";

type EditorInstance = {
  destroyEditor?: () => void;
  downloadAs: (format?: string) => void;
};

type DocsApiWindow = Window & {
  DocsAPI?: {
    DocEditor: {
      new (id: string, config: Record<string, unknown>): EditorInstance;
      version: () => string;
    };
  };
};

type SaveAck = { resolve: () => void; reject: (error: Error) => void };

const messageParent = (message: ZiziyiEditorMessage, transfer?: Transferable[]) => {
  window.parent.postMessage(message, window.location.origin, transfer ?? []);
};

const loadDocsApi = async () => {
  const target = window as DocsApiWindow;
  if (target.DocsAPI?.DocEditor) return;
  const src = `${APP_ROOT}${API_JS}`;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-ziziyi-api="${src}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => target.DocsAPI?.DocEditor
      ? resolve()
      : reject(new Error("ZIZIYI 编辑器脚本未就绪"));
    const onError = () => reject(new Error("ZIZIYI 编辑器静态资源加载失败"));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = src;
      script.dataset.ziziyiApi = src;
      document.head.appendChild(script);
    }
  });
};

export default function ZiziyiEditorPage() {
  const editorRef = useRef<EditorInstance | null>(null);
  const serverRef = useRef<EditorServer | null>(null);
  const pendingSaveIdRef = useRef("");
  const saveAcksRef = useRef(new Map<string, SaveAck>());
  const generationRef = useRef(0);
  const readyTimeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState("等待载入文档…");
  const [error, setError] = useState("");

  useEffect(() => {
    const saveAcks = saveAcksRef.current;
    const disposeEditor = () => {
      if (readyTimeoutRef.current !== null) {
        window.clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      try {
        editorRef.current?.destroyEditor?.();
      } catch {
        // 编辑器在启动阶段销毁可能抛错。
      }
      editorRef.current = null;
      if (serverRef.current) {
        MockSocket.off("connect", serverRef.current.handleConnect);
        MockSocket.off("disconnect", serverRef.current.handleDisconnect);
        serverRef.current.dispose();
      }
      serverRef.current = null;
    };

    const openDocument = async (message: Extract<ZiziyiHostMessage, { type: "open" }>) => {
      const generation = ++generationRef.current;
      disposeEditor();
      setError("");
      setStatus("正在浏览器中解析 Office 文件…");

      const server = new EditorServer({
        editing: message.editing,
        onSaveError: (saveError) => {
          const requestId = pendingSaveIdRef.current;
          pendingSaveIdRef.current = "";
          if (requestId) {
            messageParent({
              bridge: ZIZIYI_BRIDGE,
              type: "save-complete",
              requestId,
              ok: false,
              error: saveError.message,
            });
          } else {
            messageParent({ bridge: ZIZIYI_BRIDGE, type: "error", error: saveError.message });
          }
        },
        onSave: async (bytes, fileName) => {
          const requestId = pendingSaveIdRef.current || `editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          pendingSaveIdRef.current = "";
          const data = bytes.slice().buffer;
          try {
            await new Promise<void>((resolve, reject) => {
              saveAcks.set(requestId, { resolve, reject });
              messageParent({
                bridge: ZIZIYI_BRIDGE,
                type: "save-data",
                requestId,
                fileName,
                data,
              }, [data]);
            });
            messageParent({ bridge: ZIZIYI_BRIDGE, type: "dirty", dirty: false });
            messageParent({ bridge: ZIZIYI_BRIDGE, type: "save-complete", requestId, ok: true });
          } catch (saveError) {
            const saveMessage = saveError instanceof Error ? saveError.message : "保存失败";
            messageParent({
              bridge: ZIZIYI_BRIDGE,
              type: "save-complete",
              requestId,
              ok: false,
              error: saveMessage,
            });
            throw saveError;
          } finally {
            saveAcks.delete(requestId);
          }
        },
      });
      serverRef.current = server;
      setStatus("正在加载常用字体…");
      const fonts = await loadCommonZiziyiFonts();
      if (generation !== generationRef.current) return;
      setStatus("正在浏览器中解析 Office 文件…");
      await server.open(message.data, message.fileName, fonts);
      if (generation !== generationRef.current) return;

      MockSocket.on("connect", server.handleConnect);
      MockSocket.on("disconnect", server.handleDisconnect);
      await loadDocsApi();
      if (generation !== generationRef.current) return;

      const DocsAPI = (window as DocsApiWindow).DocsAPI;
      if (!DocsAPI?.DocEditor) throw new Error("ZIZIYI 编辑器未就绪");
      const documentInfo = server.getDocument();
      const user = server.getUser();
      server.setClient({ buildVersion: DocsAPI.DocEditor.version() });
      setStatus("正在打开 ZIZIYI Office…");

      const reportEditorError = (editorError: unknown) => {
        if (readyTimeoutRef.current !== null) {
          window.clearTimeout(readyTimeoutRef.current);
          readyTimeoutRef.current = null;
        }
        const messageText = editorError instanceof Error
          ? editorError.message
          : String(editorError || "ZIZIYI 编辑器加载失败");
        setStatus("");
        setError(messageText);
        messageParent({ bridge: ZIZIYI_BRIDGE, type: "error", error: messageText });
      };

      readyTimeoutRef.current = window.setTimeout(() => {
        if (generation !== generationRef.current) return;
        reportEditorError(new Error("ZIZIYI 编辑器加载超时，请确认当前网络可以访问 office-editor.ziziyi.com 后重试"));
      }, 60_000);

      editorRef.current = new DocsAPI.DocEditor("ziziyi-editor", {
        document: {
          fileType: documentInfo.fileType,
          key: documentInfo.key,
          title: documentInfo.title,
          url: documentInfo.url,
          permissions: {
            edit: message.editing,
            chat: false,
            rename: false,
            protect: message.editing,
            review: false,
            print: true,
            download: true,
          },
        },
        documentType: getDocumentType(documentInfo.fileType),
        editorConfig: {
          lang: "zh-CN",
          mode: message.editing ? "edit" : "view",
          coEditing: { mode: "fast", change: false },
          user,
          customization: {
            uiTheme: message.theme === "dark" ? "theme-night" : "theme-white",
            chat: false,
            comments: false,
            help: false,
            plugins: false,
            features: { spellcheck: { change: false } },
          },
        },
        events: {
          onAppReady: () => {
            try {
              const frame = document.querySelector<HTMLIFrameElement>('iframe[name="frameEditor"]');
              const frameWindow = frame?.contentWindow as (Window & typeof globalThis) | null;
              if (!frameWindow) throw new Error("ZIZIYI 编辑器窗口未创建");

              const resolveAssetUrl = createZiziyiAssetUrlResolver(getDocumentType(documentInfo.fileType), window.location.origin);
              const xhr = createXHRProxy(frameWindow.XMLHttpRequest, resolveAssetUrl);
              const fetchProxy = createFetchProxy(frameWindow as Window & { fetch: typeof fetch }, resolveAssetUrl);
              const NativeWorker = frameWindow.Worker;
              xhr.use((request: Request) => server.handleRequest(request));
              fetchProxy.use((request: Request) => server.handleRequest(request));
              Object.assign(frameWindow, {
                io,
                XMLHttpRequest: xhr,
                fetch: fetchProxy,
                Worker: function Worker(url: string | URL, options?: WorkerOptions) {
                  const resolved = new URL(url, window.location.origin);
                  return new NativeWorker(resolved.href.replace(resolved.origin, window.location.origin), options);
                },
              });
              setStatus("正在载入文档内容…");
            } catch (appReadyError) {
              reportEditorError(appReadyError);
            }
          },
          onDocumentReady: () => {
            if (readyTimeoutRef.current !== null) {
              window.clearTimeout(readyTimeoutRef.current);
              readyTimeoutRef.current = null;
            }
            setStatus("");
            messageParent({ bridge: ZIZIYI_BRIDGE, type: "loaded" });
          },
          onDocumentStateChange: (event: { data?: unknown }) => {
            if (Boolean(event?.data)) {
              messageParent({ bridge: ZIZIYI_BRIDGE, type: "dirty", dirty: true });
            }
          },
          onError: (event: { data?: { errorDescription?: unknown; errorCode?: unknown } }) => {
            const description = String(event?.data?.errorDescription ?? "").trim();
            const code = String(event?.data?.errorCode ?? "").trim();
            reportEditorError(description || (code ? `ZIZIYI 编辑器错误（${code}）` : "ZIZIYI 编辑器加载失败"));
          },
        },
        type: "desktop",
        width: "100%",
        height: "100%",
      });
    };

    const onMessage = (event: MessageEvent<ZiziyiHostMessage>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !isZiziyiBridgeMessage(event.data)) return;
      const message = event.data as ZiziyiHostMessage;
      if (message.type === "open") {
        void openDocument(message).catch((openError) => {
          const openMessage = openError instanceof Error ? openError.message : "ZIZIYI 文档加载失败";
          setError(openMessage);
          setStatus("");
          messageParent({ bridge: ZIZIYI_BRIDGE, type: "error", error: openMessage });
        });
        return;
      }
      if (message.type === "save") {
        if (!editorRef.current || !serverRef.current) {
          messageParent({
            bridge: ZIZIYI_BRIDGE,
            type: "save-complete",
            requestId: message.requestId,
            ok: false,
            error: "ZIZIYI 编辑器尚未准备完成",
          });
          return;
        }
        pendingSaveIdRef.current = message.requestId;
        editorRef.current.downloadAs(serverRef.current.getFileType());
        return;
      }
      if (message.type === "save-result") {
        const pending = saveAcks.get(message.requestId);
        if (!pending) return;
        if (message.ok) pending.resolve();
        else pending.reject(new Error(message.error || "R2 保存失败"));
      }
    };

    window.addEventListener("message", onMessage);
    messageParent({ bridge: ZIZIYI_BRIDGE, type: "ready" });
    return () => {
      generationRef.current += 1;
      window.removeEventListener("message", onMessage);
      for (const ack of saveAcks.values()) ack.reject(new Error("编辑器已关闭"));
      saveAcks.clear();
      disposeEditor();
    };
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-white dark:bg-gray-950">
      <div id="ziziyi-editor" className="h-full w-full">
        <iframe className="hidden h-0 w-0" src={`${APP_ROOT}${PRELOAD_HTML}`} title="ZIZIYI preload" />
      </div>
      {status && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/95 text-sm text-slate-600 dark:bg-gray-950/95 dark:text-slate-300">
          <span className="rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">{status}</span>
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-center dark:bg-gray-950">
          <div>
            <div className="text-sm font-medium text-red-600 dark:text-red-300">{error}</div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">请关闭预览后重试，或切换回原有 Office 预览源。</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
