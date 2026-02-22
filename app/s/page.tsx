"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Orbitron } from "next/font/google";
import { ChevronRight, Download, Eye, FileCode, FolderOpen, Lock, RefreshCw, X } from "lucide-react";
import { getFileIconSrc } from "@/lib/file-icons";

type ShareMeta = {
  id: string;
  shareCode: string;
  itemType: "file" | "folder";
  itemKey: string;
  itemName: string;
  note?: string;
  passcodeEnabled: boolean;
  expiresAt?: string;
  status: "active" | "expired" | "stopped";
  size?: number;
};

type FolderItem =
  | {
      type: "folder";
      name: string;
      key: string;
      path: string;
    }
  | {
      type: "file";
      name: string;
      key: string;
      size?: number;
      lastModified?: string;
    };

type SharePreviewKind = "image" | "video" | "audio" | "text" | "pdf" | "office" | "other";

type SharePreviewState = {
  key: string;
  name: string;
  url: string;
  kind: SharePreviewKind;
  text?: string;
};

const formatSize = (bytes?: number) => {
  if (!Number.isFinite(bytes ?? NaN) || (bytes ?? 0) < 0) return "-";
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))));
  return `${(bytes / 1024 ** idx).toFixed(2).replace(/\.00$/, "")} ${units[idx]}`;
};

const getFileExt = (name: string) => {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
};

const resolvePreviewKind = (name: string): SharePreviewKind => {
  const lower = name.toLowerCase();
  const ext = getFileExt(name);
  if (ext === "pdf") return "pdf";
  if (/^(doc|docx|ppt|pptx|xls|xlsx)$/.test(ext)) return "office";
  if (/\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|tiff)$/.test(lower)) return "image";
  if (/\.(mp4|mov|mkv|webm|ogg|avi|m4v)$/.test(lower)) return "video";
  if (/\.(mp3|wav|flac|ogg|m4a|aac|wma)$/.test(lower)) return "audio";
  if (/\.(txt|log|md|json|csv|ts|tsx|js|jsx|css|html|xml|yml|yaml|ini|conf)$/.test(lower)) return "text";
  return "other";
};

const toAbsoluteUrl = (rawUrl: string) => {
  const url = String(rawUrl ?? "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
};

const renderShareItemIcon = (type: "file" | "folder", name: string, size: "lg" | "sm" = "sm") => {
  const iconSizeClass = size === "lg" ? "h-8 w-8" : "h-[2.3rem] w-[2.3rem]";
  return (
    <img
      src={getFileIconSrc(type, name)}
      alt=""
      aria-hidden="true"
      className={`${iconSizeClass} shrink-0 object-contain`}
      draggable={false}
    />
  );
};

const PRIMARY_BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 text-white transition hover:border-blue-700 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-slate-600 dark:hover:bg-gray-800";
const navTitleFont = Orbitron({ subsets: ["latin"], weight: ["700"], display: "swap" });
const SHARE_PASSCODE_MAX_LENGTH = 16;
const SHARE_PASSCODE_MAX_ATTEMPTS = 3;
const SHARE_PASSCODE_LOCK_STORAGE_PREFIX = "share-passcode-lock-until:";

const toHalfWidthAlphaNum = (input: string) =>
  input.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

const normalizePasscodeInput = (raw: string) =>
  toHalfWidthAlphaNum(String(raw ?? "").replace(/\u3000/g, " ")).replace(/[^A-Za-z0-9]/g, "");

const getPasscodeLockStorageKey = (shareCode: string) => `${SHARE_PASSCODE_LOCK_STORAGE_PREFIX}${shareCode}`;

const readPersistedPasscodeLockUntil = (shareCode: string) => {
  if (!shareCode || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getPasscodeLockStorageKey(shareCode));
    const ts = Number(raw ?? NaN);
    return Number.isFinite(ts) && ts > Date.now() ? ts : null;
  } catch {
    return null;
  }
};

