"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Folder, FolderOpen, Link2, Lock, RefreshCw } from "lucide-react";

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

function SharePageClient() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [passcode, setPasscode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [folderPath, setFolderPath] = useState("");
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [folderCursor, setFolderCursor] = useState<string | null>(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderLoadingMore, setFolderLoadingMore] = useState(false);

  useEffect(() => {
    const c = String(searchParams.get("code") ?? "").trim();
    setCode(c);
  }, [searchParams]);

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

  const unlockShare = async (shareCode: string, inputPasscode = "") => {
    setUnlocking(true);
    setError("");
    try {
      const res = await fetch("/api/share/public/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: shareCode, passcode: inputPasscode }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !data.accessToken) {
        throw new Error(String(data.error ?? "提取码错误，请重试。"));
      }
      setAccessToken(String(data.accessToken));
      if (data.meta) setMeta(data.meta as ShareMeta);
      return String(data.accessToken);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || "校验提取码失败");
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
    if (!meta || !code) return;
    if (meta.status !== "active") return;
    if (!meta.passcodeEnabled) {
      void unlockShare(code, "");
    }
  }, [meta, code]);

  useEffect(() => {
    if (!meta || meta.itemType !== "folder" || !accessToken) return;
    void loadFolderList({ append: false, nextPath: "", nextCursor: null });
  }, [meta, accessToken]);

  const statusText = useMemo(() => {
    if (!meta) return "";
    if (meta.status === "expired") return "该分享已过期";
    if (meta.status === "stopped") return "该分享已停止";
    return "分享可用";
  }, [meta]);

  const pathSegments = useMemo(() => folderPath.split("/").filter(Boolean), [folderPath]);

  const onDownload = (key?: string) => {
    if (!meta || !accessToken) return;
    const qs = new URLSearchParams({ code: meta.shareCode, token: accessToken });
    if (key) qs.set("key", key);
    window.location.href = `/api/share/public/download?${qs.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-sky-50 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-900">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:py-12">
        <div className="rounded-2xl border border-blue-100 bg-white shadow-sm dark:border-blue-900/40 dark:bg-gray-900">
          <div className="border-b border-blue-100 px-5 py-4 md:px-7 dark:border-blue-900/40">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
              <Link2 className="h-4 w-4" />
              <span className="text-sm font-semibold">文件分享</span>
            </div>
            <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">{meta?.itemName || "加载中..."}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="rounded-full border border-gray-200 px-2 py-0.5 dark:border-gray-700">
                {meta?.itemType === "folder" ? "文件夹分享" : "文件分享"}
              </span>
              {meta?.expiresAt ? <span>有效期至：{new Date(meta.expiresAt).toLocaleString()}</span> : <span>永久有效</span>}
              {statusText ? <span>状态：{statusText}</span> : null}
            </div>
          </div>

          <div className="px-5 py-5 md:px-7 md:py-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <RefreshCw className="h-4 w-4 animate-spin" /> 正在加载分享信息...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {meta && meta.status === "active" && meta.passcodeEnabled && !accessToken ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 dark:border-blue-900 dark:bg-blue-950/30">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-200">
                  <Lock className="h-4 w-4" /> 请输入提取码
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="输入提取码"
                    className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-blue-900 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void unlockShare(meta.shareCode, passcode.trim());
                    }}
                    disabled={unlocking}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {unlocking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    验证提取码
                  </button>
                </div>
              </div>
            ) : null}

            {meta && meta.status === "active" && accessToken && meta.itemType === "file" ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-950/30">
                <div className="text-sm text-gray-600 dark:text-gray-300">文件大小：{formatSize(meta.size)}</div>
                <button
                  type="button"
                  onClick={() => onDownload()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" /> 下载文件
                </button>
              </div>
            ) : null}

            {meta && meta.status === "active" && accessToken && meta.itemType === "folder" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                    onClick={() => {
                      void loadFolderList({ append: false, nextPath: "", nextCursor: null });
                    }}
                  >
                    根目录
                  </button>
                  {pathSegments.map((seg, idx) => {
                    const target = `${pathSegments.slice(0, idx + 1).join("/")}/`;
                    return (
                      <button
                        key={`${seg}-${idx}`}
                        type="button"
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                        onClick={() => {
                          void loadFolderList({ append: false, nextPath: target, nextCursor: null });
                        }}
                      >
                        {seg}
                      </button>
                    );
                  })}
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                  <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400">
                    文件夹内容（仅支持逐个文件下载）
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {folderLoading ? (
                      <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">正在加载目录...</div>
                    ) : folderItems.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">当前目录为空</div>
                    ) : (
                      folderItems.map((item) => (
                        <div key={`${item.type}-${item.key}`} className="flex items-center gap-3 px-4 py-3">
                          {item.type === "folder" ? (
                            <Folder className="h-4 w-4 text-yellow-500" />
                          ) : (
                            <Download className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                          )}
                          <div className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100">
                            <div className="truncate">{item.name}</div>
                            {item.type === "file" ? (
                              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{formatSize(item.size)}</div>
                            ) : null}
                          </div>
                          {item.type === "folder" ? (
                            <button
                              type="button"
                              onClick={() => {
                                void loadFolderList({ append: false, nextPath: item.path, nextCursor: null });
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <FolderOpen className="h-3.5 w-3.5" /> 打开
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDownload(item.key)}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                            >
                              <Download className="h-3.5 w-3.5" /> 下载
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
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {folderLoadingMore ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    加载更多
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-sky-50 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-900">
          <div className="mx-auto w-full max-w-4xl px-4 py-8 md:py-12">
            <div className="rounded-2xl border border-blue-100 bg-white shadow-sm p-6 text-sm text-gray-500 dark:border-blue-900/40 dark:bg-gray-900 dark:text-gray-400">
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
