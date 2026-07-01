"use client";

import { Download } from "lucide-react";
import { getFileIconSrc } from "@/lib/file-icons";

type LocalMediaOpenPanelProps = {
  name: string;
  url?: string;
  onDownload?: () => void | Promise<void>;
};

export type LocalPlayerKey = "iina" | "potplayer" | "vlc" | "baofeng";

export const openWithLocalApp = (app: LocalPlayerKey, url?: string) => {
  if (!url) return;

  const href =
    app === "iina"
      ? `iina://weblink?url=${encodeURIComponent(url)}`
      : app === "potplayer"
        ? `potplayer://${url}`
        : app === "baofeng"
          ? `baofeng://${url}`
          : `vlc://${url}`;
  window.location.href = href;
};

const PLAYERS = [
  { key: "iina", label: "IINA", src: "/local-player-icons/iina.png", iconClass: "h-11 w-11 sm:h-14 sm:w-14" },
  { key: "potplayer", label: "PotPlayer", src: "/local-player-icons/potplayer.png", iconClass: "h-9 w-9 sm:h-11 sm:w-11" },
  { key: "vlc", label: "VLC", src: "/local-player-icons/vlc.png", iconClass: "h-12 w-12 sm:h-14 sm:w-14" },
  { key: "baofeng", label: "暴风影音", src: "/local-player-icons/baofeng.png", iconClass: "h-9 w-9 sm:h-11 sm:w-11" },
] as const;

export default function LocalMediaOpenPanel({ name, url, onDownload }: LocalMediaOpenPanelProps) {
  const canOpen = Boolean(url);

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto rounded-md bg-slate-50 px-4 py-6 text-center dark:bg-gray-950/30">
      <div className="w-full max-w-5xl">
        <div className="flex flex-col items-center">
          <img
            src={getFileIconSrc("file", name)}
            alt=""
            aria-hidden="true"
            className="h-12 w-12 object-contain sm:h-14 sm:w-14"
            draggable={false}
          />
          <div className="mt-5 text-lg font-normal text-slate-900 dark:text-slate-100">无法预览此文件</div>
          <div className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            此视频格式不适合网页内播放，使用本地播放器解码更稳定
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-5 gap-x-2 gap-y-5 sm:gap-x-6">
          {PLAYERS.map((player) => (
            <button
              key={player.key}
              type="button"
              onClick={() => openWithLocalApp(player.key, url)}
              disabled={!canOpen}
              className="group flex min-w-0 flex-col items-center gap-2.5 rounded-md px-1 py-1 transition disabled:cursor-not-allowed disabled:opacity-50"
              title={canOpen ? `使用 ${player.label} 打开` : "正在生成打开地址"}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 transition group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-blue-200 dark:bg-slate-900 dark:ring-slate-700 dark:group-hover:ring-blue-500/50 sm:h-16 sm:w-16">
                <img
                  src={player.src}
                  alt={player.label}
                  className={`${player.iconClass} object-contain`}
                  draggable={false}
                />
              </span>
              <span className="max-w-full truncate text-xs font-medium text-slate-600 dark:text-slate-300 sm:text-sm">{player.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void onDownload?.()}
            disabled={!onDownload}
            className="group flex min-w-0 flex-col items-center gap-2.5 rounded-md px-1 py-1 transition disabled:cursor-not-allowed disabled:opacity-50"
            title={onDownload ? "直接下载" : "暂无下载地址"}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 transition group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-blue-200 dark:bg-slate-900 dark:ring-slate-700 dark:group-hover:ring-blue-500/50 sm:h-16 sm:w-16">
              <Download className="h-8 w-8 stroke-[1.8] text-blue-600 dark:text-blue-300 sm:h-9 sm:w-9" />
            </span>
            <span className="max-w-full truncate text-xs font-medium text-slate-600 dark:text-slate-300 sm:text-sm">直接下载</span>
          </button>
        </div>
      </div>
    </div>
  );
}
