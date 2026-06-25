export const BROWSER_VIDEO_PREVIEW_EXTS = new Set(["mp4", "webm", "m4v"]);

export const BROWSER_AUDIO_PREVIEW_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);

export const LOCAL_VIDEO_OPEN_EXTS = new Set([
  "mkv",
  "avi",
  "rmvb",
  "flv",
  "wmv",
  "ts",
  "m2ts",
  "mts",
  "vob",
  "mov",
  "3gp",
  "3g2",
  "asf",
  "divx",
  "f4v",
  "ogv",
]);

export const LOCAL_AUDIO_OPEN_EXTS = new Set([
  "wma",
  "ape",
  "amr",
  "aif",
  "aiff",
  "alac",
  "opus",
  "ac3",
  "dts",
  "mka",
]);

export const LOCAL_MEDIA_OPEN_EXTS = new Set([...LOCAL_VIDEO_OPEN_EXTS, ...LOCAL_AUDIO_OPEN_EXTS]);

export const isBrowserPlayableVideoExt = (ext: string) => BROWSER_VIDEO_PREVIEW_EXTS.has(ext.toLowerCase());

export const isBrowserPlayableAudioExt = (ext: string) => BROWSER_AUDIO_PREVIEW_EXTS.has(ext.toLowerCase());

export const isLocalVideoOpenExt = (ext: string) => LOCAL_VIDEO_OPEN_EXTS.has(ext.toLowerCase());

export const isLocalAudioOpenExt = (ext: string) => LOCAL_AUDIO_OPEN_EXTS.has(ext.toLowerCase());

export const isLocalMediaOpenExt = (ext: string) => LOCAL_MEDIA_OPEN_EXTS.has(ext.toLowerCase());
