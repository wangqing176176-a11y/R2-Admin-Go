"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ChevronDown,
  LoaderCircle,
  MessageSquareQuote,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { isBrowserPlayableAudioExt } from "@/lib/media-preview";
import playbackSettingsStyles from "./AudioPlaybackSettings.module.css";

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
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "--:--";
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
  resolveRelatedUrl,
}: AudioPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricViewportRef = useRef<HTMLElement | null>(null);
  const lyricRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const titleViewportRef = useRef<HTMLDivElement | null>(null);
  const titleTextRef = useRef<HTMLSpanElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showLyrics, setShowLyrics] = useState(true);
  const [playbackError, setPlaybackError] = useState("");
  const [coverUrl, setCoverUrl] = useState<string>();
  const [lyricsText, setLyricsText] = useState("");
  const [assetLoading, setAssetLoading] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [lyricTranslateY, setLyricTranslateY] = useState(0);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("loading");
  const [titleScrollable, setTitleScrollable] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [mobileLyricsOpen, setMobileLyricsOpen] = useState(false);
  const [playbackSettingsOpen, setPlaybackSettingsOpen] = useState(false);

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
  const lyricsVisible = lyricLines.length > 0 && (compactLayout ? mobileLyricsOpen : showLyrics);
  const artworkCanOpenLyrics = compactLayout && lyricLines.length > 0;

  useEffect(() => {
    const viewport = titleViewportRef.current;
    const text = titleTextRef.current;
    if (!viewport || !text) return;

    const measure = () => {
      setTitleScrollable(text.scrollWidth > viewport.clientWidth + 2);
    };

    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    observer?.observe(text);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [name]);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setCoverUrl(undefined);
    setLyricsText("");
    setCoverFailed(false);
    setLyricTranslateY(0);
    setPlaybackStatus("loading");
    setPlaybackError("");
  }, [keyPath, url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume, url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
    // Speed changes should not change the singer's pitch.
    audio.preservesPitch = true;
  }, [playbackRate, url]);

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
      setPlaybackError("");
    };
    const onPause = () => {
      setPlaying(false);
      setPlaybackStatus(audio.ended ? "ended" : audio.currentTime > 0 ? "paused" : "ready");
    };
    const onEnded = () => {
      setPlaying(false);
      setPlaybackStatus("ended");
    };
    const onError = () => {
      setPlaying(false);
      setPlaybackStatus("paused");
      setPlaybackError("音频加载失败，请关闭预览后重试");
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
    audio.addEventListener("error", onError);
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
      audio.removeEventListener("error", onError);
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
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePosition) : null;
    if (lyricViewportRef.current) observer?.observe(lyricViewportRef.current);
    const activeLine = lyricRefs.current[activeLyricIndex];
    if (activeLine) observer?.observe(activeLine);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [activeLyricIndex, lyricLines.length, lyricsVisible]);

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

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const updateLayout = () => setCompactLayout(player.clientWidth <= 720);
    updateLayout();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateLayout) : null;
    observer?.observe(player);
    window.addEventListener("resize", updateLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPlaying(false);
      setPlaybackStatus("paused");
      setPlaybackError("暂时无法播放，请重试");
    }
  };

  const seekToPercent = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = (Math.min(100, Math.max(0, value)) / 100) * duration;
    setCurrentTime(audio.currentTime);
  };

  const summaryParts = [
    ext ? ext.toUpperCase() : "AUDIO",
    size !== undefined ? formatSize(size) : undefined,
    estimatedBitrate ? `${estimatedBitrate}kbps` : undefined,
  ].filter(Boolean);

  return (
    <div ref={playerRef} className="r2-audio-player h-full min-h-0" aria-label={`音乐播放器：${name}`}>
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <div className={`r2-audio-layout ${lyricsVisible ? "has-lyrics" : ""} ${compactLayout && lyricsVisible ? "mobile-lyrics-open" : ""}`}>
        <section className="r2-audio-now-playing" aria-label="正在播放">
          <div
            className="r2-audio-artwork"
            role={artworkCanOpenLyrics ? "button" : undefined}
            tabIndex={artworkCanOpenLyrics ? 0 : undefined}
            aria-label={artworkCanOpenLyrics ? "显示歌词" : undefined}
            onClick={() => {
              if (artworkCanOpenLyrics) setMobileLyricsOpen(true);
            }}
            onKeyDown={(event) => {
              if (!artworkCanOpenLyrics || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              setMobileLyricsOpen(true);
            }}
          >
            {coverUrl && !coverFailed ? (
              <img
                src={coverUrl}
                alt={`${baseName} 封面`}
                className="h-full w-full object-cover"
                draggable={false}
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <div className="r2-audio-artwork-placeholder" aria-hidden="true">
                <Music strokeWidth={1.25} />
              </div>
            )}
          </div>

          <div className="r2-audio-track-info">
            <div
              ref={titleViewportRef}
              className={`r2-audio-title-marquee r2-audio-track-title ${titleScrollable ? "is-scrolling" : ""}`}
              title={name}
            >
              <span className="r2-audio-title-track">
                <span ref={titleTextRef} className="r2-audio-title-text">{baseName}</span>
                <span className="r2-audio-title-text" aria-hidden="true">{baseName}</span>
              </span>
            </div>
            <div className="r2-audio-track-meta">{summaryParts.join(" · ")}</div>
          </div>

          <div className="r2-audio-timeline">
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={(event) => seekToPercent(Number(event.currentTarget.value))}
              disabled={!duration}
              className="r2-audio-range w-full"
              style={progressRangeStyle}
              aria-label="播放进度"
              aria-valuetext={`${formatDuration(currentTime)} / ${formatDuration(duration)}`}
            />
            <div className="r2-audio-times">
              <span>{formatDuration(currentTime)}</span>
              <span>{duration > 0 ? `−${formatDuration(Math.max(0, duration - currentTime))}` : "--:--"}</span>
            </div>
          </div>

          <div className="r2-audio-controls">
            <div className="r2-audio-control-row">
              <div className="r2-audio-transport">
                <button
                  type="button"
                  onClick={() => previousTrack && void onSelectTrack?.(previousTrack)}
                  disabled={!previousTrack || !onSelectTrack}
                  className="r2-audio-icon-button"
                  aria-label="上一首"
                  title="上一首"
                >
                  <SkipBack className="h-6 w-6" fill="currentColor" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  className="r2-audio-icon-button r2-audio-play-button"
                  aria-label={playing ? "暂停" : "播放"}
                  title={playing ? "暂停" : "播放"}
                  aria-busy={playbackStatus === "loading"}
                >
                  {playbackStatus === "loading" && !playbackError ? (
                    <LoaderCircle className="r2-audio-loading-icon h-8 w-8" strokeWidth={1.5} />
                  ) : playing ? (
                    <Pause className="h-9 w-9" fill="currentColor" strokeWidth={1} />
                  ) : (
                    <Play className="h-9 w-9 translate-x-0.5" fill="currentColor" strokeWidth={1} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => nextTrack && void onSelectTrack?.(nextTrack)}
                  disabled={!nextTrack || !onSelectTrack}
                  className="r2-audio-icon-button"
                  aria-label="下一首"
                  title="下一首"
                >
                  <SkipForward className="h-6 w-6" fill="currentColor" strokeWidth={1.5} />
                </button>
              </div>

              {!compactLayout ? <div
                className={`r2-audio-playback-settings ${playbackSettingsStyles.settings}`}
                onMouseEnter={() => setPlaybackSettingsOpen(true)}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement)) setPlaybackSettingsOpen(false);
                }}
                onFocus={() => setPlaybackSettingsOpen(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setPlaybackSettingsOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.stopPropagation();
                  event.currentTarget.querySelector<HTMLButtonElement>(".r2-audio-settings-trigger")?.focus();
                  setPlaybackSettingsOpen(false);
                }}
              >
                <button
                  type="button"
                  className={`r2-audio-settings-trigger ${playbackSettingsStyles.trigger}`}
                  aria-label={`音量与倍速，音量 ${volumePercentLabel}，${playbackRate} 倍速`}
                  aria-haspopup="dialog"
                  aria-expanded={playbackSettingsOpen}
                  onClick={() => setPlaybackSettingsOpen(true)}
                >
                  {muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                  <span>{playbackRate}×</span>
                </button>
                {playbackSettingsOpen ? <div className={`r2-audio-settings-popover ${playbackSettingsStyles.popover}`}>
                  <div className={`r2-audio-settings-panel ${playbackSettingsStyles.panel}`} role="dialog" aria-label="音量与倍速">
                    <div className={`r2-audio-settings-heading ${playbackSettingsStyles.heading}`}>
                      <span>音量</span>
                      <span>{volumePercentLabel}</span>
                    </div>
                    <div className={`r2-audio-settings-volume ${playbackSettingsStyles.volume}`}>
                      <button
                        type="button"
                        className="r2-audio-icon-button"
                        aria-label={muted ? "取消静音" : "静音"}
                        onClick={() => setMuted((value) => !value)}
                      >
                        {muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                      </button>
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
                        className="r2-audio-volume-range"
                        style={volumeRangeStyle}
                        aria-label="音量"
                        aria-valuetext={volumePercentLabel}
                      />
                    </div>
                    <label className={`r2-audio-settings-speed ${playbackSettingsStyles.speed}`}>
                      <span>倍速</span>
                      <span className={`r2-audio-speed ${playbackSettingsStyles.speedPicker}`}>
                        <select
                          aria-label="播放速度"
                          value={playbackRate}
                          onChange={(event) => setPlaybackRate(Number(event.currentTarget.value))}
                        >
                          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                            <option key={rate} value={rate}>{rate}×</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none h-3 w-3" aria-hidden="true" />
                      </span>
                    </label>
                  </div>
                </div> : null}
              </div> : null}

              <div className="r2-audio-tools">
                {compactLayout ? <label className="r2-audio-speed" title="播放速度">
                  <select
                    aria-label="播放速度"
                    value={playbackRate}
                    onChange={(event) => setPlaybackRate(Number(event.currentTarget.value))}
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                      <option key={rate} value={rate}>{rate}×</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none h-3 w-3" aria-hidden="true" />
                </label> : null}
                <button
                  type="button"
                  className="r2-audio-icon-button r2-audio-lyrics-toggle"
                  disabled={!lyricLines.length}
                  aria-label={assetLoading && !lyricLines.length ? "歌词加载中" : !lyricLines.length ? "暂无歌词" : lyricsVisible ? "隐藏歌词" : "显示歌词"}
                  title={assetLoading && !lyricLines.length ? "歌词加载中" : !lyricLines.length ? "暂无歌词" : lyricsVisible ? "隐藏歌词" : "显示歌词"}
                  aria-pressed={lyricsVisible}
                  onClick={() => compactLayout ? setMobileLyricsOpen((value) => !value) : setShowLyrics((value) => !value)}
                >
                  <MessageSquareQuote className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
                {compactLayout ? <div className="r2-audio-volume">
                  <button
                    type="button"
                    onClick={() => setMuted((value) => !value)}
                    className="r2-audio-icon-button"
                    aria-label={muted ? "取消静音" : "静音"}
                    title={muted ? "取消静音" : "静音"}
                  >
                    {muted || volume === 0 ? <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.5} /> : <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  </button>
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
                    className="r2-audio-volume-range"
                    style={volumeRangeStyle}
                    aria-label="音量"
                    aria-valuetext={volumePercentLabel}
                  />
                </div> : null}
              </div>
            </div>
          </div>
          {playbackError ? <p role="alert" className="r2-audio-error">{playbackError}</p> : null}
        </section>

        {lyricsVisible ? (
          <section
            ref={lyricViewportRef}
            className="r2-audio-lyrics"
            aria-label="歌词"
            onClick={() => {
              if (compactLayout) setMobileLyricsOpen(false);
            }}
          >
            <div className="r2-audio-lyric-track" style={lyricTrackStyle}>
              {lyricLines.map((line, index) => (
                <button
                  type="button"
                  key={`${line.time}-${index}`}
                  ref={(node) => { lyricRefs.current[index] = node; }}
                  className={`r2-audio-lyric-line ${index === activeLyricIndex ? "is-active" : ""}`}
                  aria-current={index === activeLyricIndex ? "true" : undefined}
                  aria-label={compactLayout ? `${line.text.trim() || "间奏"}，返回歌曲海报` : `${line.text.trim() || "间奏"}，跳转到 ${formatDuration(line.time)}`}
                  onClick={() => {
                    if (!compactLayout && duration > 0) seekToPercent((line.time / duration) * 100);
                  }}
                >
                  {line.text.trim() || "···"}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
