"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Download,
  Laptop,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { openWithLocalApp, type LocalPlayerKey } from "@/components/LocalMediaOpenPanel";
import { getFileIconSrc } from "@/lib/file-icons";
import { isBrowserPlayableAudioExt } from "@/lib/media-preview";

type AudioPreviewFile = {
  name: string;
  key: string;
  storageKey?: string;
  size?: number;
  lastModified?: string;
};

type LyricLine = {
  time: number;
  text: string;
};

type AudioPreviewPlayerProps = {
  name: string;
  keyPath: string;
  url: string;
  size?: number;
  lastModified?: string;
  siblingFiles?: AudioPreviewFile[];
  onSelectTrack?: (file: AudioPreviewFile) => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
  resolveRelatedUrl?: (candidateNames: string[]) => Promise<string | undefined>;
};

type EmbeddedMetadata = {
  coverUrl?: string;
  coverObjectUrl?: string;
  lyrics?: string;
};

type PlaybackStatus = "loading" | "ready" | "playing" | "paused" | "ended";

const LOCAL_PLAYERS: Array<{ key: LocalPlayerKey; label: string }> = [
  { key: "iina", label: "IINA" },
  { key: "potplayer", label: "PotPlayer" },
  { key: "vlc", label: "VLC" },
  { key: "baofeng", label: "暴风影音" },
];

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "-";
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatDuration = (seconds?: number) => {
  if (!Number.isFinite(seconds) || !seconds || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

const getFileExt = (name: string) => {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
};

const getBaseName = (name: string) => {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
};

const parseTimestamp = (raw: string) => {
  const parts = raw.split(":");
  if (parts.length < 2) return undefined;
  const min = Number(parts[0]);
  const sec = Number(parts.slice(1).join(":"));
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return undefined;
  return min * 60 + sec;
};

const parseLrc = (text: string) => {
  const lines: LyricLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const stamps = Array.from(rawLine.matchAll(/\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g));
    if (!stamps.length) continue;
    const lyric = rawLine.replace(/\[[^\]]+\]/g, "").trim();
    for (const stamp of stamps) {
      const time = parseTimestamp(stamp[1]);
      if (time !== undefined) lines.push({ time, text: lyric || " " });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
};

const decodeSynchsafe = (a: number, b: number, c: number, d: number) =>
  ((a & 0x7f) << 21) | ((b & 0x7f) << 14) | ((c & 0x7f) << 7) | (d & 0x7f);

const readUint32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);

const readUint32Le = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) << 24);

const latin1Decoder = new TextDecoder("latin1");
const utf8Decoder = new TextDecoder("utf-8");
const utf16Decoder = new TextDecoder("utf-16");
const utf16beDecoder = new TextDecoder("utf-16be");

const decodeId3Text = (encoding: number, bytes: Uint8Array) => {
  if (encoding === 1) return utf16Decoder.decode(bytes).replace(/^\uFEFF/, "").trim();
  if (encoding === 2) return utf16beDecoder.decode(bytes).trim();
  if (encoding === 3) return utf8Decoder.decode(bytes).trim();
  return latin1Decoder.decode(bytes).trim();
};

const findTextTerminator = (bytes: Uint8Array, offset: number, encoding: number) => {
  if (encoding === 1 || encoding === 2) {
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) return i + 2;
    }
    return bytes.length;
  }
  const idx = bytes.indexOf(0, offset);
  return idx >= 0 ? idx + 1 : bytes.length;
};

