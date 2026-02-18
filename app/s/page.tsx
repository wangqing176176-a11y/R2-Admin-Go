"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Noto_Sans_SC } from "next/font/google";
import { ChevronRight, Download, FolderOpen, Lock, RefreshCw } from "lucide-react";

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

const renderShareItemIcon = (type: "file" | "folder", name: string, size: "lg" | "sm" = "sm") => {
  const iconSizeClass = size === "lg" ? "h-8 w-8" : "h-[2.3rem] w-[2.3rem]";
  const lowerName = name.toLowerCase();
  const ext = getFileExt(name);
  const labeledFontSize = size === "lg" ? "4.2" : "3.8";

  const renderLabeledDoc = (toneClass: string, label: string) => (
    <svg viewBox="0 0 24 24" className={`${iconSizeClass} ${toneClass}`} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625Z"
        clipRule="evenodd"
      />
      <path d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z" />
      <text x="12" y="18" textAnchor="middle" fontSize={labeledFontSize} fill="white" fontWeight="bold">
        {label}
      </text>
    </svg>
  );

  if (type === "folder") {
    return (
      <svg viewBox="0 0 24 24" className={`${iconSizeClass} text-yellow-400`} fill="currentColor" aria-hidden="true">
        <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
      </svg>
    );
  }
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/.test(lowerName)) {
    return (
      <svg viewBox="0 0 24 24" className={`${iconSizeClass} text-purple-500`} fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (/\.(mp4|webm|ogg|mov|mkv|avi|m4v)$/.test(lowerName)) {
    return (
      <svg viewBox="0 0 24 24" className={`${iconSizeClass} text-rose-500`} fill="currentColor" aria-hidden="true">
        <path d="M4.5 4.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8.25a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3H4.5ZM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06Z" />
      </svg>
    );
  }
  if (/\.(mp3|wav|ogg|m4a|flac|aac|wma)$/.test(lowerName)) {
    return (
      <svg viewBox="0 0 24 24" className={`${iconSizeClass} text-cyan-500`} fill="currentColor" aria-hidden="true">
        <path d="M21 3L9 5.5v10.03a3.5 3.5 0 1 0 2 3V8.41l8-1.66v7.78a3.5 3.5 0 1 0 2 3V3z" />
      </svg>
    );
  }
  if (lowerName.endsWith(".pdf")) {
    return renderLabeledDoc("text-red-500", "PDF");
  }
  if (/\.(xlsx|xls|csv)$/.test(lowerName)) {
    return renderLabeledDoc("text-green-600", "XLS");
  }
  if (/\.(pptx|ppt)$/.test(lowerName)) {
    return renderLabeledDoc("text-orange-500", "PPT");
  }
  if (/\.(docx|doc)$/.test(lowerName)) {
    return renderLabeledDoc("text-blue-600", "DOC");
  }
  if (/(dwg|dxf|dwt|dwf|step|stp|iges|igs|ifc)$/.test(ext)) {
    return renderLabeledDoc("text-teal-600", "CAD");
  }
  if (/(exe|msi|com|scr)$/.test(ext)) {
    return renderLabeledDoc("text-slate-700", "EXE");
  }
  if (/(apk|xapk|apks|aab)$/.test(ext)) {
    return renderLabeledDoc("text-emerald-600", "APK");
  }
  if (ext === "ipa") {
    return renderLabeledDoc("text-sky-600", "IPA");
  }
  if (/(dmg|pkg|deb|rpm|appimage)$/.test(ext)) {
    return renderLabeledDoc("text-slate-600", "APP");
  }
  if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(lowerName)) {
    return renderLabeledDoc("text-gray-500", "ZIP");
  }
  if (/\.(html|css|js|jsx|ts|tsx|json|java|py|go|c|cpp|h|cs|php|rb|sh|bat|cmd|xml|yaml|yml|sql|rs|swift|kt)$/.test(lowerName)) {
    return renderLabeledDoc("text-indigo-500", "CODE");
  }
  if (/\.(txt|md|markdown|log|ini|conf)$/.test(lowerName)) {
    return renderLabeledDoc("text-slate-500", "TXT");
  }
  return renderLabeledDoc("text-gray-400", "FILE");
};

const PRIMARY_BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 text-white transition hover:border-blue-700 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-slate-600 dark:hover:bg-gray-800";
const navTitleFont = Noto_Sans_SC({ subsets: ["latin"], weight: ["700"], display: "swap" });
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
    <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
      <img src="/brand.png" alt="" aria-hidden="true" className="h-12 w-12 object-contain" draggable={false} />
      <span className={`${navTitleFont.className} text-xl font-bold tracking-[0.02em] text-blue-600 sm:text-2xl dark:text-blue-300`}>
        R2 Admin Go 文件分享
      </span>
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

  useEffect(() => {
    const c = String(searchParams.get("code") ?? "").trim();
    setCode(c);
  }, [searchParams]);

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

  const buildDownloadUrl = (key?: string) => {
    if (!meta || !accessToken) return "";
    const qs = new URLSearchParams({ code: meta.shareCode, token: accessToken });
    if (key) qs.set("key", key);
    return `/api/share/public/download?${qs.toString()}`;
  };

  const onDownload = (key?: string) => {
    const url = buildDownloadUrl(key);
    if (!url) return;
    window.location.href = url;
  };

  const onBatchDownloadSelected = () => {
    if (selectedFileKeys.length === 0) return;
    selectedFileKeys.forEach((key, index) => {
      const url = buildDownloadUrl(key);
      if (!url) return;
      window.setTimeout(() => {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url;
        document.body.appendChild(iframe);
        window.setTimeout(() => {
          iframe.remove();
        }, 30_000);
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

      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
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
              <div className="mx-auto max-w-md pt-10">
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
              <div className="space-y-6">
                {meta ? (
                  <div className="border-b border-blue-100/90 pb-4 dark:border-blue-900/40">
                    <div className="flex items-center gap-3">
                      {renderShareItemIcon(meta.itemType, meta.itemName, "lg")}
                      <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-gray-900 md:text-xl dark:text-gray-100">{meta.itemName}</h1>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>{meta.itemType === "folder" ? "文件夹分享" : "文件分享"}</span>
                      {singleFileSizeText ? <span>{singleFileSizeText}</span> : null}
                      <span>{meta.expiresAt ? `有效期至：${new Date(meta.expiresAt).toLocaleString()}` : "永久有效"}</span>
                      {statusText ? <span>状态：{statusText}</span> : null}
                    </div>
                  </div>
                ) : null}

                {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}

                {meta && meta.status === "active" && accessToken && meta.itemType === "file" ? (
                  <div className="space-y-3 pt-4">
                    <button type="button" onClick={() => onDownload()} className={`${PRIMARY_BUTTON_BASE} h-11 px-5 text-sm font-medium`}>
                      <Download className="h-4 w-4" /> 下载文件
                    </button>
                  </div>
                ) : null}

                {meta && meta.status === "active" && accessToken && meta.itemType === "folder" ? (
                  <div className="space-y-4 pt-4">
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
                          下载已选 ({selectedFileKeys.length})
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
                              setSelectedFileKeys(checked ? visibleFileItems.map((item) => item.key) : []);
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
                                    setSelectedFileKeys(checked ? [item.key] : []);
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