const persistPasscodeLockUntil = (shareCode: string, lockUntilMs: number | null) => {
  if (!shareCode || typeof window === "undefined") return;
  try {
    const key = getPasscodeLockStorageKey(shareCode);
    if (typeof lockUntilMs === "number" && Number.isFinite(lockUntilMs) && lockUntilMs > Date.now()) {
      window.localStorage.setItem(key, String(lockUntilMs));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures (private mode / quota).
  }
};

const ShareTopNav = () => (
  <header className="w-full border-b border-blue-100 bg-white/95 dark:border-blue-900/40 dark:bg-gray-900/95">
    <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5 px-4 py-2.5 sm:gap-3 sm:py-3">
      <img src="/brand.png" alt="" aria-hidden="true" className="h-10 w-10 object-contain sm:h-12 sm:w-12" draggable={false} />
      <div className="min-w-0 leading-none">
        <div
          className={`${navTitleFont.className} truncate bg-[linear-gradient(90deg,#0ea5e9_0%,#2563eb_45%,#0f766e_100%)] bg-clip-text text-base font-bold leading-none tracking-[0.18em] text-transparent sm:text-lg dark:bg-[linear-gradient(90deg,#67e8f9_0%,#60a5fa_45%,#22d3ee_100%)]`}
        >
          R2-ADMIN-GO
        </div>
        <div className="mt-0.5 text-xs font-semibold leading-none tracking-[0.16em] text-slate-600 sm:text-sm dark:text-slate-300">文件分享</div>
      </div>
    </div>
  </header>
);

function SharePageClient() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [passcodeAttemptsLeft, setPasscodeAttemptsLeft] = useState<number>(SHARE_PASSCODE_MAX_ATTEMPTS);
  const [passcodeLockedUntilMs, setPasscodeLockedUntilMs] = useState<number | null>(null);
  const [lockNowMs, setLockNowMs] = useState<number>(() => Date.now());

  const [folderPath, setFolderPath] = useState("");
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([]);
  const [folderCursor, setFolderCursor] = useState<string | null>(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderLoadingMore, setFolderLoadingMore] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [inlinePreviewEnabled, setInlinePreviewEnabled] = useState(false);
  const [inlinePreviewLoading, setInlinePreviewLoading] = useState(false);
  const [inlinePreviewError, setInlinePreviewError] = useState("");
  const [inlinePreview, setInlinePreview] = useState<SharePreviewState | null>(null);
  const [modalPreview, setModalPreview] = useState<SharePreviewState | null>(null);
  const [modalPreviewError, setModalPreviewError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobileLayout(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const c = String(searchParams.get("code") ?? "").trim();
    setCode(c);
  }, [searchParams]);

  useEffect(() => {
    setInlinePreviewEnabled(false);
    setInlinePreviewLoading(false);
    setInlinePreviewError("");
    setInlinePreview(null);
    setModalPreview(null);
    setModalPreviewError("");
  }, [code, meta?.id, accessToken]);

  useEffect(() => {
    setPasscode("");
    setPasscodeError("");
    setPasscodeAttemptsLeft(SHARE_PASSCODE_MAX_ATTEMPTS);
    setPasscodeLockedUntilMs(null);
    setLockNowMs(Date.now());
    if (!code) return;
    const persistedLockUntil = readPersistedPasscodeLockUntil(code);
    if (persistedLockUntil) {
      setPasscodeLockedUntilMs(persistedLockUntil);
      setPasscodeAttemptsLeft(0);
      setLockNowMs(Date.now());
    } else {
      persistPasscodeLockUntil(code, null);
    }
  }, [code]);

  useEffect(() => {
    if (!passcodeLockedUntilMs) return;
    const timer = window.setInterval(() => {
      setLockNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [passcodeLockedUntilMs]);

  useEffect(() => {
    if (!passcodeLockedUntilMs) return;
    if (passcodeLockedUntilMs <= lockNowMs) {
      setPasscodeLockedUntilMs(null);
      setPasscodeAttemptsLeft(SHARE_PASSCODE_MAX_ATTEMPTS);
      setPasscodeError("");
      if (code) persistPasscodeLockUntil(code, null);
    }
  }, [passcodeLockedUntilMs, lockNowMs, code]);

  const readJsonSafe = async (res: Response) => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  };

  const loadMeta = async (shareCode: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/share/public/meta?code=${encodeURIComponent(shareCode)}`);
      const data = await readJsonSafe(res);
      if (!res.ok || !data.meta) {
        throw new Error(String(data.error ?? "分享不存在或已失效"));
      }
      setMeta(data.meta as ShareMeta);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || "读取分享信息失败");
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const unlockShare = async (shareCode: string, inputPasscode = "", opts?: { inlinePasscodeError?: boolean }) => {
    const now = Date.now();
    if (passcodeLockedUntilMs && passcodeLockedUntilMs > now) {
      const remainMinutes = Math.max(1, Math.ceil((passcodeLockedUntilMs - now) / 60_000));
      const msg = `提取码错误次数过多，请 ${remainMinutes} 分钟后再试。`;
      if (opts?.inlinePasscodeError) {
        setPasscodeError(msg);
        setError("");
      } else {
        setError(msg);
      }
      return "";
    }

    const normalizedPasscode = normalizePasscodeInput(inputPasscode).slice(0, SHARE_PASSCODE_MAX_LENGTH);
    if (meta?.passcodeEnabled && !normalizedPasscode) {
      if (opts?.inlinePasscodeError) {
        setPasscodeError("请输入提取码");
        setError("");
      } else {
        setError("请输入提取码");
      }
      return "";
    }

    setUnlocking(true);
    if (opts?.inlinePasscodeError) {
      setPasscodeError("");
      setError("");
    } else setError("");
    try {
      const res = await fetch("/api/share/public/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: shareCode, passcode: normalizedPasscode }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.accessToken) {
        const remain = Number(data?.remainingAttempts);
        if (Number.isFinite(remain) && remain >= 0) {
          setPasscodeAttemptsLeft(Math.max(0, Math.floor(remain)));
        }

        if (typeof data?.lockUntil === "string") {
          const lockTs = Date.parse(data.lockUntil);
          if (Number.isFinite(lockTs) && lockTs > Date.now()) {
            setPasscodeLockedUntilMs(lockTs);
            setLockNowMs(Date.now());
            setPasscodeAttemptsLeft(0);
            persistPasscodeLockUntil(shareCode, lockTs);
          }
        }

        throw new Error(String(data.error ?? "提取码错误，请重试。"));
      }
      setAccessToken(String(data.accessToken));
      setPasscodeError("");
      setPasscodeAttemptsLeft(SHARE_PASSCODE_MAX_ATTEMPTS);
      setPasscodeLockedUntilMs(null);
      persistPasscodeLockUntil(shareCode, null);
      if (data.meta) {
        const incoming = data.meta as ShareMeta;
        setMeta((prev) => {
          if (!prev || prev.id !== incoming.id) return incoming;
          const merged: ShareMeta = { ...prev, ...incoming };
          const incomingSize =
            typeof incoming.size === "number" && Number.isFinite(incoming.size) && incoming.size >= 0 ? incoming.size : undefined;
          const prevSize = typeof prev.size === "number" && Number.isFinite(prev.size) && prev.size >= 0 ? prev.size : undefined;
          if (incoming.itemType === "file" && incomingSize === undefined && prevSize !== undefined) {
            merged.size = prevSize;
          }
          return merged;
        });
      }
      return String(data.accessToken);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (opts?.inlinePasscodeError) {
        setPasscodeError(message || "提取码错误，请重试。");
        setError("");
      } else {
        setError(message || "校验提取码失败");
      }
      return "";
    } finally {
      setUnlocking(false);
    }
  };

  const loadFolderList = async (opts?: { append?: boolean; nextCursor?: string | null; nextPath?: string }) => {
    if (!meta || meta.itemType !== "folder" || !accessToken) return;
    const append = Boolean(opts?.append);
    const targetCursor = opts?.nextCursor ?? (append ? folderCursor : null);
    const targetPath = opts?.nextPath ?? folderPath;

    if (append) setFolderLoadingMore(true);
    else setFolderLoading(true);

    try {
      const qs = new URLSearchParams({ code: meta.shareCode, token: accessToken, path: targetPath });
      if (targetCursor) qs.set("cursor", targetCursor);
      const res = await fetch(`/api/share/public/list?${qs.toString()}`);
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String(data.error ?? "读取文件夹失败"));

      const nextItems = Array.isArray(data.items) ? (data.items as FolderItem[]) : [];
      setFolderPath(String(data.path ?? targetPath));
      setFolderCursor(data.cursor ? String(data.cursor) : null);
      setFolderItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      if (!append) setSelectedFileKeys([]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || "读取文件夹失败");
    } finally {
      if (append) setFolderLoadingMore(false);
      else setFolderLoading(false);
    }
  };

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setMeta(null);
      setError("分享链接无效，请检查链接后重试。");
      return;
    }
    void loadMeta(code);
  }, [code]);

  useEffect(() => {
    if (!meta?.id || !code) return;
    if (meta.status !== "active") return;
    if (meta.passcodeEnabled) return;
    if (accessToken) return;
    void unlockShare(code, "");
  }, [meta?.id, meta?.status, meta?.passcodeEnabled, code, accessToken]);

  useEffect(() => {
    if (!meta?.id || meta.itemType !== "folder" || !accessToken) return;
    void loadFolderList({ append: false, nextPath: "", nextCursor: null });
  }, [meta?.id, meta?.itemType, accessToken]);

  const statusText = useMemo(() => {
    if (!meta) return "";
    if (meta.status === "active") return "";
    if (meta.status === "expired") return "该分享已过期";
    if (meta.status === "stopped") return "该分享已停止";
    return "";
  }, [meta]);

  const pathSegments = useMemo(() => folderPath.split("/").filter(Boolean), [folderPath]);
  const visibleFileItems = useMemo(
    () => folderItems.filter((item): item is Extract<FolderItem, { type: "file" }> => item.type === "file"),
    [folderItems],
  );
  const allVisibleFilesSelected =
    visibleFileItems.length > 0 && visibleFileItems.every((file) => selectedFileKeys.includes(file.key));

  useEffect(() => {
    const visibleFileKeySet = new Set(visibleFileItems.map((item) => item.key));
    setSelectedFileKeys((prev) => prev.filter((key) => visibleFileKeySet.has(key)));
  }, [visibleFileItems]);

  const buildDownloadUrl = (key?: string, opts?: { download?: boolean; asJson?: boolean; forceProxy?: boolean }) => {
    if (!meta || !accessToken) return "";
    const qs = new URLSearchParams({ code: meta.shareCode, token: accessToken });
    if (key) qs.set("key", key);
    if (opts?.download === false) qs.set("download", "0");
    if (opts?.asJson) qs.set("as", "json");
    if (opts?.forceProxy) qs.set("forceProxy", "1");
    return `/api/share/public/download?${qs.toString()}`;
  };

  const resolvePreviewSourceUrl = async (key: string) => {
    const fallbackUrl = toAbsoluteUrl(buildDownloadUrl(key, { download: false }));
    if (!fallbackUrl) return "";
    const jsonUrl = buildDownloadUrl(key, { download: false, asJson: true });
    if (!jsonUrl) return fallbackUrl;

    try {
      const res = await fetch(jsonUrl);
      const data = await readJsonSafe(res);
      if (!res.ok) return fallbackUrl;
      const directUrl = String((data as { url?: unknown }).url ?? "").trim();
      if (/^https?:\/\//i.test(directUrl)) return directUrl;
      return fallbackUrl;
    } catch {
      return fallbackUrl;
    }
  };

  const buildPreviewState = async (key: string, name: string): Promise<SharePreviewState | null> => {
    const kind = resolvePreviewKind(name);
    const url = await resolvePreviewSourceUrl(key);
    if (!url) return null;
    return {
      key,
      name,
      url,
      kind,
      text: kind === "text" ? "加载中..." : undefined,
    };
  };

  const loadTextPreview = async (
    preview: SharePreviewState,
    setPreview: React.Dispatch<React.SetStateAction<SharePreviewState | null>>,
    setError: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    if (preview.kind !== "text") return;
    try {
      const res = await fetch(preview.url, { headers: { Range: "bytes=0-204799" } });
      const text = await res.text();
      setPreview((prev) => (prev && prev.key === preview.key ? { ...prev, text } : prev));
    } catch {
      try {
        const proxyUrl = toAbsoluteUrl(buildDownloadUrl(preview.key, { download: false, forceProxy: true }));
        if (proxyUrl) {
          const proxyRes = await fetch(proxyUrl, { headers: { Range: "bytes=0-204799" } });
          const proxyText = await proxyRes.text();
          setPreview((prev) => (prev && prev.key === preview.key ? { ...prev, text: proxyText } : prev));
          return;
        }
      } catch {
        // ignore
      }
      setPreview((prev) => (prev && prev.key === preview.key ? { ...prev, text: "文本预览加载失败，请尝试下载查看。" } : prev));
      setError("文本预览加载失败");
    }
  };

  const startSingleFilePreview = async () => {
    if (!meta || meta.itemType !== "file") return;
    setInlinePreviewEnabled(true);
    setInlinePreviewError("");
    setInlinePreviewLoading(true);
    try {
      const preview = await buildPreviewState(meta.itemKey, meta.itemName);
      if (!preview) throw new Error("预览地址生成失败");
      setInlinePreview(preview);
      await loadTextPreview(preview, setInlinePreview, setInlinePreviewError);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "在线预览加载失败";
      setInlinePreviewError(message || "在线预览加载失败");
      setInlinePreview(null);
    } finally {
      setInlinePreviewLoading(false);
    }
  };

  const openFolderFilePreview = async (item: Extract<FolderItem, { type: "file" }>) => {
    setModalPreviewError("");
    const preview = await buildPreviewState(item.key, item.name);
    if (!preview) {
      setModalPreviewError("预览地址生成失败");
      return;
    }
    setModalPreview(preview);
    await loadTextPreview(preview, setModalPreview, setModalPreviewError);
  };

  const renderPreviewPanel = (preview: SharePreviewState) => {
    if (preview.kind === "image") {
      return (
        <div className="flex h-full items-center justify-center overflow-auto">
          <img src={preview.url} alt={preview.name} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      );
    }
    if (preview.kind === "video") {
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-black">
          <video src={preview.url} controls className="h-full w-full object-contain" />
        </div>
      );
    }
    if (preview.kind === "audio") {
      return (
        <div className="flex h-full items-center justify-center">
          <audio src={preview.url} controls className="w-full max-w-2xl" />
        </div>
      );
    }
    if (preview.kind === "pdf") {
      return <iframe src={preview.url} className="h-full w-full rounded-lg bg-white dark:bg-gray-900" title="PDF Preview" />;
    }
    if (preview.kind === "office") {
      return (
        <iframe
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(preview.url)}`}
          className="h-full w-full rounded-lg bg-white dark:bg-gray-900"
          title="Office Preview"
        />
      );
    }
    if (preview.kind === "text") {
      return (
        <pre className="h-full overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs whitespace-pre-wrap dark:border-slate-800 dark:bg-gray-950 dark:text-gray-100">
          {preview.text ?? "加载中..."}
        </pre>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-center dark:border-slate-800 dark:bg-gray-900">
        <FileCode className="h-9 w-9 text-slate-500 dark:text-slate-300" />
        <div className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">此文件类型暂不支持在线预览</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">请点击下载后在本地查看</div>
      </div>
    );
  };

  const resolveDirectDownloadUrl = async (key?: string) => {
    const fallback = toAbsoluteUrl(buildDownloadUrl(key));
    const jsonUrl = buildDownloadUrl(key, { asJson: true });
    if (!jsonUrl) return fallback;
    try {
      const res = await fetch(jsonUrl);
      const data = await readJsonSafe(res);
      if (!res.ok) return fallback;
      const directUrl = String((data as { url?: unknown }).url ?? "").trim();
      if (/^https?:\/\//i.test(directUrl)) return directUrl;
      return fallback;
    } catch {
      return fallback;
    }
  };

  const onDownload = async (key?: string) => {
    const url = await resolveDirectDownloadUrl(key);
    if (!url) return;
    window.location.href = url;
  };

  const onBatchDownloadSelected = () => {
    if (selectedFileKeys.length === 0) return;
    selectedFileKeys.forEach((key, index) => {
      window.setTimeout(() => {
        void (async () => {
          const url = await resolveDirectDownloadUrl(key);
          if (!url) return;
          const iframe = document.createElement("iframe");
          iframe.style.display = "none";
          iframe.src = url;
          document.body.appendChild(iframe);
          window.setTimeout(() => {
            iframe.remove();
          }, 30_000);
        })();
      }, index * 180);
    });
  };

  const unavailableByError = useMemo(() => {
    if (!error) return false;
    return /分享不存在|已失效|已过期|已停止|链接无效/.test(error);
  }, [error]);

  const showPasscodeGate = Boolean(meta && meta.status === "active" && meta.passcodeEnabled && !accessToken);
  const showUnavailableState = !loading && (unavailableByError || meta?.status === "expired" || meta?.status === "stopped");
  const unavailableMessage = "该分享已被取消、删除或失效，请联系分享方重新获取最新链接。";
  const passcodeLockRemainSec = passcodeLockedUntilMs ? Math.max(0, Math.ceil((passcodeLockedUntilMs - lockNowMs) / 1000)) : 0;
  const passcodeLocked = passcodeLockRemainSec > 0;
  const passcodeLockRemainMinutes = Math.max(1, Math.ceil(passcodeLockRemainSec / 60));
  const shouldShowPasscodeError = Boolean(passcodeError) && !(passcodeLocked && /锁定/.test(passcodeError));
  const singleFileSizeText = useMemo(() => {
    if (!meta || meta.itemType !== "file") return "";
    if (typeof meta.size === "number" && Number.isFinite(meta.size) && meta.size >= 0) {
      return `大小：${formatSize(meta.size)}`;
    }
    return "";
  }, [meta]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1100px_500px_at_50%_-120px,#dbeafe_0%,#eff6ff_45%,#f8fafc_78%,#ffffff_100%)] dark:bg-gradient-to-b dark:from-gray-950 dark:via-gray-900 dark:to-gray-900">
      <ShareTopNav />

      <div className={`mx-auto w-full max-w-5xl px-4 ${showPasscodeGate ? "py-0 md:py-12" : "py-8 md:py-12"}`}>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-600 dark:text-gray-300">
            <RefreshCw className="h-4 w-4 animate-spin" /> 正在加载分享信息...
          </div>
        ) : null}

        {showUnavailableState ? (
          <div className="mx-auto flex max-w-xl flex-col items-center pt-8 text-center">
            <img src="/Share-Cancel.svg" alt="分享已取消或失效" className="h-44 w-44 object-contain sm:h-52 sm:w-52" />
            <p className="mt-5 text-base font-medium leading-7 text-slate-600 dark:text-gray-200">{unavailableMessage}</p>
          </div>
        ) : null}

        {!loading && !showUnavailableState ? (
          <>
            {showPasscodeGate ? (
              <div className="mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-md -translate-y-7 flex-col justify-center overflow-hidden pt-0 md:min-h-0 md:translate-y-0 md:justify-center md:pt-10">
                <div className="mb-5 flex justify-center">
                  <img src="/secure-login.svg" alt="请输入提取码" className="h-47 w-47 object-contain sm:h-47 sm:w-47" />
                </div>
                <div className="mb-4 flex items-center justify-center gap-2 text-base font-medium text-slate-600 dark:text-gray-200">
                  <Lock className="h-4 w-4" />
                  <span>请输入提取码继续访问分享内容</span>
                </div>
                <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto]">
                  <input
                    value={passcode}
                    onChange={(e) => {
                      setPasscode(normalizePasscodeInput(e.target.value).slice(0, SHARE_PASSCODE_MAX_LENGTH));
                      if (passcodeError) setPasscodeError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || unlocking || passcodeLocked || !meta) return;
                      void unlockShare(meta.shareCode, passcode, { inlinePasscodeError: true });
                    }}
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={SHARE_PASSCODE_MAX_LENGTH}
                    pattern="[A-Za-z0-9]*"
                    disabled={unlocking || passcodeLocked}
                    placeholder="输入提取码"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-base outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-300/30 dark:border-slate-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void unlockShare(meta!.shareCode, passcode, { inlinePasscodeError: true });
                    }}
                    disabled={unlocking || passcodeLocked || passcode.length === 0}
                    className={`${PRIMARY_BUTTON_BASE} h-11 min-w-[148px] px-4 text-sm font-medium`}
                  >
                    {unlocking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    验证提取码
                  </button>
                </div>
                <div className="mt-2 text-xs">
                  {passcodeLocked ? (
                    <span className="text-red-600 dark:text-red-300">输入错误次数过多，已锁定，{passcodeLockRemainMinutes} 分钟后可重试</span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">剩余尝试：{passcodeAttemptsLeft}</span>
                  )}
                </div>
                {shouldShowPasscodeError ? <p className="mt-2 text-sm text-red-600 dark:text-red-300">{passcodeError}</p> : null}
              </div>
            ) : (
              <div className="space-y-4">
                {meta ? (
                  <div className="pb-2">
                    <div className="md:flex md:items-start md:justify-between md:gap-3">
                      <div className="md:min-w-0 md:flex-1">
                        <div className="flex items-center gap-3">
                          {renderShareItemIcon(meta.itemType, meta.itemName, "lg")}
                          <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-gray-900 sm:text-lg md:text-xl dark:text-gray-100">{meta.itemName}</h1>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                          <span>{meta.itemType === "folder" ? "文件夹分享" : "文件分享"}</span>
                          {singleFileSizeText ? <span>{singleFileSizeText}</span> : null}
                          <span>{meta.expiresAt ? `有效期至：${new Date(meta.expiresAt).toLocaleString()}` : "永久有效"}</span>
                          {statusText ? <span>状态：{statusText}</span> : null}
                        </div>
                      </div>
                      {meta.status === "active" && accessToken && meta.itemType === "file" ? (
                        <button
                          type="button"
                          onClick={() => onDownload()}
                          className="hidden h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-medium text-white transition hover:border-blue-700 hover:bg-blue-700 md:inline-flex"
                        >
                          <Download className="h-4 w-4" /> 下载文件
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}

                {meta && meta.status === "active" && accessToken && meta.itemType === "file" ? (
                  <div className="space-y-3 pt-1">
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-gray-900">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-gray-950/40">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">在线预览</span>
                      </div>
                      <div className="h-[320px] sm:h-[420px] bg-slate-50/50 p-3 dark:bg-gray-950/40">
                        {!inlinePreviewEnabled ? (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center dark:border-slate-700 dark:bg-gray-900">
                            <div className="px-4">
                              <button
                                type="button"
                                onClick={() => {
                                  void startSingleFilePreview();
                                }}
                                className={`${SECONDARY_BUTTON_BASE} mx-auto mb-3 h-8 px-3 text-[13px] font-medium`}
                              >
                                <Eye className="h-4 w-4" />
                                加载预览
                              </button>
                              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">在线预览默认按需加载</div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">点击“加载预览”后再请求文件，避免影响页面加载速度。</div>
                            </div>
                          </div>
                        ) : inlinePreviewLoading && !inlinePreview ? (
                          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 正在加载预览...
                          </div>
                        ) : inlinePreview ? (
                          renderPreviewPanel(inlinePreview)
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-red-600 dark:text-red-300">
                            {inlinePreviewError || "预览加载失败"}
                          </div>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => onDownload()} className={`${PRIMARY_BUTTON_BASE} h-11 px-5 text-sm font-medium md:hidden`}>
                      <Download className="h-4 w-4" /> 下载文件
                    </button>
                  </div>
                ) : null}

                {meta && meta.status === "active" && accessToken && meta.itemType === "folder" ? (
                  <div className="space-y-4 pt-1">
                    <div className="rounded-xl border border-slate-200/90 bg-white/80 p-2.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-slate-800 dark:bg-gray-900/80">
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex min-h-9 min-w-[12rem] flex-1 items-center gap-1 overflow-x-auto text-slate-600 dark:text-slate-300">
                          <button
                            type="button"
                            className="inline-flex h-8 shrink-0 items-center gap-1 px-1 text-[14px] font-medium text-slate-600 transition-colors hover:text-blue-600 sm:text-[15px] dark:text-slate-300 dark:hover:text-blue-300"
                            onClick={() => {
                              void loadFolderList({ append: false, nextPath: "", nextCursor: null });
                            }}
                          >
                            <FolderOpen className="h-4 w-4" />
                            根目录
                          </button>
                          {pathSegments.map((seg, idx) => {
                            const target = `${pathSegments.slice(0, idx + 1).join("/")}/`;
                            return (
                              <React.Fragment key={`${seg}-${idx}`}>
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                <button
                                  type="button"
                                  className="inline-flex h-8 shrink-0 items-center px-1 text-[14px] font-medium text-slate-600 transition-colors hover:text-blue-600 sm:text-[15px] dark:text-slate-300 dark:hover:text-blue-300"
                                  onClick={() => {
                                    void loadFolderList({ append: false, nextPath: target, nextCursor: null });
                                  }}
                                >
                                  {seg}
                                </button>
                              </React.Fragment>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={onBatchDownloadSelected}
                          disabled={selectedFileKeys.length === 0}
                          className={`${PRIMARY_BUTTON_BASE} h-9 shrink-0 self-center px-3.5 text-[13px] font-medium`}
                        >
                          <Download className="h-4 w-4" />
                          <span className="hidden sm:inline">下载已选 ({selectedFileKeys.length})</span>
                          <span className="sm:hidden">下载 ({selectedFileKeys.length})</span>
                        </button>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-gray-900">
                      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-gray-950/40">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allVisibleFilesSelected}
                            disabled={visibleFileItems.length === 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedFileKeys((prev) => {
                                const next = new Set(prev);
                                if (checked) {
                                  for (const item of visibleFileItems) next.add(item.key);
                                } else {
                                  for (const item of visibleFileItems) next.delete(item.key);
                                }
                                return Array.from(next);
                              });
                            }}
                            className="h-4 w-4 shrink-0 rounded-sm border-slate-300 accent-blue-600 disabled:opacity-40 dark:border-slate-600"
                          />
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">文件夹内容</span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{folderItems.length} 项</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {folderLoading ? (
                          <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">正在加载目录...</div>
                        ) : folderItems.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">当前目录为空</div>
                        ) : (
                          folderItems.map((item) => (
                            <div
                              key={`${item.type}-${item.key}`}
                              onClick={() => {
                                if (item.type === "folder") {
                                  void loadFolderList({ append: false, nextPath: item.path, nextCursor: null });
                                  return;
                                }
                                setSelectedFileKeys([item.key]);
                                if (isMobileLayout) {
                                  void openFolderFilePreview(item);
                                }
                              }}
                              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-blue-50/55 dark:hover:bg-blue-950/20"
                            >
                              {item.type === "file" ? (
                                <input
                                  type="checkbox"
                                  checked={selectedFileKeys.includes(item.key)}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectedFileKeys((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(item.key);
                                      else next.delete(item.key);
                                      return Array.from(next);
                                    });
                                  }}
                                  className="h-4 w-4 shrink-0 rounded-sm border-slate-300 accent-blue-600 dark:border-slate-600"
                                />
                              ) : (
                                <span className="block h-4 w-4 shrink-0" aria-hidden="true" />
                              )}
                              {renderShareItemIcon(item.type, item.name, "sm")}
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[15px] font-medium text-slate-800 dark:text-slate-100">{item.name}</div>
                                {item.type === "file" ? (
                                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatSize(item.size)}</div>
                                ) : null}
                              </div>
                              {item.type === "folder" ? (
                                <button
                                  type="button"
                                  aria-label="打开文件夹"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void loadFolderList({ append: false, nextPath: item.path, nextCursor: null });
                                  }}
                                  className={`${SECONDARY_BUTTON_BASE} h-8 w-10 px-0 text-[13px] font-medium sm:w-auto sm:px-3.5`}
                                >
                                  <FolderOpen className="h-4 w-4" />
                                  <span className="hidden sm:inline">打开</span>
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {!isMobileLayout ? (
                                    <button
                                      type="button"
                                      aria-label="预览文件"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void openFolderFilePreview(item);
                                      }}
                                      className={`${SECONDARY_BUTTON_BASE} h-8 px-3.5 text-[13px] font-medium`}
                                    >
                                      <Eye className="h-4 w-4" />
                                      <span>预览</span>
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    aria-label="下载文件"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDownload(item.key);
                                    }}
                                    className={`${PRIMARY_BUTTON_BASE} h-8 w-10 px-0 text-[13px] font-medium sm:w-auto sm:px-3.5`}
                                  >
                                    <Download className="h-4 w-4" />
                                    <span className="hidden sm:inline">下载</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {folderCursor ? (
                      <button
                        type="button"
                        onClick={() => {
                          void loadFolderList({ append: true, nextCursor: folderCursor });
                        }}
                        disabled={folderLoadingMore}
                        className={`${SECONDARY_BUTTON_BASE} h-9 px-3.5 text-[13px] font-medium`}
                      >
                        {folderLoadingMore ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        加载更多
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </div>

      {modalPreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6"
          onClick={() => setModalPreview(null)}
        >
          <div
            className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{modalPreview.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">在线预览</div>
              </div>
              <button
                type="button"
                onClick={() => setModalPreview(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-gray-800"
                aria-label="关闭预览"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[72vh] bg-slate-50/70 p-3 dark:bg-gray-950/40">
              {renderPreviewPanel(modalPreview)}
            </div>
            {modalPreviewError ? (
              <div className="border-t border-slate-200 px-4 py-2 text-xs text-red-600 dark:border-slate-800 dark:text-red-300">
                {modalPreviewError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[radial-gradient(1100px_500px_at_50%_-120px,#dbeafe_0%,#eff6ff_45%,#f8fafc_78%,#ffffff_100%)] dark:bg-gradient-to-b dark:from-gray-950 dark:via-gray-900 dark:to-gray-900">
          <ShareTopNav />
          <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
            <div className="py-4 text-sm text-gray-500 dark:text-gray-400">
              正在加载分享页面...
            </div>
          </div>
        </div>
      }
    >
      <SharePageClient />
    </Suspense>
  );
}