const parseMp3Id3 = (bytes: Uint8Array): EmbeddedMetadata => {
  if (bytes.length < 10 || latin1Decoder.decode(bytes.slice(0, 3)) !== "ID3") return {};
  const major = bytes[3];
  const tagSize = decodeSynchsafe(bytes[6], bytes[7], bytes[8], bytes[9]);
  const end = Math.min(bytes.length, 10 + tagSize);
  let offset = 10;
  let coverUrl: string | undefined;
  let coverObjectUrl: string | undefined;
  let lyrics: string | undefined;

  while (offset + 10 <= end) {
    const id = latin1Decoder.decode(bytes.slice(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = major === 4
      ? decodeSynchsafe(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
      : readUint32(bytes, offset + 4);
    if (!size || offset + 10 + size > bytes.length) break;
    const frame = bytes.slice(offset + 10, offset + 10 + size);
    if (id === "APIC" && !coverUrl && frame.length > 8) {
      const encoding = frame[0] ?? 0;
      const mimeEnd = frame.indexOf(0, 1);
      if (mimeEnd > 1 && mimeEnd + 2 < frame.length) {
        const mime = latin1Decoder.decode(frame.slice(1, mimeEnd)) || "image/jpeg";
        const descEnd = findTextTerminator(frame, mimeEnd + 2, encoding);
        const imageData = frame.slice(descEnd);
        if (imageData.length) {
          coverObjectUrl = URL.createObjectURL(new Blob([imageData], { type: mime }));
          coverUrl = coverObjectUrl;
        }
      }
    }
    if ((id === "USLT" || id === "SYLT") && !lyrics && frame.length > 5) {
      const encoding = frame[0] ?? 0;
      const descEnd = findTextTerminator(frame, 4, encoding);
      lyrics = decodeId3Text(encoding, frame.slice(descEnd));
    }
    if (coverUrl && lyrics) break;
    offset += 10 + size;
  }

  return { coverUrl, coverObjectUrl, lyrics };
};

const parseFlacMetadata = (bytes: Uint8Array): EmbeddedMetadata => {
  if (bytes.length < 8 || latin1Decoder.decode(bytes.slice(0, 4)) !== "fLaC") return {};
  let offset = 4;
  let coverUrl: string | undefined;
  let coverObjectUrl: string | undefined;
  let lyrics: string | undefined;

  while (offset + 4 <= bytes.length) {
    const header = bytes[offset] ?? 0;
    const isLast = Boolean(header & 0x80);
    const type = header & 0x7f;
    const length = ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    const start = offset + 4;
    const end = start + length;
    if (end > bytes.length) break;
    const block = bytes.slice(start, end);

    if (type === 4 && !lyrics && block.length > 8) {
      let p = 0;
      const vendorLength = readUint32Le(block, p);
      p += 4 + vendorLength;
      const count = p + 4 <= block.length ? readUint32Le(block, p) : 0;
      p += 4;
      for (let i = 0; i < count && p + 4 <= block.length; i += 1) {
        const commentLength = readUint32Le(block, p);
        p += 4;
        const comment = utf8Decoder.decode(block.slice(p, p + commentLength));
        p += commentLength;
        const eq = comment.indexOf("=");
        const key = eq >= 0 ? comment.slice(0, eq).toUpperCase() : "";
        if (key === "LYRICS" || key === "UNSYNCEDLYRICS") {
          lyrics = comment.slice(eq + 1).trim();
          break;
        }
      }
    }

    if (type === 6 && !coverUrl && block.length > 32) {
      let p = 4;
      const mimeLength = readUint32(block, p);
      p += 4;
      const mime = latin1Decoder.decode(block.slice(p, p + mimeLength)) || "image/jpeg";
      p += mimeLength;
      const descLength = readUint32(block, p);
      p += 4 + descLength + 16;
      const dataLength = p + 4 <= block.length ? readUint32(block, p) : 0;
      p += 4;
      const imageData = block.slice(p, p + dataLength);
      if (imageData.length) {
        coverObjectUrl = URL.createObjectURL(new Blob([imageData], { type: mime }));
        coverUrl = coverObjectUrl;
      }
    }

    if (coverUrl && lyrics) break;
    offset = end;
    if (isLast) break;
  }

  return { coverUrl, coverObjectUrl, lyrics };
};

const readEmbeddedMetadata = async (url: string, ext: string, signal: AbortSignal): Promise<EmbeddedMetadata> => {
  if (ext !== "mp3" && ext !== "flac") return {};
  const res = await fetch(url, { headers: { Range: "bytes=0-2097151" }, signal });
  if (!res.ok && res.status !== 206) return {};
  const bytes = new Uint8Array(await res.arrayBuffer());
  return ext === "mp3" ? parseMp3Id3(bytes) : parseFlacMetadata(bytes);
};

export default function AudioPreviewPlayer({
  name,
  keyPath,
  url,
  size,
  siblingFiles = [],
  onSelectTrack,
  onDownload,
  resolveRelatedUrl,
}: AudioPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricViewportRef = useRef<HTMLDivElement | null>(null);
  const lyricRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string>();
  const [lyricsText, setLyricsText] = useState("");
  const [assetLoading, setAssetLoading] = useState(false);
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [lyricTranslateY, setLyricTranslateY] = useState(0);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("loading");

  const ext = getFileExt(name);
  const baseName = getBaseName(name);
  const lyricLines = useMemo(() => parseLrc(lyricsText), [lyricsText]);
  const activeLyricIndex = useMemo(() => {
    if (!lyricLines.length) return -1;
    let index = 0;
    for (let i = 0; i < lyricLines.length; i += 1) {
      if (lyricLines[i].time <= currentTime + 0.15) index = i;
      else break;
    }
    return index;
  }, [currentTime, lyricLines]);

  const tracks = useMemo(
    () => siblingFiles.filter((file) => isBrowserPlayableAudioExt(getFileExt(file.name))),
    [siblingFiles],
  );
  const currentTrackIndex = tracks.findIndex((file) => (file.storageKey || file.key) === keyPath || file.key === keyPath);
  const previousTrack = currentTrackIndex > 0 ? tracks[currentTrackIndex - 1] : undefined;
  const nextTrack = currentTrackIndex >= 0 && currentTrackIndex < tracks.length - 1 ? tracks[currentTrackIndex + 1] : undefined;
  const estimatedBitrate = size && duration ? Math.round((size * 8) / duration / 1000) : undefined;
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const volumeProgress = (muted ? 0 : volume) * 100;
  const volumePercentLabel = `${Math.round(volumeProgress)}%`;
  const progressRangeStyle = { "--r2-range-progress": `${progress}%` } as CSSProperties;
  const volumeRangeStyle = { "--r2-range-progress": `${volumeProgress}%` } as CSSProperties;
  const lyricTrackStyle = { transform: `translate3d(0, ${lyricTranslateY}px, 0)` } as CSSProperties;
  const waveBars = useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => {
        const base = 16 + ((index * 17) % 28);
        const phase = currentTime * (7.5 + (index % 4) * 0.45) + index * 0.72;
        const pulse = playing ? (Math.sin(phase) + 1) / 2 : 0.18 + ((index * 11) % 20) / 100;
        return {
          height: Math.round(base + pulse * (22 + ((index * 5) % 18))),
          opacity: playing ? 0.58 + pulse * 0.38 : 0.36,
        };
      }),
    [currentTime, playing],
  );
  const playbackStatusLabel =
    playbackStatus === "loading"
      ? "正在加载..."
      : playbackStatus === "playing"
        ? "正在播放"
        : playbackStatus === "paused"
          ? "暂停播放"
          : playbackStatus === "ended"
            ? "播放完毕"
            : "准备播放";

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setCoverUrl(undefined);
    setLyricsText("");
    setCoverFailed(false);
    setLyricTranslateY(0);
    setPlaybackStatus("loading");
  }, [keyPath, url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime || 0);
    const updateDuration = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setPlaybackStatus((current) => (current === "loading" ? "ready" : current));
    };
    const onLoadStart = () => setPlaybackStatus("loading");
    const onCanPlay = () => setPlaybackStatus((current) => (current === "loading" ? (audio.paused ? "ready" : "playing") : current));
    const onWaiting = () => setPlaybackStatus("loading");
    const onPlay = () => {
      setPlaying(true);
      setPlaybackStatus("playing");
    };
    const onPause = () => {
      setPlaying(false);
      setPlaybackStatus(audio.ended ? "ended" : audio.currentTime > 0 ? "paused" : "ready");
    };
    const onEnded = () => {
      setPlaying(false);
      setPlaybackStatus("ended");
    };
    audio.addEventListener("loadstart", onLoadStart);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadstart", onLoadStart);
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [url]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime || 0);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const updatePosition = () => {
      const viewport = lyricViewportRef.current;
      const node = lyricRefs.current[activeLyricIndex];
      if (!viewport || !node) {
        setLyricTranslateY(0);
        return;
      }
      setLyricTranslateY(viewport.clientHeight / 2 - node.offsetTop - node.clientHeight / 2);
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [activeLyricIndex, lyricLines.length]);

  useEffect(() => {
    if (!resolveRelatedUrl) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setAssetLoading(true);

    const load = async () => {
      try {
        const embedded = await readEmbeddedMetadata(url, ext, controller.signal).catch<EmbeddedMetadata>(() => ({}));
        if (controller.signal.aborted) return;
        objectUrl = embedded.coverObjectUrl;
        if (embedded.coverUrl) setCoverUrl(embedded.coverUrl);
        if (embedded.lyrics) setLyricsText(embedded.lyrics);

        if (!embedded.coverUrl) {
          const cover = await resolveRelatedUrl([
            `${baseName}.jpg`,
            `${baseName}.jpeg`,
            `${baseName}.png`,
            "cover.jpg",
            "cover.jpeg",
            "cover.png",
            "folder.jpg",
            "folder.jpeg",
            "folder.png",
          ]);
          if (!controller.signal.aborted && cover) setCoverUrl(cover);
        }

        if (!embedded.lyrics) {
          const lrcUrl = await resolveRelatedUrl([`${baseName}.lrc`]);
          if (!controller.signal.aborted && lrcUrl) {
            const res = await fetch(lrcUrl, { signal: controller.signal });
            if (res.ok) setLyricsText(await res.text());
          }
        }
      } finally {
        if (!controller.signal.aborted) setAssetLoading(false);
      }
    };

    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [baseName, ext, resolveRelatedUrl, url]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play();
    else audio.pause();
  };

  const seekToPercent = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = (value / 100) * duration;
    setCurrentTime(audio.currentTime);
  };

  const summaryParts = [
    ext ? ext.toUpperCase() : "AUDIO",
    size !== undefined ? formatSize(size) : undefined,
    formatDuration(duration),
    estimatedBitrate ? `${estimatedBitrate}kbps` : undefined,
  ].filter(Boolean);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#eef4fb] text-slate-950 dark:bg-[#0a101b] dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {coverUrl && !coverFailed ? (
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full scale-110 object-cover opacity-25 blur-3xl saturate-125 dark:opacity-30"
            draggable={false}
          />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.18),transparent_32%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(226,232,240,0.88)_48%,rgba(203,213,225,0.70))] dark:bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.88)_55%,rgba(15,23,42,0.96))]" />
      </div>
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />

      <div className="relative min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid h-full max-w-6xl min-h-0 grid-cols-1 gap-5 overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)] md:gap-12 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-16">
          <div className="flex min-h-0 flex-col items-center justify-center overflow-hidden md:items-start">
            <div className="mb-5 min-w-0 text-left">
              <div className="max-w-[18rem] truncate text-xl font-semibold tracking-normal text-slate-950 dark:text-white sm:text-2xl" title={name}>
                {name}
              </div>
              <div className="mt-2 flex max-w-[18rem] flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                {summaryParts.map((part, index) => (
                  <span key={`${part}-${index}`} className="inline-flex items-center gap-2">
                    {index > 0 ? <span className="h-1 w-1 rounded-full bg-current opacity-45" aria-hidden="true" /> : null}
                    <span>{part}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="relative aspect-square w-44 max-w-[58vw] overflow-hidden rounded-md bg-slate-200 shadow-[0_8px_22px_rgba(37,99,235,0.16),0_0_24px_rgba(59,130,246,0.10)] dark:bg-slate-800 dark:shadow-[0_8px_24px_rgba(37,99,235,0.14),0_0_28px_rgba(96,165,250,0.08)] sm:w-56 md:w-64 lg:w-72">
              <div className="pointer-events-none absolute inset-0 z-10 ring-1 ring-white/35 dark:ring-white/10" />
              {coverUrl && !coverFailed ? (
                <img
                  src={coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-white to-blue-100 dark:from-slate-800 dark:via-slate-900 dark:to-blue-950/50">
                  <img src={getFileIconSrc("file", name)} alt="" aria-hidden="true" className="h-24 w-24 opacity-85" draggable={false} />
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              {lyricLines.length ? (
                <div
                  ref={lyricViewportRef}
                  className="relative h-full overflow-hidden px-1 text-center"
                >
                  <div
                    className="py-[34vh] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
                    style={lyricTrackStyle}
                  >
                    {lyricLines.map((line, index) => (
                      <div
                        key={`${line.time}-${index}`}
                        ref={(node) => {
                          lyricRefs.current[index] = node;
                        }}
                        className={`origin-center py-2 transition-[color,opacity,transform,font-weight,font-size,line-height] duration-500 ease-out ${
                          index === activeLyricIndex
                            ? "scale-[1.03] text-xl font-semibold leading-9 text-blue-600 opacity-100 dark:text-blue-300 sm:text-2xl sm:leading-10"
                            : Math.abs(index - activeLyricIndex) === 1
                              ? "text-lg leading-8 text-slate-600 opacity-62 dark:text-slate-300 sm:text-xl sm:leading-9"
                              : "text-lg leading-8 text-slate-500 opacity-28 dark:text-slate-500 sm:text-xl sm:leading-9"
                        }`}
                      >
                        {line.text}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-1 text-center">
                  <div className="mb-8 flex h-16 items-end gap-1.5 text-blue-500/80 dark:text-blue-300/80" aria-hidden="true">
                    {waveBars.map((bar, index) => (
                      <span
                        key={index}
                        className="w-1 rounded-full bg-current transition-[height,opacity] duration-150 ease-out"
                        style={{
                          height: `${bar.height}px`,
                          opacity: bar.opacity,
                        }}
                      />
                    ))}
                  </div>
                  <Music className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                  <div className="mt-4 text-2xl font-semibold text-slate-800 dark:text-slate-100">暂无歌词</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {assetLoading ? "正在查找内嵌歌词和同目录 LRC 文件" : "未找到内嵌歌词或同名 .lrc 文件"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative shrink-0 bg-white/72 px-3 pb-3 pt-2 shadow-[0_-12px_36px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:bg-slate-950/58 dark:shadow-[0_-12px_36px_rgba(0,0,0,0.28)] sm:px-5">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            <span className="w-11 text-right">{formatDuration(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={(event) => seekToPercent(Number(event.currentTarget.value))}
              className="r2-audio-range min-w-0 flex-1"
              style={progressRangeStyle}
              aria-label="播放进度"
            />
            <span className="w-11">{formatDuration(duration)}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-between">
            <div className="hidden min-w-0 flex-1 text-xs font-medium text-slate-500 dark:text-slate-400 sm:block">
              <span className="truncate">{playbackStatusLabel}</span>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              <button
                type="button"
                onClick={() => previousTrack && void onSelectTrack?.(previousTrack)}
                disabled={!previousTrack || !onSelectTrack}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/80 hover:text-blue-600 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-blue-300"
                title="上一首"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void togglePlay()}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-[0_12px_26px_rgba(37,99,235,0.28)] transition hover:scale-[1.035] hover:from-blue-500 hover:to-blue-600 active:scale-95 dark:from-blue-400 dark:to-blue-600 dark:shadow-blue-500/20"
                title={playing ? "暂停" : "播放"}
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-px" />}
              </button>
              <button
                type="button"
                onClick={() => nextTrack && void onSelectTrack?.(nextTrack)}
                disabled={!nextTrack || !onSelectTrack}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/80 hover:text-blue-600 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-blue-300"
                title="下一首"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2.5">
              <div className="group/volume hidden h-11 items-center gap-1 rounded-full px-2.5 text-slate-500 transition hover:bg-white/90 hover:text-blue-600 hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)] focus-within:bg-white/90 focus-within:text-blue-600 focus-within:shadow-[0_8px_24px_rgba(15,23,42,0.10)] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-blue-300 dark:focus-within:bg-white/10 dark:focus-within:text-blue-300 sm:flex">
                <button
                  type="button"
                  onClick={() => setMuted((value) => !value)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full p-0 transition"
                  title={muted ? "取消静音" : "静音"}
                >
                  {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover/volume:max-w-10 group-hover/volume:opacity-100 group-focus-within/volume:max-w-10 group-focus-within/volume:opacity-100">
                    音量
                  </span>
                </button>
                <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold tabular-nums text-slate-400 opacity-0 transition-all duration-200 group-hover/volume:max-w-9 group-hover/volume:opacity-100 group-focus-within/volume:max-w-9 group-focus-within/volume:opacity-100 dark:text-slate-500">
                  {volumePercentLabel}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    setVolume(next);
                    setMuted(next === 0);
                  }}
                  className="r2-audio-volume-range w-0 opacity-0 transition-all duration-200 group-hover/volume:w-20 group-hover/volume:opacity-100 group-focus-within/volume:w-20 group-focus-within/volume:opacity-100"
                  style={volumeRangeStyle}
                  aria-label={`音量 ${volumePercentLabel}`}
                />
              </div>
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                className="inline-flex h-10 items-center justify-center rounded-full px-2.5 text-slate-500 transition hover:bg-white/80 hover:text-blue-600 hover:shadow-sm dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-blue-300 sm:hidden"
                title={muted ? "取消静音" : "静音"}
              >
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => void onDownload?.()}
                disabled={!onDownload}
                className="group inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-slate-600 transition hover:bg-white/80 hover:px-3 hover:text-blue-600 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-blue-300"
                title="下载"
              >
                <Download className="h-5 w-5" />
                <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover:max-w-10 group-hover:opacity-100">下载</span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLocalMenuOpen((value) => !value)}
                  className="group inline-flex h-10 items-center gap-1.5 rounded-full px-2.5 text-slate-600 transition hover:bg-white/80 hover:px-3 hover:text-blue-600 hover:shadow-sm dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-blue-300"
                  title="使用本地播放器打开"
                  aria-expanded={localMenuOpen}
                >
                  <Laptop className="h-5 w-5" />
                  <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover:max-w-10 group-hover:opacity-100">打开</span>
                </button>
                {localMenuOpen ? (
                  <div className="absolute bottom-[calc(100%+0.45rem)] right-0 z-20 w-36 overflow-hidden rounded-md bg-white/95 py-1 text-sm shadow-xl ring-1 ring-slate-200 backdrop-blur dark:bg-slate-900/95 dark:ring-slate-700">
                    {LOCAL_PLAYERS.map((player) => (
                      <button
                        key={player.key}
                        type="button"
                        onClick={() => {
                          openWithLocalApp(player.key, url);
                          setLocalMenuOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                      >
                        {player.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
