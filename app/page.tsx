"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Modal from "@/components/Modal";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { LEGAL_DOCS, LEGAL_TAB_LABELS, LEGAL_TAB_ORDER, type LegalTabKey } from "@/lib/legal-docs";
import { 
  Folder, Trash2, Upload, RefreshCw, 
  ChevronRight, Search,
  Menu, Sun, Moon, Monitor, ChevronDown,
  FileText, Image as ImageIcon, Music, Video, Edit2,
  FileArchive, FileCode, FileSpreadsheet, FileType, FileJson,
  LogOut, ShieldCheck, Eye, EyeOff,
  Download, Link2, Copy, ArrowRightLeft, FolderOpen, X,
  Pause, Play, CircleX,
  Globe, BadgeInfo, Mail, BookOpen,
  FolderPlus, UserCircle2,
  HardDrive, ArrowUpDown,
} from "lucide-react";

type ThemeMode = "system" | "light" | "dark";

const THEME_STORE_KEY = "r2_admin_theme_v1";
const OTP_RESEND_COOLDOWN_MS = 60_000;

type ToastKind = "success" | "error" | "info";
type ToastPayload = { kind: ToastKind; message: string; detail?: string };
type ToastState = ToastPayload | string | null;

const normalizeToast = (t: ToastState): ToastPayload | null => {
  if (!t) return null;
  if (typeof t === "string") {
    const msg = t.trim();
    const kind: ToastKind =
      /失败|错误|异常/.test(msg) ? "error" : /成功|已/.test(msg) ? "success" : "info";
    return { kind, message: msg };
  }
  return t;
};

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
};

const BrandMark = ({ className }: { className?: string }) => {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src="/brand.png"
        alt=""
        aria-hidden="true"
        className={["block object-contain", className].filter(Boolean).join(" ")}
        onError={() => setFailed(true)}
        draggable={false}
      />
    );
  }

  return (
    <div aria-hidden="true" className={className} />
  );
};

const WifiMark = ({ className }: { className?: string }) => {
  return (
    <span
      className={["inline-block bg-current", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      style={{
        WebkitMaskImage: "url(/Wi-Fi.svg)",
        maskImage: "url(/Wi-Fi.svg)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
};

const LoaderOrbit = ({ className }: { className?: string }) => {
  return <span aria-hidden="true" className={["r2-loader-orbit", className].filter(Boolean).join(" ")} />;
};

const LoaderDots = ({ className }: { className?: string }) => {
  return (
    <span aria-hidden="true" className={["r2-loader-dots", className].filter(Boolean).join(" ")}>
      {Array.from({ length: 3 }).map((_, idx) => (
        <span key={idx} style={{ animationDelay: `${idx * 0.16}s` }} />
      ))}
    </span>
  );
};

const FileListSkeleton = () => {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={`skeleton-${idx}`}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded-md r2-skeleton-shimmer" />
            <div className="h-3.5 rounded-md r2-skeleton-shimmer" style={{ width: `${36 + (idx % 5) * 10}%` }} />
            <div className="ml-auto hidden h-3.5 w-16 rounded-md r2-skeleton-shimmer md:block" />
            <div className="hidden h-3.5 w-20 rounded-md r2-skeleton-shimmer md:block" />
          </div>
        </div>
      ))}
    </div>
  );
};

const BucketHintChip = ({
  bucketName,
  disabled,
  onClick,
  className,
}: {
  bucketName: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={bucketName}
      aria-label="查看当前存储桶"
      className={[
        "inline-flex items-center gap-2 px-1 py-1 rounded-md text-left",
        "transition-colors hover:text-gray-700 dark:hover:text-gray-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-inherit",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <HardDrive
        className="w-5 h-5 text-gray-500 shrink-0 dark:text-gray-300"
        strokeWidth={1.75}
      />
      <div className="min-w-0">
        <div className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">当前桶</div>
        <div className="mt-0.5 text-[11px] leading-tight font-normal text-blue-600 truncate max-w-[10.5rem] md:max-w-[16rem] dark:text-blue-300">
          {bucketName}
        </div>
      </div>
    </button>
  );
};

// --- 类型定义 ---
type Bucket = {
  id: string;
  Name: string;
  CreationDate: string;
  transferMode?: "presigned" | "proxy" | "presigned_needs_bucket_name";
  bucketName?: string;
  accountId?: string;
  isDefault?: boolean;
  publicBaseUrl?: string;
  customBaseUrl?: string;
};
type FileItem = {
  name: string;
  key: string;
  type: "folder" | "file";
  size?: number;
  lastModified?: string;
};
type FileSortKey = "name" | "size" | "type" | "time";
type FileSortDirection = "asc" | "desc";
type AppSession = {
  accessToken: string;
  refreshToken: string;
  userId?: string;
  email?: string;
};
type RecoverySession = {
  accessToken: string;
  refreshToken: string;
};
type BucketUsage = {
  bucket: string;
  prefix: string;
  objects: number;
  bytes: number;
  pagesScanned: number;
  truncated: boolean;
};
type LinkConfig = {
  publicBaseUrl?: string;
  customBaseUrl?: string;
  s3BucketName?: string;
};
type LinkConfigMap = Record<string, LinkConfig>;
type S3BucketNameCheck = {
  bucketName: string;
  ok: boolean;
  hint?: string;
  checkedAt: number;
};
type S3BucketNameCheckMap = Record<string, S3BucketNameCheck>;
type TransferModeOverride = "auto" | "presigned" | "proxy";
type TransferModeOverrideMap = Record<string, TransferModeOverride>;
type BucketFormState = {
  bucketLabel: string;
  bucketName: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  customBaseUrl: string;
};
type BucketFormErrors = {
  bucketName?: string;
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};
type PreviewState =
  | null
  | {
      name: string;
      key: string;
      bucket: string;
      kind: "image" | "video" | "audio" | "text" | "pdf" | "office" | "other";
      url: string;
      text?: string;
    };
type PreviewKind = NonNullable<PreviewState>["kind"];

type UploadStatus = "queued" | "uploading" | "paused" | "done" | "error" | "canceled";
type MultipartUploadState = {
  uploadId: string;
  partSize: number;
  parts: Record<string, string>; // partNumber -> etag
};
type UploadTask = {
  id: string;
  bucket: string;
  file: File;
  key: string;
  resumeKey?: string;
  multipart?: MultipartUploadState;
  startedAt?: number;
  loaded: number;
  speedBps: number;
  status: UploadStatus;
  error?: string;
};

// --- 辅助函数 ---
const toFiniteNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return "-";
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const LOGIN_PAGE = {
  title: "R2 Admin Go",
  subtitle: "R2对象存储多功能管理工具",
  advantages: [
    "支持图片、视频、音频、文档、代码等文件预览",
    "不限速下载与上传大文件、重命名、移动复制、删除等文件操作",
    "一个账号可以保存并管理多个 Cloudflare 账号的 R2 存储桶配置",
  ],
  announcementTitle: "公告",
  announcementText: `欢迎使用
  
- 请妥善保管账号与密码，避免泄露。
- 如遇异常，请先刷新页面或重新登录后重试。
`,
  footer: "By Wang Qing",
};

const LOGIN_LINKS = [
  { label: "我的博客", href: "https://qinghub.top", icon: "globe" as const },
  { label: "使用教程", href: "https://github.com/wangqing176176-a11y/qing-r2-cloudy", icon: "book" as const },
  { label: "关于页面", href: "https://qinghub.top/about/", icon: "about" as const },
  { label: "电子邮箱", href: "mailto:wangqing176176@gmail.com", icon: "mail" as const },
] as const;

type MultipartResumeRecord = {
  bucket: string;
  key: string;
  size: number;
  lastModified: number;
  name: string;
  uploadId: string;
  partSize: number;
  parts: Record<string, string>; // partNumber -> etag
};

const RESUME_STORE_KEY = "r2_multipart_resume_v1";
const SESSION_STORE_KEY = "r2_supabase_session_v1";
const SESSION_STORE_KEY_EPHEMERAL = "r2_supabase_session_tmp_v1";

const getResumeKey = (bucket: string, key: string, file: File) =>
  `${bucket}|${key}|${file.size}|${file.lastModified}`;

const loadResumeStore = (): Record<string, MultipartResumeRecord> => {
  try {
    const raw = localStorage.getItem(RESUME_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MultipartResumeRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveResumeStore = (next: Record<string, MultipartResumeRecord>) => {
  localStorage.setItem(RESUME_STORE_KEY, JSON.stringify(next));
};

const loadResumeRecord = (resumeKey: string): MultipartResumeRecord | null => {
  const store = loadResumeStore();
  const rec = store[resumeKey];
  return rec && typeof rec === "object" ? rec : null;
};

const upsertResumeRecord = (resumeKey: string, rec: MultipartResumeRecord) => {
  const store = loadResumeStore();
  store[resumeKey] = rec;
  saveResumeStore(store);
};

const deleteResumeRecord = (resumeKey: string) => {
  const store = loadResumeStore();
  if (!(resumeKey in store)) return;
  delete store[resumeKey];
  saveResumeStore(store);
};

type FileSortOption = {
  key: FileSortKey;
  direction: FileSortDirection;
  label: string;
};

const FILE_SORT_GROUPS: FileSortOption[][] = [
  [
    { key: "time", direction: "desc", label: "时间（最新）" },
    { key: "time", direction: "asc", label: "时间（最早）" },
  ],
  [
    { key: "name", direction: "asc", label: "名称（A-Z）" },
    { key: "name", direction: "desc", label: "名称（Z-A）" },
  ],
  [
    { key: "size", direction: "asc", label: "大小（小-大）" },
    { key: "size", direction: "desc", label: "大小（大-小）" },
  ],
  [
    { key: "type", direction: "asc", label: "类型（A-Z）" },
    { key: "type", direction: "desc", label: "类型（Z-A）" },
  ],
];

const getFileSortLabel = (key: FileSortKey, direction: FileSortDirection) => {
  if (key === "time") return direction === "desc" ? "时间（最新）" : "时间（最早）";
  if (key === "size") return direction === "asc" ? "大小（小-大）" : "大小（大-小）";
  if (key === "type") return direction === "asc" ? "类型（A-Z）" : "类型（Z-A）";
  return direction === "asc" ? "名称（A-Z）" : "名称（Z-A）";
};

const SortControl = ({
  disabled,
  sortKey,
  sortDirection,
  onChange,
  compact = false,
}: {
  disabled: boolean;
  sortKey: FileSortKey;
  sortDirection: FileSortDirection;
  onChange: (key: FileSortKey, direction: FileSortDirection) => void;
  compact?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentLabel = getFileSortLabel(sortKey, sortDirection);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current && rootRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const tone = compact ? "text-gray-600 dark:text-gray-200" : "text-gray-500 dark:text-gray-300";
  const size = compact ? "w-16 h-14" : "w-12 h-14";
  const icon = compact ? "w-5 h-5" : "w-4 h-4";

  return (
    <div ref={rootRef} className={`relative ${size}`}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        disabled={disabled}
        title={`排序：${currentLabel}`}
        aria-label="排序"
        className={`${size} flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
          disabled ? `opacity-50 cursor-not-allowed ${tone}` : `${tone} hover:bg-gray-100 active:scale-95 dark:hover:bg-gray-800`
        }`}
      >
        <ArrowUpDown className={icon} />
        <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">排序</span>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
          <div className="px-4 py-3 text-sm font-semibold text-gray-400 dark:text-gray-500">排序方式</div>
          {FILE_SORT_GROUPS.map((group, groupIndex) => (
            <div
              key={`sort-group-${groupIndex}`}
              className={groupIndex === 0 ? "" : "border-t border-gray-100 dark:border-gray-800"}
            >
              {group.map((opt) => {
                const active = opt.key === sortKey && opt.direction === sortDirection;
                return (
                  <button
                    key={`${opt.key}-${opt.direction}`}
                    type="button"
                    onClick={() => {
                      onChange(opt.key, opt.direction);
                      setOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm leading-none transition-colors ${
                      active
                        ? "text-blue-600 dark:text-blue-300"
                        : "text-slate-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default function R2Admin() {
  // --- 状态管理 ---
  const [auth, setAuth] = useState<AppSession | null>(null);
  const authRef = useRef<AppSession | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [path, setPath] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "connected" | "unbound" | "error">("checking");
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);
  const [fileListError, setFileListError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(true);
  const [bucketUsage, setBucketUsage] = useState<BucketUsage | null>(null);
  const [bucketUsageError, setBucketUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewState>(null);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadQueuePaused, setUploadQueuePaused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<FileItem[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [fileSortKey, setFileSortKey] = useState<FileSortKey>("name");
  const [fileSortDirection, setFileSortDirection] = useState<FileSortDirection>("asc");
  const [linkConfigMap, setLinkConfigMap] = useState<LinkConfigMap>({});
  const [s3BucketNameCheckMap, setS3BucketNameCheckMap] = useState<S3BucketNameCheckMap>({});
  const [transferModeOverrideMap, setTransferModeOverrideMap] = useState<TransferModeOverrideMap>({});

  const [toast, setToast] = useState<ToastState>(null);
  const toastPayload = useMemo(() => normalizeToast(toast), [toast]);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [loginAnnouncementOpen, setLoginAnnouncementOpen] = useState(false);

  const bucketMenuRef = useRef<HTMLDivElement>(null);
  const [bucketMenuOpen, setBucketMenuOpen] = useState(false);

  const transferModeMenuRef = useRef<HTMLDivElement>(null);
  const [transferModeMenuOpen, setTransferModeMenuOpen] = useState(false);

  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [resolvedDark, setResolvedDark] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<"move" | "copy">("move");
  const [moveTarget, setMoveTarget] = useState("");
  const [moveSources, setMoveSources] = useState<string[]>([]);
  const [moveBrowserPath, setMoveBrowserPath] = useState<string[]>([]);
  const [moveBrowserFolders, setMoveBrowserFolders] = useState<FileItem[]>([]);
  const [moveBrowserLoading, setMoveBrowserLoading] = useState(false);
  const [moveBrowserError, setMoveBrowserError] = useState<string | null>(null);

  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPublic, setLinkPublic] = useState("");
  const [linkCustom, setLinkCustom] = useState("");
  const [linkS3BucketName, setLinkS3BucketName] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [bucketHintOpen, setBucketHintOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [addBucketOpen, setAddBucketOpen] = useState(false);
  const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
  const [accountCenterOpen, setAccountCenterOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [bucketDeleteOpen, setBucketDeleteOpen] = useState(false);
  const [bucketDeleteTargetId, setBucketDeleteTargetId] = useState<string | null>(null);

  const uploadTasksRef = useRef<UploadTask[]>([]);
  const uploadProcessingRef = useRef(false);
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  const uploadQueuePausedRef = useRef(false);

  useEffect(() => {
    uploadTasksRef.current = uploadTasks;
  }, [uploadTasks]);

  useEffect(() => {
    uploadQueuePausedRef.current = uploadQueuePaused;
  }, [uploadQueuePaused]);

  // 登录表单状态
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [registerAgree, setRegisterAgree] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalActiveTab, setLegalActiveTab] = useState<LegalTabKey>("terms");
  const [registerNotice, setRegisterNotice] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [registerCodeCooldownUntil, setRegisterCodeCooldownUntil] = useState(0);
  const [authUiNowTs, setAuthUiNowTs] = useState(() => Date.now());
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNotice, setForgotNotice] = useState("");
  const [forgotCodeCooldownUntil, setForgotCodeCooldownUntil] = useState(0);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordConfirmValue, setResetPasswordConfirmValue] = useState("");
  const [recoverySession, setRecoverySession] = useState<RecoverySession | null>(null);
  const [changePasswordValue, setChangePasswordValue] = useState("");
  const [changePasswordConfirmValue, setChangePasswordConfirmValue] = useState("");
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");
  const [showAccountUserId, setShowAccountUserId] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showRegisterSecret, setShowRegisterSecret] = useState(false);

  const [bucketForm, setBucketForm] = useState<BucketFormState>({
    bucketLabel: "",
    bucketName: "",
    accountId: "",
    accessKeyId: "",
    secretAccessKey: "",
    publicBaseUrl: "",
    customBaseUrl: "",
  });
  const [bucketFormErrors, setBucketFormErrors] = useState<BucketFormErrors>({});

  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const supabaseAnonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  ).trim();
  const registerCodeCooldown = Math.max(0, Math.ceil((registerCodeCooldownUntil - authUiNowTs) / 1000));
  const forgotCodeCooldown = Math.max(0, Math.ceil((forgotCodeCooldownUntil - authUiNowTs) / 1000));

  useEffect(() => {
    if (!authRequired) return;
    const now = Date.now();
    const hasCooldown = registerCodeCooldownUntil > now || forgotCodeCooldownUntil > now;
    if (!hasCooldown) return;
    setAuthUiNowTs(now);
    const timer = window.setInterval(() => setAuthUiNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [authRequired, registerCodeCooldownUntil, forgotCodeCooldownUntil]);

  const parseStoredSession = (raw: string | null): AppSession | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AppSession;
      const accessToken = String(parsed?.accessToken ?? "").trim();
      const refreshToken = String(parsed?.refreshToken ?? "").trim();
      if (!accessToken || !refreshToken) return null;
      return {
        accessToken,
        refreshToken,
        userId: parsed.userId ? String(parsed.userId) : undefined,
        email: parsed.email ? String(parsed.email) : undefined,
      };
    } catch {
      return null;
    }
  };

  const persistSession = (session: AppSession | null, persistent: boolean) => {
    if (!session) {
      localStorage.removeItem(SESSION_STORE_KEY);
      sessionStorage.removeItem(SESSION_STORE_KEY_EPHEMERAL);
      return;
    }
    if (persistent) {
      localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(session));
      sessionStorage.removeItem(SESSION_STORE_KEY_EPHEMERAL);
      return;
    }
    sessionStorage.setItem(SESSION_STORE_KEY_EPHEMERAL, JSON.stringify(session));
    localStorage.removeItem(SESSION_STORE_KEY);
  };

  const activateRecoverySession = (accessToken: string, refreshToken?: string) => {
    const nextAccessToken = String(accessToken ?? "").trim();
    const nextRefreshToken = String(refreshToken ?? "").trim();
    if (!nextAccessToken) return false;

    persistSession(null, false);
    setAuth(null);
    setAuthRequired(true);
    setConnectionStatus("error");
    setConnectionDetail("请设置新密码后再登录");
    setRecoverySession({ accessToken: nextAccessToken, refreshToken: nextRefreshToken });
    setResetPasswordValue("");
    setResetPasswordConfirmValue("");
    setResetPasswordOpen(true);
    setRegisterOpen(false);
    return true;
  };

  const verifyRecoverySessionWithSupabase = async (tokenHash: string, token?: string, email?: string) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase 前端环境变量未配置");

    const tryVerify = async (payload: Record<string, unknown>) => {
      const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await readJsonSafe(res);
      const accessToken = String((data as { access_token?: unknown }).access_token ?? "").trim();
      const refreshToken = String((data as { refresh_token?: unknown }).refresh_token ?? "").trim();
      if (!res.ok || !accessToken) {
        const message = String(
          (data as { msg?: unknown; error_description?: unknown; error?: unknown }).msg ??
            (data as { error_description?: unknown }).error_description ??
            (data as { error?: unknown }).error ??
            "重置链接无效或已过期",
        );
        throw new Error(message);
      }
      return { accessToken, refreshToken };
    };

    if (tokenHash) {
      return await tryVerify({ type: "recovery", token_hash: tokenHash });
    }
    if (token && email) {
      return await tryVerify({ type: "recovery", token, email });
    }
    throw new Error("重置链接无效或已过期");
  };

  const refreshAccessToken = async (current: AppSession): Promise<AppSession | null> => {
    if (!supabaseUrl || !supabaseAnonKey || !current.refreshToken) return null;
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: current.refreshToken,
      }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok || !(data as { access_token?: unknown }).access_token || !(data as { refresh_token?: unknown }).refresh_token) {
      return null;
    }
    const next: AppSession = {
      accessToken: String((data as { access_token: string }).access_token),
      refreshToken: String((data as { refresh_token: string }).refresh_token),
      userId: String(((data as { user?: { id?: string } }).user?.id ?? current.userId) || ""),
      email: String(((data as { user?: { email?: string } }).user?.email ?? current.email) || ""),
    };
    const isPersistent = !!localStorage.getItem(SESSION_STORE_KEY);
    persistSession(next, isPersistent);
    setAuth(next);
    return next;
  };

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  // --- 初始化 ---
  useEffect(() => {
    const persisted = parseStoredSession(localStorage.getItem(SESSION_STORE_KEY));
    const ephemeral = parseStoredSession(sessionStorage.getItem(SESSION_STORE_KEY_EPHEMERAL));
    const next = persisted ?? ephemeral;
    if (next) {
      setAuth(next);
      if (next.email) setFormEmail(next.email);
      setRememberMe(Boolean(persisted));
    } else {
      setAuthRequired(true);
      setConnectionStatus("error");
      setConnectionDetail("请登录后继续使用");
    }

    const storedLinks = localStorage.getItem("r2_link_config_v1");
    if (storedLinks) {
      try {
        setLinkConfigMap(JSON.parse(storedLinks));
      } catch {
        localStorage.removeItem("r2_link_config_v1");
      }
    }

    const storedChecks = localStorage.getItem("r2_s3_bucket_check_v1");
    if (storedChecks) {
      try {
        setS3BucketNameCheckMap(JSON.parse(storedChecks));
      } catch {
        localStorage.removeItem("r2_s3_bucket_check_v1");
      }
    }

    const storedModeOverrides = localStorage.getItem("r2_transfer_mode_override_v1");
    if (storedModeOverrides) {
      try {
        setTransferModeOverrideMap(JSON.parse(storedModeOverrides));
      } catch {
        localStorage.removeItem("r2_transfer_mode_override_v1");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const cleanUrlSearchAuthParams = () => {
      const url = new URL(window.location.href);
      [
        "type",
        "access_token",
        "refresh_token",
        "token_hash",
        "token",
        "email",
        "expires_in",
        "expires_at",
        "error",
        "error_code",
        "error_description",
        "code",
      ].forEach((k) => url.searchParams.delete(k));
      const cleanUrl = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    const run = async () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const type = String(hashParams.get("type") ?? "");
        const accessToken = String(hashParams.get("access_token") ?? "").trim();
        const refreshToken = String(hashParams.get("refresh_token") ?? "").trim();
        if (type === "recovery" && accessToken) {
          if (!cancelled && activateRecoverySession(accessToken, refreshToken)) {
            setToast("检测到密码重置请求，请设置新密码");
          }
          const cleanHashUrl = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState({}, document.title, cleanHashUrl);
          return;
        }
      }

      const query = new URLSearchParams(window.location.search);
      const type = String(query.get("type") ?? "").trim();
      if (type !== "recovery") return;

      const accessToken = String(query.get("access_token") ?? "").trim();
      const refreshToken = String(query.get("refresh_token") ?? "").trim();
      if (accessToken) {
        if (!cancelled && activateRecoverySession(accessToken, refreshToken)) {
          setToast("检测到密码重置请求，请设置新密码");
        }
        cleanUrlSearchAuthParams();
        return;
      }

      const tokenHash = String(query.get("token_hash") ?? "").trim();
      const token = String(query.get("token") ?? "").trim();
      const email = String(query.get("email") ?? "").trim();
      try {
        const verified = await verifyRecoverySessionWithSupabase(tokenHash, token, email);
        if (!cancelled && activateRecoverySession(verified.accessToken, verified.refreshToken)) {
          setToast("检测到密码重置请求，请设置新密码");
        }
      } catch (error) {
        if (!cancelled) {
          const message = toChineseErrorMessage(error, "重置链接无效或已过期，请重新发起忘记密码");
          setToast(message || "重置链接无效或已过期，请重新发起忘记密码");
        }
      } finally {
        cleanUrlSearchAuthParams();
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabaseAnonKey, supabaseUrl]);

  useEffect(() => {
    const t = toastPayload;
    if (!t) return;
    const ms = t.kind === "error" ? 4500 : 3200;
    const timer = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(timer);
  }, [toastPayload]);

  const ToastView = toastPayload ? (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-[92vw]">
      <div
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg text-sm font-medium ${
          toastPayload.kind === "success"
            ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/40 dark:border-green-900 dark:text-green-200"
            : toastPayload.kind === "error"
              ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200"
              : "bg-gray-900 text-white border-gray-900 dark:bg-gray-900 dark:border-gray-800"
        }`}
        role="status"
        aria-live="polite"
      >
        <span className="shrink-0 flex items-center justify-center">
          {toastPayload.kind === "success" ? (
            <ShieldCheck className="w-5 h-5" />
          ) : toastPayload.kind === "error" ? (
            <CircleX className="w-5 h-5" />
          ) : (
            <BadgeInfo className="w-5 h-5" />
          )}
        </span>
        <span className="leading-none">{toastPayload.message}</span>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!authRequired) return;
    setLoginAnnouncementOpen(!isMobile);
  }, [authRequired, isMobile]);

  useEffect(() => {
    if (!bucketMenuOpen) return;
    const onDown = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (bucketMenuRef.current && bucketMenuRef.current.contains(target)) return;
      setBucketMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [bucketMenuOpen]);

  useEffect(() => {
    if (!transferModeMenuOpen) return;
    const onDown = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (transferModeMenuRef.current && transferModeMenuRef.current.contains(target)) return;
      setTransferModeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [transferModeMenuOpen]);

  useEffect(() => {
    setTransferModeMenuOpen(false);
  }, [selectedBucket]);

  useEffect(() => {
    if (mobileNavOpen) return;
    setBucketMenuOpen(false);
    setTransferModeMenuOpen(false);
  }, [mobileNavOpen]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") setThemeMode(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const isDark = themeMode === "dark" || (themeMode === "system" && prefersDark);
    setResolvedDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    try {
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.setAttribute("content", isDark ? "#111827" : "#f9fafb");
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(THEME_STORE_KEY, themeMode);
    } catch {
      // ignore
    }
  }, [prefersDark, themeMode]);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
      setMobileDetailOpen(false);
    }
  }, [isMobile]);

  // 移动端详情弹窗只由“操作”按钮触发，不跟随选中项自动弹出。

  useEffect(() => {
    if (!auth) {
      setAuthRequired(true);
      setBuckets([]);
      setSelectedBucket(null);
      setFiles([]);
      setFileListError(null);
      setPath([]);
      setBucketUsage(null);
      setBucketUsageError(null);
      setAccountCenterOpen(false);
      setChangePasswordOpen(false);
      setDeleteAccountOpen(false);
      setShowAccountUserId(false);
      setForgotOpen(false);
      setForgotNotice("");
      setRegisterNotice("");
      setFormPassword("");
      setRegisterPassword("");
      setRegisterCode("");
      setConnectionStatus("error");
      setConnectionDetail("请登录后继续使用");
      return;
    }
    fetchBuckets();
  }, [auth]);

  const readJsonSafe = async (res: Response) => {
    try {
      return await res.clone().json();
    } catch {
      const text = await res
        .clone()
        .text()
        .catch(() => "");
      return text ? { error: text } : {};
    }
  };

  const openLegalModal = (tab: LegalTabKey) => {
    setLegalActiveTab(tab);
    setLegalModalOpen(true);
    setRegisterNotice("");
  };

  // --- 核心：带鉴权的 Fetch ---
  const fetchWithAuth = async (url: string, options: RequestInit = {}, tryRefresh = true): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
    };
    if (!headers["content-type"] && typeof options.body === "string") headers["content-type"] = "application/json";
    const current = authRef.current;
    if (current?.accessToken) headers.Authorization = `Bearer ${current.accessToken}`;

    const res = await fetch(url, { ...options, headers });
    if (res.status !== 401 || !tryRefresh || !current?.refreshToken) return res;

    const next = await refreshAccessToken(current);
    if (!next?.accessToken) return res;
    return await fetchWithAuth(url, options, false);
  };

  const pickSupabaseAuthError = (raw: unknown, fallback: string) => {
    const obj = raw as { msg?: unknown; error_description?: unknown; error?: unknown };
    const message = String(obj?.msg ?? obj?.error_description ?? obj?.error ?? fallback);
    return toChineseErrorMessage(message, fallback);
  };

  const readAppSessionFromAuthData = (raw: unknown, fallbackEmail?: string): AppSession | null => {
    const data = raw as {
      access_token?: unknown;
      refresh_token?: unknown;
      user?: { id?: unknown; email?: unknown };
    };
    const accessToken = String(data?.access_token ?? "").trim();
    const refreshToken = String(data?.refresh_token ?? "").trim();
    if (!accessToken || !refreshToken) return null;
    const email = String(data?.user?.email ?? fallbackEmail ?? "").trim();
    return {
      accessToken,
      refreshToken,
      userId: String(data?.user?.id ?? ""),
      email: email || undefined,
    };
  };

  const readRecoverySessionFromAuthData = (raw: unknown): RecoverySession | null => {
    const data = raw as { access_token?: unknown; refresh_token?: unknown };
    const accessToken = String(data?.access_token ?? "").trim();
    const refreshToken = String(data?.refresh_token ?? "").trim();
    if (!accessToken) return null;
    return { accessToken, refreshToken };
  };

  const sendEmailOtpWithSupabase = async (email: string, createUser: boolean) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase 前端环境变量未配置");
    const res = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        create_user: createUser,
      }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      const fallback = createUser ? "发送注册验证码失败，请重试。" : "发送登录验证码失败，请重试。";
      throw new Error(pickSupabaseAuthError(data, fallback));
    }
  };

  const verifyEmailOtpWithSupabase = async (email: string, token: string) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase 前端环境变量未配置");
    const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "email",
        email,
        token,
      }),
    });
    const data = await readJsonSafe(res);
    const session = readAppSessionFromAuthData(data, email);
    if (!res.ok || !session) {
      throw new Error(pickSupabaseAuthError(data, "验证码无效或已过期，请重试。"));
    }
    return session;
  };

  const sendRecoveryOtpWithSupabase = async (email: string) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase 前端环境变量未配置");
    const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(pickSupabaseAuthError(data, "发送重置验证码失败，请重试。"));
    }
  };

  const verifyRecoveryCodeWithSupabase = async (email: string, token: string) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase 前端环境变量未配置");
    const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "recovery",
        email,
        token,
      }),
    });
    const data = await readJsonSafe(res);
    const session = readRecoverySessionFromAuthData(data);
    if (!res.ok || !session) {
      throw new Error(pickSupabaseAuthError(data, "验证码无效或已过期，请重试。"));
    }
    return session;
  };

  const signInWithSupabase = async (email: string, password: string) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase 前端环境变量未配置");
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await readJsonSafe(res);
    const session = readAppSessionFromAuthData(data, email);
    if (!res.ok || !session) {
      throw new Error(pickSupabaseAuthError(data, "登录失败，请重试。"));
    }
    return session;
  };

  const resetPasswordWithRecoveryToken = async (accessToken: string, password: string) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase 前端环境变量未配置");
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(
        toChineseErrorMessage(
          String(
          (data as { msg?: unknown; error_description?: unknown; error?: unknown }).msg ??
            (data as { error_description?: unknown }).error_description ??
            (data as { error?: unknown }).error ??
            "重置密码失败",
          ),
          "重置密码失败，请重试。",
        ),
      );
    }
  };

  // --- 登录逻辑 ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginNotice("");
    const email = formEmail.trim();
    const password = formPassword.trim();
    if (!email || !password) {
      setLoginNotice("请输入邮箱和密码");
      return;
    }

    try {
      setLoading(true);
      const session = await signInWithSupabase(email, password);
      setAuth(session);
      persistSession(session, rememberMe);
      setAuthRequired(false);
      setConnectionStatus("checking");
      setConnectionDetail(null);
      setLoginNotice("");
      setToast("登录成功");
    } catch (error) {
      const message = toChineseErrorMessage(error, "登录失败，请重试。");
      setLoginNotice(message || "登录失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setRegisterNotice("");
    const email = registerEmail.trim();
    const password = registerPassword.trim();
    const token = registerCode.trim();
    if (!email || !password || !token) {
      setRegisterNotice("请填写邮箱、密码和验证码");
      return;
    }
    if (password.length < 6) {
      setRegisterNotice("设置登录密码至少六个字符");
      return;
    }
    if (!registerAgree) {
      setRegisterNotice("请先阅读并同意「用户协议」和「隐私政策」");
      return;
    }
    try {
      setLoading(true);
      const session = await verifyEmailOtpWithSupabase(email, token);
      await resetPasswordWithRecoveryToken(session.accessToken, password);
      setAuth(session);
      persistSession(session, rememberMe);
      setAuthRequired(false);
      setConnectionStatus("checking");
      setConnectionDetail(null);
      setFormEmail(email);
      setFormPassword("");
      setRegisterPassword("");
      setRegisterCode("");
      setRegisterNotice("");
      setToast("注册并登录成功");
    } catch (error) {
      const message = toChineseErrorMessage(error, "注册失败，请重试。");
      setRegisterNotice(message || "注册失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegisterCode = async () => {
    const email = registerEmail.trim();
    const password = registerPassword.trim();
    if (!email) {
      setRegisterNotice("请输入注册邮箱");
      return;
    }
    if (!password) {
      setRegisterNotice("请先输入注册密码");
      return;
    }
    if (password.length < 6) {
      setRegisterNotice("设置登录密码至少六个字符");
      return;
    }
    if (!registerAgree) {
      setRegisterNotice("请先阅读并同意「用户协议」和「隐私政策」");
      return;
    }
    if (registerCodeCooldown > 0) {
      setRegisterNotice(`请 ${registerCodeCooldown} 秒后再发送`);
      return;
    }
    try {
      setLoading(true);
      await sendEmailOtpWithSupabase(email, true);
      setRegisterCodeCooldownUntil(Date.now() + OTP_RESEND_COOLDOWN_MS);
      setRegisterNotice("注册验证码已发送，请查收邮箱");
    } catch (error) {
      const message = toChineseErrorMessage(error, "发送注册验证码失败，请重试。");
      setRegisterNotice(message || "发送注册验证码失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecoveryCode = async () => {
    setForgotNotice("");
    const email = forgotEmail.trim();
    if (!email) {
      setForgotNotice("请输入注册邮箱");
      return;
    }
    if (forgotCodeCooldown > 0) {
      setForgotNotice(`请 ${forgotCodeCooldown} 秒后再发送`);
      return;
    }
    try {
      setLoading(true);
      await sendRecoveryOtpWithSupabase(email);
      setForgotCodeCooldownUntil(Date.now() + OTP_RESEND_COOLDOWN_MS);
      setForgotNotice("重置验证码已发送，请查收邮箱");
    } catch (error) {
      const message = toChineseErrorMessage(error, "发送重置验证码失败，请重试。");
      setForgotNotice(message || "发送重置验证码失败");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecoveryCode = async () => {
    setForgotNotice("");
    const email = forgotEmail.trim();
    const token = forgotCode.trim();
    if (!email || !token) {
      setForgotNotice("请输入邮箱和验证码");
      return;
    }
    try {
      setLoading(true);
      const session = await verifyRecoveryCodeWithSupabase(email, token);
      setRecoverySession(session);
      setForgotOpen(false);
      setFormEmail(email);
      setForgotCode("");
      setForgotNotice("");
      setResetPasswordValue("");
      setResetPasswordConfirmValue("");
      setResetPasswordOpen(true);
      setToast("验证码校验成功，请设置新密码");
    } catch (error) {
      const message = toChineseErrorMessage(error, "验证码无效或已过期，请重试。");
      setForgotNotice(message || "验证码无效或已过期，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordFromRecovery = async () => {
    const password = resetPasswordValue.trim();
    const confirm = resetPasswordConfirmValue.trim();
    if (!recoverySession?.accessToken) {
      setToast("重置会话已失效，请重新发起忘记密码");
      return;
    }
    if (!password || !confirm) {
      setToast("请填写完整的新密码");
      return;
    }
    if (password.length < 6) {
      setToast("新密码至少 6 位");
      return;
    }
    if (password !== confirm) {
      setToast("两次输入的新密码不一致");
      return;
    }
    try {
      setLoading(true);
      await resetPasswordWithRecoveryToken(recoverySession.accessToken, password);
      setResetPasswordOpen(false);
      setResetPasswordValue("");
      setResetPasswordConfirmValue("");
      setRecoverySession(null);
      setForgotCode("");
      setForgotEmail("");
      setToast("密码重置成功，请使用新密码登录");
    } catch (error) {
      const message = toChineseErrorMessage(error, "重置密码失败，请重试。");
      setToast(message || "重置密码失败");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    const password = changePasswordValue.trim();
    const confirm = changePasswordConfirmValue.trim();
    if (!password || !confirm) {
      setToast("请填写完整的新密码信息");
      return;
    }
    if (password.length < 6) {
      setToast("新密码至少 6 位");
      return;
    }
    if (password !== confirm) {
      setToast("两次输入的新密码不一致");
      return;
    }
    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(String((data as { error?: unknown }).error ?? "修改密码失败"));
      }
      setChangePasswordOpen(false);
      setChangePasswordValue("");
      setChangePasswordConfirmValue("");
      handleLogout();
      setToast("密码修改成功，已退出登录，请使用新密码重新登录");
    } catch (error) {
      const message = toChineseErrorMessage(error, "修改密码失败，请重试。");
      setToast(message || "修改密码失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteAccountConfirmText.trim() !== "注销") {
      setToast("请输入“注销”确认此操作");
      return;
    }
    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/account", { method: "DELETE" });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(String((data as { error?: unknown }).error ?? "注销账号失败"));
      }
      setDeleteAccountOpen(false);
      setDeleteAccountConfirmText("");
      handleLogout();
      setToast("账号已注销");
    } catch (error) {
      const message = toChineseErrorMessage(error, "注销账号失败，请重试。");
      setToast(message || "注销账号失败");
    } finally {
      setLoading(false);
    }
  };

  const resetBucketForm = () =>
    setBucketForm({
      bucketLabel: "",
      bucketName: "",
      accountId: "",
      accessKeyId: "",
      secretAccessKey: "",
      publicBaseUrl: "",
      customBaseUrl: "",
    });

  const handleSaveBucket = async () => {
    const isEditing = Boolean(editingBucketId);
    const payload = {
      bucketLabel: bucketForm.bucketLabel.trim(),
      bucketName: bucketForm.bucketName.trim(),
      accountId: bucketForm.accountId.trim(),
      accessKeyId: bucketForm.accessKeyId.trim(),
      secretAccessKey: bucketForm.secretAccessKey.trim(),
      publicBaseUrl: bucketForm.publicBaseUrl.trim(),
      customBaseUrl: bucketForm.customBaseUrl.trim(),
      isDefault: !isEditing && buckets.length === 0,
    };
    const nextErrors: BucketFormErrors = {};
    if (!payload.bucketName) nextErrors.bucketName = "此项必填";
    if (!payload.accountId) nextErrors.accountId = "此项必填";
    if (!isEditing && !payload.accessKeyId) nextErrors.accessKeyId = "此项必填";
    if (!isEditing && !payload.secretAccessKey) nextErrors.secretAccessKey = "此项必填";
    if (Object.keys(nextErrors).length > 0) {
      setBucketFormErrors(nextErrors);
      return;
    }
    setBucketFormErrors({});
    try {
      setLoading(true);
      const res = isEditing
        ? await fetchWithAuth("/api/buckets", {
            method: "PATCH",
            body: JSON.stringify({
              id: editingBucketId,
              bucketLabel: payload.bucketLabel,
              bucketName: payload.bucketName,
              accountId: payload.accountId,
              accessKeyId: payload.accessKeyId || undefined,
              secretAccessKey: payload.secretAccessKey || undefined,
              publicBaseUrl: payload.publicBaseUrl,
              customBaseUrl: payload.customBaseUrl,
            }),
          })
        : await fetchWithAuth("/api/buckets", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? (isEditing ? "更新失败" : "创建失败")));
      const created = (data as { bucket?: Bucket }).bucket;
      setAddBucketOpen(false);
      setEditingBucketId(null);
      setBucketFormErrors({});
      resetBucketForm();
      await fetchBuckets();
      let createToast = isEditing ? "存储桶已更新" : "存储桶已添加";
      if (created?.id || selectedBucket) {
        const bucketIdToUse = created?.id ?? selectedBucket;
        if (!bucketIdToUse) return;
        setPath([]);
        setSearchTerm("");
        setSelectedItem(null);
        setSelectedKeys(new Set());
        setSelectedBucket(bucketIdToUse);

        try {
          const checkRes = await fetchWithAuth(
            `/api/bucket-check?bucketId=${encodeURIComponent(bucketIdToUse)}&bucketName=${encodeURIComponent(payload.bucketName)}`,
          );
          const checkData = await readJsonSafe(checkRes);
          const ok = Boolean((checkData as { ok?: unknown }).ok);
          const hint = String((checkData as { hint?: unknown }).hint ?? "").trim();
          upsertS3BucketNameCheck(bucketIdToUse, {
            bucketName: payload.bucketName,
            ok,
            hint: hint || undefined,
            checkedAt: Date.now(),
          });
          if (!ok && hint) {
            createToast = `存储桶已保存，但连通性校验失败：${hint}`;
          }
        } catch {
          // ignore check errors; file list loading will show details if it fails.
        }
      }
      setToast(createToast);
    } catch (error) {
      const message = toChineseErrorMessage(error, isEditing ? "更新存储桶失败，请重试。" : "添加存储桶失败，请重试。");
      setToast(message || (isEditing ? "更新存储桶失败" : "添加存储桶失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBucket = async (bucketId: string) => {
    if (!bucketId) return;
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/buckets?id=${encodeURIComponent(bucketId)}`, { method: "DELETE" });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "删除失败"));
      setBucketDeleteOpen(false);
      setBucketDeleteTargetId(null);
      await fetchBuckets();
      setToast("存储桶已删除");
    } catch (error) {
      const message = toChineseErrorMessage(error, "删除存储桶失败，请重试。");
      setToast(message || "删除存储桶失败");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    persistSession(null, false);
    setAuth(null);
    setBuckets([]);
    setSelectedBucket(null);
    setFileListError(null);
    setBucketUsage(null);
    setBucketUsageError(null);
    setSelectedItem(null);
    setSelectedKeys(new Set());
    setPreview(null);
    setUploadTasks([]);
    setUploadPanelOpen(false);
    setUploadQueuePaused(false);
    setRenameOpen(false);
    setMoveOpen(false);
    setLinkOpen(false);
    setAccountCenterOpen(false);
    setChangePasswordOpen(false);
    setDeleteAccountOpen(false);
    setShowAccountUserId(false);
    setDeleteOpen(false);
    setBucketDeleteTargetId(null);
    setBucketDeleteOpen(false);
    setChangePasswordValue("");
    setChangePasswordConfirmValue("");
    setDeleteAccountConfirmText("");
    setForgotOpen(false);
    setForgotEmail("");
    setForgotCode("");
    setForgotNotice("");
    setForgotCodeCooldownUntil(0);
    setResetPasswordOpen(false);
    setResetPasswordValue("");
    setResetPasswordConfirmValue("");
    setRecoverySession(null);
    setRegisterNotice("");
    setRegisterCode("");
    setRegisterPassword("");
    setRegisterCodeCooldownUntil(0);
    setFormPassword("");
    setAuthRequired(true);
    setConnectionStatus("error");
    setConnectionDetail("已退出登录，请重新登录");
    setFormEmail("");
    setRememberMe(false);
    setLoading(false);
    setToast("退出登录成功");
  };

  // --- API 调用 ---
  const fetchBuckets = async () => {
    if (!authRef.current) {
      setAuthRequired(true);
      return;
    }
    setConnectionStatus("checking");
    setConnectionDetail(null);
    try {
      const res = await fetchWithAuth("/api/buckets");
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        persistSession(null, false);
        setAuth(null);
        setAuthRequired(true);
        setConnectionStatus("error");
        setConnectionDetail("登录已失效，请重新登录");
        return;
      }

      if (res.ok && data.buckets) {
        const incoming = (data.buckets as Bucket[]) ?? [];
        setAuthRequired(false);
        setBuckets(incoming);

        setLinkConfigMap((prev) => {
          const next = { ...prev };
          for (const b of incoming) {
            next[b.id] = {
              publicBaseUrl: b.publicBaseUrl ?? next[b.id]?.publicBaseUrl,
              customBaseUrl: b.customBaseUrl ?? next[b.id]?.customBaseUrl,
              s3BucketName: b.bucketName ?? next[b.id]?.s3BucketName,
            };
          }
          localStorage.setItem("r2_link_config_v1", JSON.stringify(next));
          return next;
        });

        if (incoming.length === 0) {
          setSelectedBucket(null);
          setFiles([]);
          setFileListError(null);
          setBucketUsage(null);
          setBucketUsageError(null);
          setPath([]);
          setConnectionStatus("unbound");
          setConnectionDetail("未配置存储桶：请先新增一个存储桶");
        } else {
          setConnectionStatus("connected");
          if (!selectedBucket || !incoming.some((b) => b.id === selectedBucket)) {
            const preferred = incoming.find((b) => b.isDefault)?.id ?? incoming[0].id;
            setSelectedBucket(preferred);
          }
        }
      } else {
        setConnectionStatus("error");
        if (data.error) {
          const message = toChineseErrorMessage(String(data.error), "连接失败，请稍后重试。");
          setConnectionDetail(message);
          setToast(`连接失败: ${message}`);
        }
      }
    } catch (e) {
      setConnectionStatus("error");
      setConnectionDetail("网络或运行时异常");
      console.error(e);
    }
  };

  const fetchFiles = async (bucketId: string, currentPath: string[]) => {
    if (!bucketId) return;
    setLoading(true);
    setFileListLoading(true);
    setFileListError(null);
    const prefix = currentPath.length > 0 ? currentPath.join("/") + "/" : "";
    try {
      const res = await fetchWithAuth(`/api/files?bucket=${encodeURIComponent(bucketId)}&prefix=${encodeURIComponent(prefix)}`);
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setFiles([]);
        const message = toChineseErrorMessage((data as { error?: unknown }).error, "读取文件列表失败");
        setFileListError(message);
        setConnectionStatus("error");
        setConnectionDetail(null);
        setBucketUsageError(null);
        return;
      }
      setFiles(Array.isArray((data as { items?: unknown }).items) ? (((data as { items?: FileItem[] }).items ?? []) as FileItem[]) : []);
      setFileListError(null);
      setConnectionStatus("connected");
      setConnectionDetail(null);
    } catch (e) {
      setFiles([]);
      const message = "读取文件列表失败，请检查桶配置或网络";
      setFileListError(message);
      setConnectionStatus("error");
      setConnectionDetail(null);
      setBucketUsageError(null);
      console.error(e);
    } finally {
      setFileListLoading(false);
      setLoading(false);
    }
  };

  const runGlobalSearch = async (bucketName: string, term: string) => {
    const q = term.trim();
    if (!q) {
      setSearchResults([]);
      setSearchCursor(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/search?bucket=${encodeURIComponent(bucketName)}&q=${encodeURIComponent(q)}&limit=200`,
      );
      const data = await res.json();
      if (res.ok) {
        setSearchResults(data.items || []);
        setSearchCursor(data.cursor ?? null);
      } else {
        setSearchResults([]);
        setSearchCursor(null);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchBucketUsage = async (bucketName: string) => {
    setUsageLoading(true);
    setBucketUsageError(null);
    try {
      const res = await fetchWithAuth(`/api/usage?bucket=${encodeURIComponent(bucketName)}&maxPages=10`);
      const data = await readJsonSafe(res);
      if (res.ok) {
        const parsed: BucketUsage = {
          bucket: String((data as { bucket?: unknown }).bucket ?? bucketName),
          prefix: String((data as { prefix?: unknown }).prefix ?? ""),
          objects: Math.max(0, Math.floor(toFiniteNumber((data as { objects?: unknown }).objects, 0))),
          bytes: Math.max(0, toFiniteNumber((data as { bytes?: unknown }).bytes, 0)),
          pagesScanned: Math.max(0, Math.floor(toFiniteNumber((data as { pagesScanned?: unknown }).pagesScanned, 0))),
          truncated: Boolean((data as { truncated?: unknown }).truncated),
        };
        setBucketUsage(parsed);
        setBucketUsageError(null);
      } else {
        setBucketUsage(null);
        setBucketUsageError(String((data as { error?: unknown }).error ?? "桶占用估算失败"));
      }
    } catch {
      setBucketUsage(null);
      setBucketUsageError("桶占用估算失败，请检查桶配置或网络");
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBucket) {
      fetchFiles(selectedBucket, path);
      setSelectedItem(null);
      setSelectedKeys(new Set());
    }
  }, [selectedBucket, path, auth]);

  useEffect(() => {
    if (!selectedBucket) {
      setSearchResults([]);
      setSearchCursor(null);
      return;
    }
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearchCursor(null);
      return;
    }
    const t = setTimeout(() => {
      runGlobalSearch(selectedBucket, term).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm, selectedBucket, auth]);

  useEffect(() => {
    if (selectedBucket) {
      fetchBucketUsage(selectedBucket);
    }
  }, [selectedBucket, auth]);

  const persistLinkConfigMap = (next: LinkConfigMap) => {
    setLinkConfigMap(next);
    localStorage.setItem("r2_link_config_v1", JSON.stringify(next));
  };

  const upsertS3BucketNameCheck = (bucketId: string, rec: S3BucketNameCheck) => {
    setS3BucketNameCheckMap((prev) => {
      const next = { ...prev, [bucketId]: rec };
      localStorage.setItem("r2_s3_bucket_check_v1", JSON.stringify(next));
      return next;
    });
  };

  const setTransferModeOverride = (bucketId: string, mode: TransferModeOverride) => {
    setTransferModeOverrideMap((prev) => {
      const next = { ...prev, [bucketId]: mode };
      localStorage.setItem("r2_transfer_mode_override_v1", JSON.stringify(next));
      return next;
    });
  };

  const getTransferModeOverride = (bucketId: string) => {
    return (transferModeOverrideMap[bucketId] ?? "auto") as TransferModeOverride;
  };

  const getLinkConfig = (bucketName: string | null): LinkConfig => {
    if (!bucketName) return {};
    return linkConfigMap[bucketName] ?? {};
  };

  const getS3BucketNameCheck = (bucketId: string | null) => {
    if (!bucketId) return null;
    const cfg = getLinkConfig(bucketId);
    const bucketName = (cfg.s3BucketName ?? "").trim();
    if (!bucketName) return null;
    const rec = s3BucketNameCheckMap[bucketId];
    if (!rec) return null;
    if (rec.bucketName !== bucketName) return null;
    return rec;
  };

  const getS3BucketNameOverride = (bucketId: string) => {
    const cfg = getLinkConfig(bucketId);
    const bucketName = (cfg.s3BucketName ?? "").trim();
    if (!bucketName) return "";
    const rec = getS3BucketNameCheck(bucketId);
    if (rec && rec.ok === false) return "";
    return bucketName;
  };

  const normalizeBaseUrl = (raw?: string) => {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProto.endsWith("/") ? withProto : `${withProto}/`;
  };

  const buildObjectUrl = (baseUrl: string | undefined, key: string) => {
    if (!baseUrl) return null;
    return baseUrl + key.split("/").map(encodeURIComponent).join("/");
  };

  const getFileExt = (name: string) => {
    const base = name.split("?")[0];
    const parts = base.split("/");
    const last = parts[parts.length - 1] || "";
    const idx = last.lastIndexOf(".");
    if (idx <= 0 || idx === last.length - 1) return "";
    return last.slice(idx + 1).toLowerCase();
  };

  const getFileTag = (item: FileItem) => {
    if (item.type === "folder") return "DIR";
    const ext = getFileExt(item.name);
    return ext ? ext.toUpperCase() : "FILE";
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setToast("已复制到剪贴板");
  };

  // --- 操作逻辑 ---
  const handleEnterFolder = (folderName: string) => {
    setPath([...path, folderName]);
    setSearchTerm("");
  };

  const handleBreadcrumbClick = (index: number) => {
    setPath(path.slice(0, index + 1));
    setSearchTerm("");
  };

  const refreshCurrentView = async () => {
    if (!selectedBucket) return;
    const term = searchTerm.trim();
    if (term) await runGlobalSearch(selectedBucket, term);
    else await fetchFiles(selectedBucket, path);
  };

  const openMkdir = () => {
    if (!selectedBucket) return;
    setMkdirName("");
    setMkdirOpen(true);
  };

  const executeMkdir = async () => {
    if (!selectedBucket) return;
    const name = mkdirName.trim();
    if (!name) {
      setMkdirOpen(false);
      return;
    }
    if (name.includes("/")) {
      setToast("文件夹名不支持 /");
      return;
    }
    const prefix = path.length > 0 ? path.join("/") + "/" : "";
    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/operate", {
        method: "POST",
        body: JSON.stringify({
          bucket: selectedBucket,
          targetKey: `${prefix}${name}/`,
          operation: "mkdir",
        }),
      });
      if (!res.ok) throw new Error("mkdir failed");
      setMkdirOpen(false);
      setSearchTerm("");
      await fetchFiles(selectedBucket, path);
      setToast("新建文件夹成功");
    } catch {
      setToast("新建文件夹失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!selectedBucket) return;
    if (selectedKeys.size === 0 && !selectedItem) return;
    setDeleteOpen(true);
  };

  const executeDelete = async () => {
    if (!selectedBucket) return;
    try {
      setLoading(true);
      const selected = Array.from(selectedKeys);
      if (selected.length > 0) {
        const res = await fetchWithAuth("/api/operate", {
          method: "POST",
          body: JSON.stringify({
            bucket: selectedBucket,
            sourceKeys: selected,
            operation: "deleteMany",
          }),
        });
        if (!res.ok) throw new Error("delete failed");
      } else if (selectedItem) {
        if (selectedItem.type === "folder") {
          const res = await fetchWithAuth("/api/operate", {
            method: "POST",
            body: JSON.stringify({
              bucket: selectedBucket,
              sourceKey: selectedItem.key,
              operation: "delete",
            }),
          });
          if (!res.ok) throw new Error("delete failed");
        } else {
          const res = await fetchWithAuth(
            `/api/files?bucket=${selectedBucket}&key=${encodeURIComponent(selectedItem.key)}`,
            { method: "DELETE" },
          );
          if (!res.ok) throw new Error("delete failed");
        }
      } else {
        setDeleteOpen(false);
        return;
      }

      setDeleteOpen(false);
      await refreshCurrentView();
      setSelectedItem(null);
      setSelectedKeys(new Set());
      setToast("删除成功");
    } catch {
      setToast("删除失败，请刷新后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleRename = () => {
    if (!selectedBucket || !selectedItem) return;
    setRenameValue(selectedItem.name);
    setRenameOpen(true);
  };

  const openRenameForSelection = () => {
    if (!selectedBucket) return;
    const keys = Array.from(selectedKeys);
    if (keys.length !== 1) {
      setToast("请选择 1 个文件/文件夹进行重命名");
      return;
    }
    const item = filteredFiles.find((f) => f.key === keys[0]);
    if (!item) {
      setToast("未找到选中文件");
      return;
    }
    openRenameFor(item);
  };

  const handleRenameFromToolbar = () => {
    if (!selectedBucket) return;
    if (selectedKeys.size === 1) {
      openRenameForSelection();
      return;
    }
    if (selectedItem) {
      handleRename();
      return;
    }
    setToast("请选择 1 个文件/文件夹进行重命名");
  };

  const openRenameFor = (item: FileItem) => {
    if (!selectedBucket) return;
    setSelectedItem(item);
    setRenameValue(item.name);
    setRenameOpen(true);
  };

  const executeRename = async () => {
    if (!selectedBucket || !selectedItem) return;
    const newName = renameValue.trim();
    if (!newName || newName === selectedItem.name) {
      setRenameOpen(false);
      return;
    }

    const currentKey = selectedItem.key;
    let prefix = "";
    if (selectedItem.type === "folder") {
      const trimmed = currentKey.endsWith("/") ? currentKey.slice(0, -1) : currentKey;
      const parts = trimmed.split("/").filter(Boolean);
      prefix = parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "";
    } else {
      const parts = currentKey.split("/").filter(Boolean);
      prefix = parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "";
    }
    const targetKey = prefix + newName + (selectedItem.type === "folder" ? "/" : "");

    try {
      setLoading(true);
      const res = await fetchWithAuth("/api/operate", {
        method: "POST",
        body: JSON.stringify({
          bucket: selectedBucket,
          sourceKey: selectedItem.key,
          targetKey,
          operation: "move",
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(toChineseErrorMessage((data as { error?: unknown }).error, "重命名失败，请刷新后重试"));
      }
      setRenameOpen(false);
      await refreshCurrentView();
      setSelectedItem(null);
      setSelectedKeys(new Set());
      setToast("重命名成功");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "重命名失败，请刷新后重试"));
    } finally {
      setLoading(false);
    }
  };

  const handleMoveOrCopy = (mode: "move" | "copy") => {
    if (!selectedBucket || !selectedItem) return;
    setMoveMode(mode);
    const defaultPath = [...path];
    setMoveBrowserPath(defaultPath);
    setMoveBrowserError(null);
    setMoveTarget(defaultPath.length ? `${defaultPath.join("/")}/` : "/");
    setMoveSources([selectedItem.key]);
    setMoveOpen(true);
  };

  const openMoveFor = (item: FileItem, mode: "move" | "copy") => {
    if (!selectedBucket) return;
    setSelectedItem(item);
    setMoveMode(mode);
    const defaultPath = [...path];
    setMoveBrowserPath(defaultPath);
    setMoveBrowserError(null);
    setMoveTarget(defaultPath.length ? `${defaultPath.join("/")}/` : "/");
    setMoveSources([item.key]);
    setMoveOpen(true);
  };

  const openBatchMove = () => {
    if (!selectedBucket) return;
    const keys = Array.from(selectedKeys).filter((k) => typeof k === "string" && k.length > 0);
    if (!keys.length) {
      setToast("请选择要移动的文件或文件夹");
      return;
    }
    setMoveMode("move");
    const defaultPath = [...path];
    setMoveBrowserPath(defaultPath);
    setMoveBrowserError(null);
    setMoveTarget(defaultPath.length ? `${defaultPath.join("/")}/` : "/");
    setMoveSources(keys);
    setMoveOpen(true);
  };

  const closeMoveDialog = () => {
    setMoveOpen(false);
    setMoveSources([]);
    setMoveBrowserPath([]);
    setMoveBrowserFolders([]);
    setMoveBrowserError(null);
  };

  const chooseMoveDirectory = (nextPath: string[]) => {
    setMoveBrowserPath(nextPath);
    setMoveTarget(nextPath.length ? `${nextPath.join("/")}/` : "/");
  };

  useEffect(() => {
    if (!moveOpen || !selectedBucket) return;

    let active = true;
    const prefix = moveBrowserPath.length ? `${moveBrowserPath.join("/")}/` : "";

    (async () => {
      setMoveBrowserLoading(true);
      setMoveBrowserError(null);
      try {
        const res = await fetchWithAuth(
          `/api/files?bucket=${encodeURIComponent(selectedBucket)}&prefix=${encodeURIComponent(prefix)}`,
        );
        const data = await readJsonSafe(res);
        if (!res.ok) {
          throw new Error(toChineseErrorMessage((data as { error?: unknown }).error, "读取目录失败"));
        }

        const items = Array.isArray((data as { items?: unknown }).items)
          ? (((data as { items?: FileItem[] }).items ?? []) as FileItem[])
          : [];
        const folders = items
          .filter((item) => item.type === "folder")
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

        if (active) setMoveBrowserFolders(folders);
      } catch (error) {
        if (!active) return;
        setMoveBrowserFolders([]);
        setMoveBrowserError(toChineseErrorMessage(error, "读取目录失败"));
      } finally {
        if (active) setMoveBrowserLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [moveOpen, moveBrowserPath, selectedBucket, auth]);

  const executeMoveOrCopy = async () => {
    if (!selectedBucket) return;
    const rawInput = moveTarget.trim();
    if (!rawInput) {
      closeMoveDialog();
      return;
    }

    let cleaned = rawInput;
    while (cleaned.startsWith("/")) cleaned = cleaned.slice(1);
    const treatAsDirectory = rawInput.endsWith("/") || rawInput === "/";

    const sources = moveSources.length ? moveSources : selectedItem ? [selectedItem.key] : [];
    if (!sources.length) return;

    try {
      setLoading(true);
      const op = moveMode === "move" ? "move" : "copy";
      const manyOp = op === "move" ? "moveMany" : "copyMany";
      const useMany = sources.length > 1 || !selectedItem || sources[0] !== selectedItem.key;

      const res =
        useMany
          ? await fetchWithAuth("/api/operate", {
              method: "POST",
              body: JSON.stringify({
                bucket: selectedBucket,
                sourceKeys: sources,
                targetPrefix: cleaned,
                operation: manyOp,
              }),
            })
          : await fetchWithAuth("/api/operate", {
              method: "POST",
              body: JSON.stringify({
                bucket: selectedBucket,
                sourceKey: selectedItem.key,
                targetKey: (() => {
                  const suffix = selectedItem.type === "folder" ? "/" : "";
                  let targetKey = cleaned;
                  if (treatAsDirectory || cleaned === "") targetKey = cleaned + selectedItem.name + suffix;
                  else if (selectedItem.type === "folder" && !targetKey.endsWith("/")) targetKey += "/";
                  return targetKey;
                })(),
                operation: op,
              }),
            });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(toChineseErrorMessage((data as { error?: unknown }).error, moveMode === "move" ? "移动失败" : "复制失败"));
      }
      closeMoveDialog();
      await refreshCurrentView();
      setSelectedItem(null);
      setSelectedKeys(new Set());
      setToast(moveMode === "move" ? "已移动" : "已复制");
    } catch (error) {
      setToast(toChineseErrorMessage(error, moveMode === "move" ? "移动失败" : "复制失败"));
    } finally {
      setLoading(false);
    }
  };

  const getSignedDownloadUrl = async (bucket: string, key: string, filename?: string) => {
    const qs = new URLSearchParams();
    qs.set("bucket", bucket);
    qs.set("key", key);
    if (filename) qs.set("filename", filename);
    const overrideMode = getTransferModeOverride(bucket);
    if (overrideMode === "proxy") qs.set("forceProxy", "1");
    const bucketNameOverride = getS3BucketNameOverride(bucket);
    if (bucketNameOverride) qs.set("bucketName", bucketNameOverride);
    const res = await fetchWithAuth(`/api/download?${qs.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || "download url failed");
    return data.url as string;
  };

  const getSignedDownloadUrlForced = async (bucket: string, key: string, filename: string) => {
    const bucketNameOverride = getS3BucketNameOverride(bucket);
    const overrideMode = getTransferModeOverride(bucket);
    const extraBucket = bucketNameOverride ? `&bucketName=${encodeURIComponent(bucketNameOverride)}` : "";
    const extraMode = overrideMode === "proxy" ? "&forceProxy=1" : "";
    const res = await fetchWithAuth(
      `/api/download?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}&download=1&filename=${encodeURIComponent(filename)}${extraBucket}${extraMode}`,
    );
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || "download url failed");
    return data.url as string;
  };

  const downloadItem = async (item: FileItem) => {
    if (!selectedBucket) return;
    if (item.type === "folder") {
      setToast("文件夹打包下载下一步做（当前先支持文件下载）");
      return;
    }
    try {
      const url = await getSignedDownloadUrlForced(selectedBucket, item.key, item.name);
      triggerDownloadUrl(url, item.name);
      setToast("已拉起下载");
    } catch {
      setToast("下载失败");
    }
  };

  const triggerDownloadUrl = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleBatchDownload = async () => {
    if (!selectedBucket) return;
    const keys = Array.from(selectedKeys).filter((k) => !k.endsWith("/"));
    if (!keys.length) {
      setToast("暂不支持文件夹整体批量下载");
      return;
    }
    setToast(`开始下载 ${keys.length} 个文件`);
    for (const k of keys) {
      try {
        const filename = k.split("/").pop() || "download";
        const url = await getSignedDownloadUrlForced(selectedBucket, k, filename);
        triggerDownloadUrl(url, filename);
        await new Promise((r) => setTimeout(r, 150));
      } catch {
        // ignore and continue
      }
    }
    setToast("已拉起批量下载");
  };

  const handleConfigureLinks = () => {
    if (!selectedBucket) return;
    const current = getLinkConfig(selectedBucket);
    setLinkPublic(current.publicBaseUrl ?? "");
    setLinkCustom(current.customBaseUrl ?? "");
    setLinkS3BucketName(current.s3BucketName ?? "");
    setLinkOpen(true);
  };

  const saveLinkConfig = async () => {
    if (!selectedBucket) return;
    const publicBaseUrl = normalizeBaseUrl(linkPublic || undefined);
    const customBaseUrl = normalizeBaseUrl(linkCustom || undefined);
    const s3BucketName = linkS3BucketName.trim() || undefined;
    if (!s3BucketName) {
      setToast("桶名不能为空");
      return;
    }

    try {
      const res = await fetchWithAuth(
        `/api/bucket-check?bucketId=${encodeURIComponent(selectedBucket)}&bucketName=${encodeURIComponent(s3BucketName)}`,
      );
      const data = await readJsonSafe(res);
      const ok = Boolean((data as { ok?: unknown }).ok);
      const hint = String((data as { hint?: unknown }).hint ?? "").trim();
      upsertS3BucketNameCheck(selectedBucket, { bucketName: s3BucketName, ok, hint: hint || undefined, checkedAt: Date.now() });
      if (!ok) {
        setToast(`桶名校验失败：${hint || "请检查桶名"}`);
        return;
      }

      const patchRes = await fetchWithAuth("/api/buckets", {
        method: "PATCH",
        body: JSON.stringify({
          id: selectedBucket,
          bucketName: s3BucketName,
          publicBaseUrl,
          customBaseUrl,
        }),
      });
      const patchData = await readJsonSafe(patchRes);
      if (!patchRes.ok) throw new Error(String((patchData as { error?: unknown }).error ?? "保存失败"));

      const next: LinkConfigMap = { ...linkConfigMap, [selectedBucket]: { publicBaseUrl, customBaseUrl, s3BucketName } };
      persistLinkConfigMap(next);
      setLinkOpen(false);
      setToast("已保存链接设置（桶名校验通过）");
    } catch (error) {
      const message = toChineseErrorMessage(error, "保存失败，请重试。");
      upsertS3BucketNameCheck(selectedBucket, { bucketName: s3BucketName, ok: false, hint: message, checkedAt: Date.now() });
      setToast(message || "保存失败");
    }
  };

  const copyLinkForItem = async (item: FileItem, kind: "public" | "custom") => {
    if (!selectedBucket) return;
    const cfg = getLinkConfig(selectedBucket);
    const baseUrl = kind === "public" ? cfg.publicBaseUrl : cfg.customBaseUrl;
    const url = buildObjectUrl(baseUrl, item.key);
    if (!url) {
      setToast(kind === "public" ? "未配置公共开发 URL" : "未配置自定义域名");
      return;
    }
    await copyToClipboard(url);
  };

  const previewItem = async (item: FileItem) => {
    if (!selectedBucket) return;
    if (item.type === "folder") return;

	    const lower = item.name.toLowerCase();
	    const ext = getFileExt(item.name);
	    let kind: PreviewKind = "other";
	    if (ext === "pdf") kind = "pdf";
	    else if (/^(doc|docx|ppt|pptx|xls|xlsx)$/.test(ext)) kind = "office";
	    else if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(lower)) kind = "image";
	    else if (/\.(mp4|mov|mkv|webm)$/.test(lower)) kind = "video";
	    else if (/\.(mp3|wav|flac|ogg)$/.test(lower)) kind = "audio";
	    else if (/\.(txt|log|md|json|csv|ts|tsx|js|jsx|css|html|xml|yml|yaml)$/.test(lower)) kind = "text";

    try {
      const url = await getSignedDownloadUrl(selectedBucket, item.key, item.name);
      const next: PreviewState = { name: item.name, key: item.key, bucket: selectedBucket, kind, url };
      setPreview(next);
      if (kind === "text") {
        const res = await fetch(url, { headers: { Range: "bytes=0-204799" } });
        const text = await res.text();
        setPreview((prev) => (prev && prev.key === item.key ? { ...prev, text } : prev));
      }
    } catch {
      setToast("预览失败");
    }
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "-";
    return `${formatSize(bytesPerSec)}/s`;
  };

  const xhrPut = (
    url: string,
    body: Blob,
    contentType: string | undefined,
    onProgress: (loaded: number, total: number) => void,
    signal?: AbortSignal,
  ) => {
    return new Promise<{ etag: string | null }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");

      if (signal) {
        if (signal.aborted) {
          reject(new Error("上传已中止"));
          return;
        }
        const onAbort = () => {
          try {
            xhr.abort();
          } catch {
            // ignore
          }
        };
        signal.addEventListener("abort", onAbort, { once: true });
        xhr.addEventListener(
          "loadend",
          () => {
            signal.removeEventListener("abort", onAbort);
          },
          { once: true },
        );
      }

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) onProgress(evt.loaded, evt.total);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ etag: xhr.getResponseHeader("ETag") });
        } else {
          reject(new Error(`上传失败（状态码：${xhr.status}）`));
        }
      };
      xhr.onerror = () => reject(new Error("网络异常，请重试"));
      xhr.onabort = () => reject(new Error("上传已中止"));
      xhr.send(body);
    });
  };

  const uploadSingleFile = async (
    _taskId: string,
    bucket: string,
    key: string,
    file: File,
    onLoaded: (loaded: number) => void,
    signal?: AbortSignal,
	  ) => {
	    let signRes: Response;
	    try {
	      signRes = await fetchWithAuth("/api/files", {
	        method: "POST",
	        body: JSON.stringify({ bucket, key, contentType: file.type }),
	      });
	    } catch (err: unknown) {
	      const msg = err instanceof Error ? err.message : String(err);
	      throw new Error(`请求上传签名失败：${msg}`);
	    }
	    const signData = await readJsonSafe(signRes);
	    if (!signRes.ok || !signData.url) throw new Error(toChineseErrorMessage(signData.error, `上传签名失败（状态码：${signRes.status}）`));
	    await xhrPut(signData.url, file, file.type, (loaded) => onLoaded(loaded), signal);
	  };

  const uploadMultipartFile = async (
    taskId: string,
    bucket: string,
    key: string,
    file: File,
    onLoaded: (loaded: number) => void,
    signal?: AbortSignal,
  ) => {
    // R2 multipart parts should be >= 5MiB (except the last part). Choose a part size that
    // yields a few parts even for medium files, so we can upload parts in parallel and improve
    // throughput on networks where a single connection is slow.
    const pickPartSize = (size: number) => {
      const MiB = 1024 * 1024;
      const min = 8 * MiB;
      const max = 64 * MiB;
      const targetParts = 6;
      const raw = Math.ceil(size / targetParts);
      const clamped = Math.max(min, Math.min(max, raw));
      // Round up to whole MiB to avoid odd sizes.
      return Math.ceil(clamped / MiB) * MiB;
    };

    const resumeKey = getResumeKey(bucket, key, file);
    const existingTask = uploadTasksRef.current.find((t) => t.id === taskId);
    const existing = existingTask?.multipart;
    const persisted = loadResumeRecord(resumeKey);

    let uploadId: string | null = existing?.uploadId ?? persisted?.uploadId ?? null;
    let partSize = existing?.partSize ?? persisted?.partSize ?? pickPartSize(file.size);
    let partsMap: Record<string, string> = existing?.parts ?? persisted?.parts ?? {};

    // If the persisted record doesn't match the file, ignore it.
    if (persisted && (persisted.size !== file.size || persisted.lastModified !== file.lastModified)) {
      uploadId = existing?.uploadId ?? null;
      partsMap = existing?.parts ?? {};
      deleteResumeRecord(resumeKey);
    }

	    if (!uploadId) {
	      let createRes: Response;
	      try {
	        createRes = await fetchWithAuth("/api/multipart", {
	          method: "POST",
	          body: JSON.stringify({ action: "create", bucket, key, contentType: file.type }),
	        });
	      } catch (err: unknown) {
	        const msg = err instanceof Error ? err.message : String(err);
	        throw new Error(`创建分片上传失败：${msg}`);
	      }
	      const createData = await readJsonSafe(createRes);
	      if (!createRes.ok || !createData.uploadId) {
          throw new Error(toChineseErrorMessage(createData.error, `创建分片上传失败（状态码：${createRes.status}）`));
        }
	      uploadId = createData.uploadId as string;
	      partsMap = {};
	      partSize = pickPartSize(file.size);
	    }

    updateUploadTask(taskId, (t) => ({
      ...t,
      resumeKey,
      multipart: { uploadId: uploadId as string, partSize, parts: partsMap },
    }));

    upsertResumeRecord(resumeKey, {
      bucket,
      key,
      size: file.size,
      lastModified: file.lastModified,
      name: file.name,
      uploadId: uploadId as string,
      partSize,
      parts: partsMap,
    });

    const partCount = Math.ceil(file.size / partSize);
    const partLoaded = new Map<number, number>();

    const concurrency = Math.min(6, partCount);
    let nextPart = 1;
    let aborted = false;

    const uploadPart = async (partNumber: number) => {
      // Skip uploaded parts (resume).
      if (partsMap[String(partNumber)]) return;
      const start = (partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      const blob = file.slice(start, end);

	      let signRes: Response;
	      try {
	        signRes = await fetchWithAuth("/api/multipart", {
	          method: "POST",
	          body: JSON.stringify({ action: "signPart", bucket, key, uploadId, partNumber }),
	        });
	      } catch (err: unknown) {
	        const msg = err instanceof Error ? err.message : String(err);
	        throw new Error(`获取分片上传签名失败：${msg}`);
	      }
	      const signData = await readJsonSafe(signRes);
	      if (!signRes.ok || !signData.url) {
          throw new Error(toChineseErrorMessage(signData.error, `分片签名失败（状态码：${signRes.status}）`));
        }

      const completedBytes = Object.keys(partsMap).reduce((acc, pn) => {
        const n = Number.parseInt(pn, 10);
        if (!Number.isFinite(n) || n <= 0) return acc;
        const s = (n - 1) * partSize;
        const e = Math.min(file.size, s + partSize);
        return acc + Math.max(0, e - s);
      }, 0);

      const { etag } = await xhrPut(signData.url, blob, file.type, (loaded, total) => {
        partLoaded.set(partNumber, loaded);
        const sumLoaded = Array.from(partLoaded.values()).reduce((a, b) => a + b, 0);
        onLoaded(Math.min(file.size, completedBytes + sumLoaded));
        if (loaded === total) partLoaded.set(partNumber, total);
      }, signal);
      if (!etag) throw new Error("上传响应缺少 ETag");
      partsMap[String(partNumber)] = etag;

      updateUploadTask(taskId, (t) =>
        t.multipart
          ? { ...t, multipart: { ...t.multipart, parts: { ...t.multipart.parts, [String(partNumber)]: etag } } }
          : t,
      );

      upsertResumeRecord(resumeKey, {
        bucket,
        key,
        size: file.size,
        lastModified: file.lastModified,
        name: file.name,
        uploadId: uploadId as string,
        partSize,
        parts: partsMap,
      });
    };

    const worker = async () => {
      for (;;) {
        if (aborted) return;
        const partNumber = nextPart++;
        if (partNumber > partCount) return;
        await uploadPart(partNumber);
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, partCount) }, worker));
      const parts = Object.entries(partsMap)
        .map(([pn, etag]) => ({ partNumber: Number.parseInt(pn, 10), etag }))
        .filter((p) => Number.isFinite(p.partNumber) && p.partNumber > 0)
        .sort((a, b) => a.partNumber - b.partNumber);
	      let completeRes: Response;
	      try {
	        completeRes = await fetchWithAuth("/api/multipart", {
	          method: "POST",
	          body: JSON.stringify({ action: "complete", bucket, key, uploadId, parts }),
	        });
	      } catch (err: unknown) {
	        const msg = err instanceof Error ? err.message : String(err);
	        throw new Error(`完成分片上传失败：${msg}`);
	      }
	      const completeData = await readJsonSafe(completeRes);
	      if (!completeRes.ok) {
          throw new Error(toChineseErrorMessage(completeData.error, `完成分片上传失败（状态码：${completeRes.status}）`));
        }
	      deleteResumeRecord(resumeKey);
    } catch (err) {
      aborted = true;
      const current = uploadTasksRef.current.find((t) => t.id === taskId);
      const status = current?.status;
      const abortedByUser = signal?.aborted === true;
      if (abortedByUser && status === "paused") {
        // Keep uploadId/parts for resume.
      } else if (abortedByUser && status === "canceled") {
        await fetchWithAuth("/api/multipart", {
          method: "POST",
          body: JSON.stringify({ action: "abort", bucket, key, uploadId }),
        }).catch(() => {});
        deleteResumeRecord(resumeKey);
      } else {
        // Keep resume record on transient errors; user can retry/resume.
      }
      throw err;
    }
  };

  const updateUploadTask = (id: string, updater: (t: UploadTask) => UploadTask) => {
    setUploadTasks((prev) => prev.map((t) => (t.id === id ? updater(t) : t)));
  };

  const pauseUploadTask = (id: string) => {
    setUploadTasks((prev) =>
      prev.map((t) => (t.id === id && t.status === "uploading" ? { ...t, status: "paused", speedBps: 0 } : t)),
    );
    setUploadQueuePaused(true);
    uploadControllersRef.current.get(id)?.abort();
    setToast("已暂停（可继续续传）");
  };

  const resumeUploadTask = (id: string) => {
    setUploadTasks((prev) =>
      prev.map((t) =>
        t.id === id && (t.status === "paused" || t.status === "error")
          ? { ...t, status: "queued", speedBps: 0, startedAt: undefined, error: undefined }
          : t,
      ),
    );
    setUploadQueuePaused(false);
    setTimeout(() => processUploadQueue(), 0);
  };

  const abortMultipartForTask = async (taskId: string) => {
    const t = uploadTasksRef.current.find((x) => x.id === taskId);
    if (!t?.multipart?.uploadId) return;
    try {
      await fetchWithAuth("/api/multipart", {
        method: "POST",
        body: JSON.stringify({ action: "abort", bucket: t.bucket, key: t.key, uploadId: t.multipart.uploadId }),
      });
    } catch {
      // ignore
    } finally {
      if (t.resumeKey) deleteResumeRecord(t.resumeKey);
    }
  };

  const cancelUploadTask = (id: string) => {
    setUploadTasks((prev) =>
      prev.map((t) => (t.id === id && (t.status === "queued" || t.status === "uploading" || t.status === "paused") ? { ...t, status: "canceled", speedBps: 0 } : t)),
    );
    uploadControllersRef.current.get(id)?.abort();
    void abortMultipartForTask(id);
    setToast("已取消");
  };

  const processUploadQueue = async () => {
    if (uploadProcessingRef.current) return;
    if (uploadQueuePausedRef.current) return;
    uploadProcessingRef.current = true;
    try {
      for (;;) {
        if (uploadQueuePausedRef.current) break;
        const next = uploadTasksRef.current.find((t) => t.status === "queued");
        if (!next) break;

        const controller = new AbortController();
        uploadControllersRef.current.set(next.id, controller);

        updateUploadTask(next.id, (t) => ({
          ...t,
          status: "uploading",
          startedAt: performance.now(),
          loaded: typeof t.loaded === "number" && t.loaded > 0 ? t.loaded : 0,
          speedBps: 0,
          error: undefined,
        }));

        // Prefer multipart for most files to improve throughput on some networks/regions.
        // Keep small files as single PUT to reduce overhead.
        const threshold = 70 * 1024 * 1024;
        const uploadFn = next.file.size >= threshold ? uploadMultipartFile : uploadSingleFile;

        let lastAt = performance.now();
        let lastLoaded = next.loaded ?? 0;

        try {
          await uploadFn(next.id, next.bucket, next.key, next.file, (loaded) => {
            const now = performance.now();
            const deltaBytes = Math.max(0, loaded - lastLoaded);
            const deltaSec = Math.max(0.25, (now - lastAt) / 1000);
            const speedBps = deltaBytes / deltaSec;
            lastAt = now;
            lastLoaded = loaded;

            updateUploadTask(next.id, (t) => ({
              ...t,
              loaded,
              speedBps: Number.isFinite(speedBps) ? speedBps : 0,
            }));
          }, controller.signal);

          updateUploadTask(next.id, (t) => ({ ...t, status: "done", loaded: t.file.size, speedBps: 0, multipart: undefined }));
          if (selectedBucket === next.bucket) fetchFiles(next.bucket, path);
          if (next.resumeKey) deleteResumeRecord(next.resumeKey);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const current = uploadTasksRef.current.find((t) => t.id === next.id);
          if (current?.status === "paused" || current?.status === "canceled") {
            // keep status
          } else {
            updateUploadTask(next.id, (t) => ({ ...t, status: "error", error: message, speedBps: 0 }));
          }
        } finally {
          uploadControllersRef.current.delete(next.id);
        }
      }
    } finally {
      uploadProcessingRef.current = false;
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedBucket) return;
    const filesToUpload = Array.from(e.target.files);
    const prefix = path.length > 0 ? path.join("/") + "/" : "";

    const newTasks: UploadTask[] = filesToUpload.map((file) => ({
      id: (globalThis.crypto?.randomUUID?.() as string | undefined) ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      bucket: selectedBucket,
      file,
      key: prefix + file.name,
      resumeKey: getResumeKey(selectedBucket, prefix + file.name, file),
      loaded: 0,
      speedBps: 0,
      status: "queued",
    }));

    setUploadTasks((prev) => [...newTasks, ...prev].slice(0, 50));
    setUploadPanelOpen(true);
    setToast(`已加入 ${newTasks.length} 个上传任务`);

    if (fileInputRef.current) fileInputRef.current.value = "";
    setTimeout(() => processUploadQueue(), 0);
  };

  // --- 视图数据处理 ---
  const filteredFiles = useMemo(() => {
    const term = searchTerm.trim();
    const base = term ? searchResults : files;
    const list = [...base];

    const textCmp = (a: string, b: string) => a.localeCompare(b, "zh-CN", { numeric: true, sensitivity: "base" });
    const typeRank = (item: FileItem) => (item.type === "folder" ? 0 : 1);
    const fileExt = (item: FileItem) => (item.type === "file" ? getFileExt(item.name) : "");
    const ts = (item: FileItem) => {
      const n = Date.parse(item.lastModified ?? "");
      return Number.isFinite(n) ? n : -1;
    };
    const direction = fileSortDirection === "asc" ? 1 : -1;

    list.sort((a, b) => {
      const rankDiff = typeRank(a) - typeRank(b);
      if (rankDiff !== 0) return rankDiff;

      if (fileSortKey === "size") {
        if (a.type === "file" && b.type === "file") {
          const bySize = (a.size ?? 0) - (b.size ?? 0);
          if (bySize !== 0) return bySize * direction;
        }
        return textCmp(a.name, b.name) * direction;
      }

      if (fileSortKey === "type") {
        if (a.type === "file" && b.type === "file") {
          const byExt = textCmp(fileExt(a), fileExt(b));
          if (byExt !== 0) return byExt * direction;
        }
        return textCmp(a.name, b.name) * direction;
      }

      if (fileSortKey === "time") {
        const byTime = ts(a) - ts(b);
        if (byTime !== 0) return byTime * direction;
        return textCmp(a.name, b.name) * direction;
      }

      return textCmp(a.name, b.name) * direction;
    });

    return list;
  }, [fileSortDirection, fileSortKey, files, searchResults, searchTerm]);

  const uploadSummary = useMemo(() => {
    const totalBytes = uploadTasks.reduce((acc, t) => acc + t.file.size, 0);
    const loadedBytes = uploadTasks.reduce((acc, t) => acc + Math.min(t.loaded, t.file.size), 0);
    const active = uploadTasks.filter((t) => t.status === "queued" || t.status === "uploading").length;
    const speedBps = uploadTasks.reduce((acc, t) => acc + (t.status === "uploading" ? t.speedBps : 0), 0);
    const pct = totalBytes ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
    return {
      active,
      total: uploadTasks.length,
      pct,
      speedText: formatSpeed(speedBps),
    };
  }, [uploadTasks]);

  const currentViewStats = useMemo(() => {
    const fileCount = files.filter(f => f.type === "file").length;
    const folderCount = files.filter(f => f.type === "folder").length;
    const totalSize = files.reduce((acc, curr) => acc + (curr.size || 0), 0);
    return { fileCount, folderCount, totalSize };
  }, [files]);

  const getIcon = (type: string, name: string, size: "lg" | "sm" = "lg") => {
    const cls = size === "lg" ? "w-8 h-8" : "w-5 h-5";
    if (type === "folder") return <Folder className={`${cls} text-yellow-500 ${size === "lg" ? "fill-yellow-500/20" : ""}`} />;
    const lower = name.toLowerCase();
    const ext = getFileExt(name);
    if (/\.(jpg|png|gif|webp|svg)$/.test(lower)) return <ImageIcon className={`${cls} text-purple-500`} />;
    if (/\.(mp4|mov|mkv|webm)$/.test(lower)) return <Video className={`${cls} text-red-500`} />;
    if (/\.(mp3|wav|flac|ogg)$/.test(lower)) return <Music className={`${cls} text-blue-500`} />;
    if (/(zip|rar|7z|tar|gz|bz2|xz)$/.test(ext)) return <FileArchive className={`${cls} text-amber-600`} />;
    if (/(xls|xlsx|csv)$/.test(ext)) return <FileSpreadsheet className={`${cls} text-emerald-600`} />;
    if (ext === "json") return <FileJson className={`${cls} text-orange-600`} />;
    if (ext === "pdf") return <FileType className={`${cls} text-rose-600`} />;
    if (/(doc|docx|ppt|pptx)$/.test(ext)) return <FileType className={`${cls} text-sky-600`} />;
    if (/(apk|ipa|dmg|pkg|exe|msi|deb|rpm)$/.test(ext)) return <FileType className={`${cls} text-slate-600`} />;
    if (/(ts|tsx|js|jsx|css|html|xml|yml|yaml|md|txt|log|sh|bash|py|go|rs|java|kt|c|cpp|h|hpp)$/.test(ext))
      return <FileCode className={`${cls} text-indigo-600`} />;
    return <FileText className={`${cls} text-gray-400`} />;
  };

  // --- 渲染：登录界面 ---
  if (authRequired) {
    const showAnnouncementPanel = !isMobile || loginAnnouncementOpen;
    const authLoadingText = registerOpen ? "正在提交注册信息" : "正在验证账号信息";
    const legalDocs = LEGAL_DOCS;
    const legalDocsReady = LEGAL_TAB_ORDER.every((tab) => legalDocs[tab].trim().length > 0);
    const activeLegalDoc = legalDocs[legalActiveTab].replace(/^\s*#{1,6}\s*/gm, "");
    return (
	      <div
	        className={`bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 px-4 sm:px-6 font-sans text-gray-900 dark:text-gray-100 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] ${
	          isMobile
              ? showAnnouncementPanel
                ? "min-h-dvh overflow-y-auto"
                : "min-h-dvh flex items-center justify-center"
              : "h-dvh overflow-hidden flex items-center justify-center"
	        }`}
	      >
	        <div
	          className={`w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-6 ${
	            isMobile ? (showAnnouncementPanel ? "h-auto items-start" : "h-auto items-center") : "h-full min-h-0 items-stretch"
	          }`}
	        >
          {/* 左侧：公告与说明 */}
          <section
            className={`min-h-0 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col order-2 lg:order-1 dark:border-gray-800 dark:bg-gray-900 ${
              showAnnouncementPanel ? "" : "hidden"
            }`}
          >
            <div className="px-8 py-7 h-[168px] bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center">
              <div className="w-full">
                <div className="text-sm font-medium text-white/85">{LOGIN_PAGE.title}</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">公告与说明</h1>
                <p className="mt-2 text-white/80">{LOGIN_PAGE.subtitle}</p>
              </div>
            </div>

            <div className={["px-8 py-6 flex flex-col gap-5", isMobile ? "" : "grow overflow-y-auto"].filter(Boolean).join(" ")}>
              <div>
                <div className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">平台优势</div>
                <ul className="mt-3 space-y-2 text-sm text-gray-800 dark:text-gray-200">
                  {LOGIN_PAGE.advantages.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-600 flex-none" />
                      <span className="leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">{LOGIN_PAGE.announcementTitle}</div>
                <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-200">
                  {LOGIN_PAGE.announcementText}
                </div>
              </div>

              <div className="mt-auto">
                <div className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">导航</div>
                <nav className="mt-3 grid grid-cols-4 gap-2">
                  {LOGIN_LINKS.map((l) => {
                    const icon =
                      l.icon === "globe" ? (
                        <Globe className="w-5 h-5" />
                      ) : l.icon === "book" ? (
                        <BookOpen className="w-5 h-5" />
                      ) : l.icon === "about" ? (
                        <BadgeInfo className="w-5 h-5" />
                      ) : (
                        <Mail className="w-5 h-5" />
                      );

                    return (
                      <a
                        key={l.href}
                        href={l.href}
                        target={l.href.startsWith("mailto:") ? undefined : "_blank"}
                        rel={l.href.startsWith("mailto:") ? undefined : "noreferrer"}
                        className="group rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors px-2 py-3 flex flex-col items-center justify-center gap-2 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900"
                      >
                        <div className="text-gray-700 group-hover:text-blue-600 transition-colors dark:text-gray-200 dark:group-hover:text-blue-300">
                          {icon}
                        </div>
                        <div className="text-[12px] text-gray-700 group-hover:text-blue-600 transition-colors dark:text-gray-200 dark:group-hover:text-blue-300">
                          {l.label}
                        </div>
                      </a>
                    );
                  })}
                </nav>

                <div className="mt-6 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{LOGIN_PAGE.footer}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Serverless
                  </span>
                </div>
              </div>
            </div>
          </section>

	          {/* 右侧：登录模块 */}
			          <section className="relative min-h-0 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col order-1 lg:order-2 dark:border-gray-800 dark:bg-gray-900">
		            <div className="px-6 py-4 sm:px-8 sm:py-7 sm:h-[168px] bg-blue-600 text-white flex items-center shrink-0">
		              <div className="flex items-center gap-4 w-full">
		                <div className="h-16 w-16 flex items-center justify-center shrink-0">
		                  <BrandMark className="w-16 h-16" />
		                </div>
		                <div>
		                  <div className="text-2xl font-semibold leading-tight">{LOGIN_PAGE.title}</div>
			                  <div className="mt-1 text-[17px] text-white/80">{LOGIN_PAGE.subtitle}</div>
		                </div>
		              </div>
		            </div>

			            <div className={["px-8 py-7 flex flex-col gap-5", isMobile ? "" : "grow overflow-y-auto"].filter(Boolean).join(" ")}>
			              <div className="mx-auto w-full max-w-sm">
                      <div className="relative grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-950/40">
                        <span
                          aria-hidden="true"
                          className={`absolute left-1 top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-blue-600 transition-transform duration-300 ease-out ${
                            registerOpen ? "translate-x-full" : "translate-x-0"
                          }`}
                        />
		                        <button
		                          type="button"
                              disabled={loading}
		                          onClick={() => {
	                              setRegisterOpen(false);
	                              setLoginNotice("");
	                            }}
		                          className={`relative z-10 rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
		                            registerOpen ? "text-gray-600 dark:text-gray-300" : "text-white"
		                          }`}
	                        >
                          登陆
                        </button>
		                        <button
		                          type="button"
                              disabled={loading}
		                          onClick={() => {
	                              setRegisterOpen(true);
	                              setLoginNotice("");
	                            }}
		                          className={`relative z-10 rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
		                            registerOpen ? "text-white" : "text-gray-600 dark:text-gray-300"
		                          }`}
	                        >
                          注册
                        </button>
                      </div>
			              </div>

			              <div className="text-center">
			                <h2 className="text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                        {registerOpen ? "账号注册" : "账号登录"}
                      </h2>
			              </div>

                    <div>
                      {registerOpen ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleRegister(e);
                          }}
                          className="flex h-full flex-col"
                        >
                          <div className="space-y-5">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">邮箱账号</label>
                              <input
                                type="email"
                                value={registerEmail}
                                onChange={(e) => {
                                  setRegisterEmail(e.target.value);
                                  setRegisterNotice("");
                                }}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                placeholder="请输入邮箱"
                              />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">登录密码</label>
                                <div className="relative">
                                  <input
                                    type={showRegisterSecret ? "text" : "password"}
                                    value={registerPassword}
                                    onChange={(e) => {
                                      setRegisterPassword(e.target.value);
                                      setRegisterNotice("");
                                    }}
                                    className="w-full px-4 py-3 pr-10 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                    placeholder="至少六位密码"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowRegisterSecret((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                                    aria-label={showRegisterSecret ? "隐藏密码" : "显示密码"}
                                  >
                                    {showRegisterSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                  </button>
                                </div>
                              </div>
                              <div>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">邮箱验证码</label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleSendRegisterCode();
                                    }}
                                    disabled={loading || registerCodeCooldown > 0}
                                    className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed dark:text-blue-300 dark:hover:text-blue-200 dark:disabled:text-gray-500"
                                  >
                                    {registerCodeCooldown > 0 ? `${registerCodeCooldown}s 后重发` : "发送验证码"}
                                  </button>
                                </div>
                                <div>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={registerCode}
                                    onChange={(e) => {
                                      setRegisterCode(e.target.value.replace(/\s+/g, ""));
                                      setRegisterNotice("");
                                    }}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                    placeholder="请输入邮箱验证码"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2 py-0 min-h-9">
                              <input
                                type="checkbox"
                                id="register_agree"
                                checked={registerAgree}
                                onChange={(e) => {
                                  setRegisterAgree(e.target.checked);
                                  setRegisterNotice("");
                                }}
                                className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-700"
                              />
                              <div className="block text-sm leading-5 text-gray-600 dark:text-gray-300">
                                <label htmlFor="register_agree" className="cursor-pointer">
                                  我已阅读并同意
                                </label>
                                <span>「</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openLegalModal("terms");
                                  }}
                                  className="text-gray-700 hover:text-blue-600 transition-colors dark:text-gray-200 dark:hover:text-blue-300"
                                >
                                  用户协议
                                </button>
                                <span>」和「</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openLegalModal("privacy");
                                  }}
                                  className="text-gray-700 hover:text-blue-600 transition-colors dark:text-gray-200 dark:hover:text-blue-300"
                                >
                                  隐私政策
                                </button>
                                <span>」</span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 space-y-3">
                            <div className="relative h-6">
                              {registerNotice ? (
                                <div className="absolute inset-x-0 -top-1 text-sm text-red-600 leading-tight text-left dark:text-red-300">{registerNotice}</div>
                              ) : null}
                            </div>
	                            <button
	                              type="submit"
                                disabled={loading}
	                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-blue-500/20 shadow-lg inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-blue-500/75"
	                            >
                                {loading ? (
                                  <>
                                    <LoaderOrbit className="h-5 w-5" />
                                    <span className="inline-flex items-center gap-2">
                                      正在注册
                                      <LoaderDots />
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-5 h-5" />
                                    验证并注册
                                  </>
                                )}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form onSubmit={handleLogin} className="flex h-full flex-col">
                          <div className="space-y-5">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">邮箱账号</label>
                              <input
                                type="email"
                                value={formEmail}
                                onChange={(e) => {
                                  setFormEmail(e.target.value);
                                  setLoginNotice("");
                                }}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                placeholder="请输入邮箱"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">登录密码</label>
                              <div className="relative">
                                <input
                                  type={showSecret ? "text" : "password"}
                                  value={formPassword}
                                  onChange={(e) => {
                                    setFormPassword(e.target.value);
                                    setLoginNotice("");
                                  }}
                                  className="w-full px-4 py-3 pr-10 rounded-lg border border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                  placeholder="请输入密码"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowSecret((v) => !v)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                                  aria-label={showSecret ? "隐藏密码" : "显示密码"}
                                >
                                  {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                              </div>
                            </div>

                            <div className="flex items-start justify-between gap-3 py-0 min-h-9">
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  id="remember"
                                  checked={rememberMe}
                                  onChange={(e) => setRememberMe(e.target.checked)}
                                  className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-700"
                                />
                                <label htmlFor="remember" className="block text-sm leading-5 text-gray-600 dark:text-gray-300">
                                  记住登录状态
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setForgotEmail(formEmail.trim());
                                  setForgotCode("");
                                  setForgotNotice("");
                                  setForgotOpen(true);
                                }}
                                className="shrink-0 text-sm leading-5 text-gray-600 hover:text-blue-700 transition-colors dark:text-gray-300 dark:hover:text-blue-200"
                              >
                                忘记密码
                              </button>
                            </div>
                          </div>

                          <div className="pt-2 space-y-3">
                            <div className="relative h-6">
                              {loginNotice ? (
                                <div className="absolute inset-x-0 -top-1 text-sm text-red-600 leading-tight text-left dark:text-red-300">{loginNotice}</div>
                              ) : null}
                            </div>

	                            <button
	                              type="submit"
                                disabled={loading}
	                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors shadow-blue-500/20 shadow-lg inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-blue-500/75"
	                            >
                                {loading ? (
                                  <>
                                    <LoaderOrbit className="h-5 w-5" />
                                    <span className="inline-flex items-center gap-2">
                                      正在登录
                                      <LoaderDots />
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-5 h-5" />
                                    进入管理
                                  </>
                                )}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => setLoginAnnouncementOpen((v) => !v)}
                        className="mt-1 inline-flex w-fit self-start items-center gap-1.5 px-0 py-0 text-xs font-medium text-gray-500 hover:text-blue-600 transition-colors dark:text-gray-400 dark:hover:text-blue-300"
                      >
                        {loginAnnouncementOpen ? "收起「公告与说明」" : "展开「公告与说明」"}
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${loginAnnouncementOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    ) : null}
				            </div>

                  {loading ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[2px] dark:bg-gray-900/70">
                      <div className="inline-flex items-center gap-3 rounded-2xl border border-cyan-200/70 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-lg dark:border-cyan-900/60 dark:bg-slate-900/90 dark:text-slate-100">
                        <LoaderOrbit className="h-5 w-5" />
                        <span className="inline-flex items-center gap-2">
                          {authLoadingText}
                          <LoaderDots />
                        </span>
                      </div>
                    </div>
                  ) : null}
		          </section>
        </div>

        <Modal
          open={forgotOpen}
          title="找回密码"
          description="输入注册邮箱并验证邮箱验证码，验证后可设置新密码。"
          onClose={() => setForgotOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setForgotOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                取消
              </button>
              <button
                onClick={() => {
                  void handleVerifyRecoveryCode();
                }}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                验证并继续
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">注册邮箱</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => {
                  setForgotEmail(e.target.value);
                  setForgotNotice("");
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="请输入注册邮箱"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">邮箱验证码</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={forgotCode}
                  onChange={(e) => {
                    setForgotCode(e.target.value.replace(/\s+/g, ""));
                    setForgotNotice("");
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                  placeholder="请输入重置验证码"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleSendRecoveryCode();
                  }}
                  disabled={loading || forgotCodeCooldown > 0}
                  className="shrink-0 px-3.5 py-2.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/40"
                >
                  {forgotCodeCooldown > 0 ? `${forgotCodeCooldown}s` : "发送验证码"}
                </button>
              </div>
            </div>
            {forgotNotice ? (
              <div className="text-sm text-red-600 dark:text-red-300">{forgotNotice}</div>
            ) : null}
          </div>
        </Modal>

        <Modal
          open={resetPasswordOpen}
          title="设置新密码"
          description="请设置新的登录密码，设置完成后使用新密码登录。"
          onClose={() => setResetPasswordOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetPasswordOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                稍后再说
              </button>
              <button
                onClick={() => {
                  void handleResetPasswordFromRecovery();
                }}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                保存新密码
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">新密码</label>
              <input
                type="password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="至少六位密码"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">确认新密码</label>
              <input
                type="password"
                value={resetPasswordConfirmValue}
                onChange={(e) => setResetPasswordConfirmValue(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="再次输入新密码"
              />
            </div>
          </div>
        </Modal>

        <Modal
          open={legalModalOpen}
          title="服务条款与政策"
          description="请阅读并确认相关条款内容。"
          onClose={() => setLegalModalOpen(false)}
          closeOnBackdropClick={false}
          panelClassName="max-w-4xl"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  window.location.assign("/404");
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                不同意
              </button>
              <button
                onClick={() => {
                  setRegisterAgree(true);
                  setRegisterNotice("");
                  setLegalModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                我已阅读并理解全部条款
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {LEGAL_TAB_ORDER.map((tab) => {
                const active = legalActiveTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setLegalActiveTab(tab)}
                    className={[
                      "rounded-lg px-3 py-2 text-sm font-medium border transition-colors",
                      active
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-200"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {LEGAL_TAB_LABELS[tab]}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap break-words min-h-[24rem] dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-200">
              {legalDocsReady ? (
                activeLegalDoc
              ) : (
                <div className="text-gray-500 dark:text-gray-400">暂无内容</div>
              )}
            </div>
          </div>
        </Modal>

        {ToastView}
      </div>
    );
  }

		  // --- 渲染：主界面 ---
		  const getBucketLabel = (bucketId: string | null | undefined) => {
		    if (!bucketId) return "";
		    const found = buckets.find((b) => b.id === bucketId);
		    return found?.Name || bucketId;
		  };

	  const selectedBucketDisplayName = selectedBucket ? getBucketLabel(selectedBucket) : null;
      const dashboardLoadingText = fileListLoading
        ? "正在加载文件列表"
        : searchLoading
          ? "正在搜索对象"
          : "正在处理请求";
      const showWorkingBadge = loading || searchLoading || fileListLoading;
      const bucketDeleteTargetMeta = bucketDeleteTargetId ? buckets.find((b) => b.id === bucketDeleteTargetId) ?? null : null;
      const isNewBucket = !editingBucketId;
      const findBucketById = (bucketId: string | null | undefined) => {
        if (!bucketId) return null;
        return buckets.find((b) => b.id === bucketId) ?? null;
      };

		  const selectBucket = (bucketId: string) => {
		    setSelectedBucket(bucketId);
	    setPath([]);
	    setSearchTerm("");
    setSelectedItem(null);
	    setSelectedKeys(new Set());
	    setBucketMenuOpen(false);
	    if (isMobile) setMobileNavOpen(false);
		    setToast(`已切换到：${getBucketLabel(bucketId)}`);
		  };

		      const openAddBucket = () => {
          setAccountCenterOpen(false);
          setEditingBucketId(null);
          setBucketFormErrors({});
	        resetBucketForm();
	        setAddBucketOpen(true);
	      };

      const openEditBucket = (bucketId?: string) => {
        const target = findBucketById(bucketId ?? selectedBucket);
        if (!target) {
          setToast("请先选择要编辑的存储桶");
          return;
        }
        setAccountCenterOpen(false);
        setEditingBucketId(target.id);
        setBucketFormErrors({});
        setBucketForm({
          bucketLabel: target.Name ?? "",
          bucketName: target.bucketName ?? "",
          accountId: target.accountId ?? "",
          accessKeyId: "",
          secretAccessKey: "",
          publicBaseUrl: target.publicBaseUrl ?? "",
          customBaseUrl: target.customBaseUrl ?? "",
        });
        setAddBucketOpen(true);
      };

      const openDeleteBucketConfirm = (bucketId: string) => {
        const target = findBucketById(bucketId);
        if (!target) {
          setToast("未找到要删除的存储桶");
          return;
        }
        setBucketDeleteTargetId(target.id);
        setBucketDeleteOpen(true);
      };

	  const SidebarPanel = ({ onClose }: { onClose?: () => void }) => (
	    <div
	      className={`h-full w-full bg-white border-r border-gray-200 flex flex-col dark:bg-gray-900 dark:border-gray-800 ${
	        onClose ? "shadow-sm" : ""
	      }`}
	    >
	      <div className="h-16 px-5 border-b border-gray-100 flex items-center justify-between gap-3 dark:border-gray-800">
	        <div className="flex items-center gap-3 min-w-0">
		          <BrandMark className="w-10 h-10 md:w-11 md:h-11 shrink-0" />
		          <div className="min-w-0">
				            <h1 className="font-bold text-[18px] leading-[1.15] tracking-tight text-blue-600 truncate dark:text-blue-400">{LOGIN_PAGE.title}</h1>
	            <p className="mt-0.25 text-[13px] leading-[1.1] text-gray-400 font-medium truncate dark:text-gray-400">{LOGIN_PAGE.subtitle}</p>
		          </div>
	        </div>
	        <div className="flex items-center gap-1">
	          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="关闭菜单"
            >
              <X className="w-5 h-5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="p-3 space-y-3 shrink-0">
          <div className="px-1">
	            <div className="flex items-center justify-between gap-2">
	              <div className="text-xs font-semibold text-gray-500 uppercase px-2 tracking-wider leading-none dark:text-gray-400">存储桶</div>
	              <div className="flex items-center gap-1">
	                <button
	                  type="button"
	                  onClick={() => {
	                    void fetchBuckets();
                    setToast("已刷新桶列表");
                  }}
                  className="px-2 py-1 rounded-md text-xs font-medium text-blue-600 hover:bg-blue-50 leading-none dark:text-blue-300 dark:hover:bg-blue-950/30"
                  title="刷新桶列表"
                  aria-label="刷新桶列表"
                >
                  刷新
                </button>
              </div>
            </div>

	            <div ref={bucketMenuRef} className="relative mt-2">
                <button
                  type="button"
                  onClick={() => setBucketMenuOpen((v) => !v)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 flex items-center justify-between gap-3"
                  aria-haspopup="listbox"
                  aria-expanded={bucketMenuOpen}
                >
	                  <span className="truncate">
	                    {selectedBucket ? getBucketLabel(selectedBucket) : "选择存储桶"}
	                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                      bucketMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {bucketMenuOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden dark:border-gray-800 dark:bg-gray-900">
                    <div className="max-h-[40vh] overflow-auto p-2">
                      {buckets.length ? (
                        buckets.map((bucket) => (
                          <button
                            key={bucket.id}
                            type="button"
                            onClick={() => selectBucket(bucket.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                              selectedBucket === bucket.id
                                ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/40 dark:text-blue-200"
                                : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            }`}
                          >
                            <div
                              className={`w-2 h-2 rounded-full ${
                                selectedBucket === bucket.id ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-700"
                              }`}
                            ></div>
	                            <span className="truncate">{getBucketLabel(bucket.id)}</span>
	                          </button>
	                        ))
                      ) : (
                        <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">暂无桶</div>
                      )}
                    </div>
                  </div>
		                ) : null}
		              </div>

              <div className="mt-2 text-[10px] text-gray-500 px-1 leading-relaxed dark:text-gray-400">
                桶管理入口已移至底部「当前登陆账号」模块。
              </div>
	          </div>
	        </div>

        <div className="flex-1" />

        <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3 dark:border-gray-800 dark:bg-gray-950/30 shrink-0">
        <div
          className={`text-xs px-3 py-2 rounded-md border ${
            connectionStatus === "connected"
              ? "bg-green-50 text-green-700 border-green-100 dark:bg-green-950/40 dark:text-green-200 dark:border-green-900"
              : connectionStatus === "checking"
                ? "bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-950/35 dark:text-yellow-200 dark:border-yellow-900"
                : connectionStatus === "unbound"
                  ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900"
                  : "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900"
          }`}
        >
	          <div className="flex items-center gap-2">
	            <WifiMark className="w-3 h-3" />
	            <span className="font-medium">
	              {connectionStatus === "connected"
	                ? "连接状态正常"
	                : connectionStatus === "checking"
	                  ? "连接中..."
	                  : connectionStatus === "unbound"
                    ? "未绑定存储桶"
                    : "连接异常"}
            </span>
	          </div>
		          {connectionStatus === "connected"
		            ? (() => {
		                const mode = selectedBucket ? buckets.find((b) => b.id === selectedBucket)?.transferMode : undefined;
		                const cfg = selectedBucket ? getLinkConfig(selectedBucket) : undefined;
		                const s3BucketName = String(cfg?.s3BucketName ?? "").trim();
		                const s3Check = selectedBucket ? getS3BucketNameCheck(selectedBucket) : null;
                    const overrideMode = selectedBucket ? getTransferModeOverride(selectedBucket) : "auto";

		                let line2 = "当前传输通道：未检测";
		                let line3: string | null = null;
                    const suffix = overrideMode === "auto" ? "" : "（手动）";

			                if (mode === "presigned") {
			                  line2 = overrideMode === "proxy" ? `当前传输通道：Pages 代理${suffix}` : `当前传输通道：R2 直连${suffix}`;
			                  if (s3BucketName) {
			                    if (!s3Check) line3 = null;
			                    else if (s3Check.ok) line3 = null;
			                    else line3 = `桶名校验失败：${s3BucketName}，${s3Check.hint || "请检查桶名"}（已忽略此桶名设置）`;
			                  }
			                } else if (mode === "presigned_needs_bucket_name") {
		                  if (!s3BucketName) {
		                    line2 = overrideMode === "presigned" ? `当前传输通道：Pages 代理${suffix}` : `当前传输通道：Pages 代理${suffix}`;
		                    line3 = "已配置 R2 直连，如需启动 R2 直连，请先在「编辑桶」中确认桶名并完成校验。";
		                  } else if (!s3Check) {
		                    line2 = overrideMode === "proxy" ? `当前传输通道：Pages 代理${suffix}` : `当前传输通道：R2 直连${suffix}`;
		                    line3 = null;
			                  } else if (s3Check.ok) {
			                    line2 = overrideMode === "proxy" ? `当前传输通道：Pages 代理${suffix}` : `当前传输通道：R2 直连${suffix}`;
			                    line3 = null;
			                  } else {
			                    line2 = `当前传输通道：Pages 代理${suffix}`;
			                    line3 = `桶名校验失败：${s3BucketName}${s3Check.hint || "请检查桶名"}，无法启用「R2 直连」，已回退至「Pages 代理」`;
			                  }
			                } else if (mode === "proxy") {
		                  line2 = `当前传输通道：Pages 代理${suffix}`;
		                }

		                return (
		                  <>
		                    <div className="mt-1 text-[11px] leading-relaxed opacity-80">{line2}</div>
		                    {line3 ? <div className="mt-1 text-[10px] leading-relaxed opacity-80">{line3}</div> : null}
		                  </>
		                );
		              })()
		            : null}

		          {connectionDetail && !fileListError ? (
		            <div className="mt-1 text-[10px] leading-relaxed opacity-80">{connectionDetail}</div>
		          ) : null}
	        </div>

	          {connectionStatus === "connected" && selectedBucket ? (
	            <div className="px-3 py-2 rounded-md border border-gray-200 bg-white text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
	              <div className="flex items-center justify-between gap-2">
	                <span className="font-medium truncate">选择传输通道</span>
                  {(() => {
                    const current = getTransferModeOverride(selectedBucket);
                    const canUsePresigned = buckets.find((b) => b.id === selectedBucket)?.transferMode !== "proxy";
                    const label = current === "auto" ? "自动" : current === "presigned" ? "R2 直连" : "Pages 代理";
		                    return (
		                      <div ref={transferModeMenuRef} className="relative">
		                        <button
		                          type="button"
		                          onClick={() => setTransferModeMenuOpen((v) => !v)}
	                          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
	                          aria-haspopup="listbox"
	                          aria-expanded={transferModeMenuOpen}
	                          title="选择传输通道"
	                        >
                          <span className="leading-none">{label}</span>
                          <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform ${transferModeMenuOpen ? "rotate-180" : ""}`} />
                        </button>

		                        {transferModeMenuOpen ? (
                          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-[10rem] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden dark:border-gray-800 dark:bg-gray-900">
                            <div className="p-2 space-y-1">
                              {(
                                [
                                  { value: "auto", label: "自动", disabled: false },
                                  { value: "presigned", label: "R2 直连", disabled: !canUsePresigned },
                                  { value: "proxy", label: "Pages 代理", disabled: false },
                                ] as { value: TransferModeOverride; label: string; disabled: boolean }[]
                              ).map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={opt.disabled}
                                  onClick={() => {
                                    setTransferModeMenuOpen(false);
                                    setTransferModeOverride(selectedBucket, opt.value);
                                    setToast(
                                      opt.value === "auto"
                                        ? "已切换传输模式（自动）"
                                        : opt.value === "presigned"
                                          ? "已切换传输模式（R2 直连）"
                                          : "已切换传输模式（Pages 代理）",
                                    );
	                                  }}
	                                  className={[
	                                    "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-[12px] transition-colors",
	                                    opt.value === current
	                                      ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/40 dark:text-blue-200"
	                                      : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800",
	                                    opt.disabled ? "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent" : "",
	                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  role="option"
                                  aria-selected={opt.value === current}
                                >
                                  <span>{opt.label}</span>
                                  <span
                                    className={[
                                      "w-2 h-2 rounded-full",
                                      opt.value === current ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-700",
                                    ].join(" ")}
                                    aria-hidden="true"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
		                        ) : null}
		                      </div>
	                    );
	                  })()}
	              </div>
	            </div>
	          ) : null}
	
	        <div className="px-3 py-2 rounded-md border border-gray-200 bg-white text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
	          <div className="flex items-center justify-between gap-2">
	            <span className="font-medium truncate">当前桶占用估算</span>
            <button
              onClick={() => selectedBucket && fetchBucketUsage(selectedBucket)}
              disabled={!selectedBucket || usageLoading}
              className="text-[11px] text-blue-600 hover:text-blue-700 disabled:opacity-50 dark:text-blue-300 dark:hover:text-blue-200"
            >
              {usageLoading ? "计算中..." : "刷新"}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">对象数</span>
            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-100">
              {bucketUsage ? (bucketUsage.truncated ? `≥${bucketUsage.objects}` : `${bucketUsage.objects}`) : "-"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">容量</span>
            <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-100">
              {bucketUsage ? (bucketUsage.truncated ? `≥${formatSize(bucketUsage.bytes)}` : formatSize(bucketUsage.bytes)) : "-"}
            </span>
          </div>
          {bucketUsage?.truncated ? (
            <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">仅扫描前 {bucketUsage.pagesScanned} 页（每页最多 1000 项）</div>
          ) : null}
	          {bucketUsageError && !fileListError ? (
	            <div className="mt-1 text-[10px] text-red-600 leading-relaxed dark:text-red-300">{bucketUsageError}</div>
	          ) : null}
        </div>

	        <button
            type="button"
            onClick={() => setAccountCenterOpen(true)}
            className="w-full px-3 py-2 rounded-md border border-gray-200 bg-white text-left text-xs text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <UserCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">当前登录账号</div>
                <div className="mt-0.5 text-[11px] font-semibold text-gray-800 truncate dark:text-gray-100">
                  {auth?.email ? auth.email : "未读取到邮箱"}
                </div>
                <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">已绑定桶：{buckets.length}</div>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">点击进入账号中心，管理当前账号下的存储桶。</div>
	        </button>

        <button
          onClick={() => setLogoutOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-lg text-xs font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-red-950/40 dark:hover:text-red-200 dark:hover:border-red-900"
        >
          <LogOut className="w-3 h-3" />
          退出登录
        </button>
      </div>
      </div>
    </div>
  );

  const DetailsPanel = ({ onClose, compact }: { onClose?: () => void; compact?: boolean }) => (
    <div className="h-full w-full bg-white border-l border-gray-200 flex flex-col shadow-sm dark:bg-gray-900 dark:border-gray-800">
      <div className="h-16 px-5 border-b border-gray-100 flex items-center justify-between gap-3 dark:border-gray-800">
        <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wide dark:text-gray-100">详细信息</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="关闭详情"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>

      <div className={`flex-1 overflow-y-auto ${compact ? "p-4 space-y-5" : "p-6 space-y-8"}`}>
        {selectedItem ? (
	          <div className={`${compact ? "space-y-4" : "space-y-6"} animate-in fade-in slide-in-from-right-4 duration-300`}>
	            <div className={compact ? "flex items-center gap-3" : "flex flex-col items-center"}>
	              <div
	                className={`${
	                  compact ? "w-14 h-14 rounded-xl" : "w-16 h-16 rounded-2xl"
	                } bg-gray-50 border border-gray-100 flex items-center justify-center ${
	                  compact ? "" : "mb-4"
	                } shadow-sm dark:bg-gray-950 dark:border-gray-800`}
	              >
	                {getIcon(selectedItem.type, selectedItem.name)}
              </div>
              <div className={compact ? "min-w-0 flex-1" : ""}>
                <h3
                  className={`font-semibold text-gray-900 ${
                    compact ? "text-left break-words" : "text-center break-all px-2"
                  } leading-snug dark:text-gray-100`}
                >
                  {selectedItem.name}
                </h3>
                {compact ? (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {selectedItem.type === "folder" ? "文件夹" : formatSize(selectedItem.size)}
                    {selectedItem.lastModified ? ` · ${new Date(selectedItem.lastModified).toLocaleDateString()}` : ""}
	                  </div>
	                ) : (
	                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
	                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600 font-semibold dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
	                      {getFileTag(selectedItem)}
	                    </span>
	                    <span className="text-xs text-gray-500 dark:text-gray-400">
	                      {selectedItem.type === "folder" ? "文件夹" : "文件"}
	                      {selectedItem.type === "file" ? ` · ${formatSize(selectedItem.size)}` : ""}
	                      {selectedItem.lastModified ? ` · ${new Date(selectedItem.lastModified).toLocaleDateString()}` : ""}
	                    </span>
	                  </div>
	                )}
	              </div>
	            </div>
	
	            {selectedItem.type === "folder" ? (
	              <div className={`grid grid-cols-2 ${compact ? "gap-2 pt-1" : "gap-3 pt-2"}`}>
	                <button
	                  onClick={() => handleEnterFolder(selectedItem!.name)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors col-span-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  打开文件夹
                </button>
                <button
                  onClick={handleRename}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <Edit2 className="w-4 h-4" />
                  重命名
                </button>
                <button
                  onClick={() => handleMoveOrCopy("move")}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  移动
                </button>
                <button
                  onClick={() => handleMoveOrCopy("copy")}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <Copy className="w-4 h-4" />
                  复制
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-red-600 hover:bg-red-50 hover:border-red-200 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-red-200 dark:hover:bg-red-950/40 dark:hover:border-red-900"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => previewItem(selectedItem!)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors col-span-2"
                >
                  <Eye className="w-4 h-4" />
                  预览
                </button>
                <button
                  onClick={() => downloadItem(selectedItem!)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <Download className="w-4 h-4" />
                  下载
                </button>
                <button
                  onClick={handleRename}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <Edit2 className="w-4 h-4" />
                  重命名
                </button>
                <button
                  onClick={() => handleMoveOrCopy("move")}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  移动
                </button>
                <button
                  onClick={() => handleMoveOrCopy("copy")}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <Copy className="w-4 h-4" />
                  复制
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-red-600 hover:bg-red-50 hover:border-red-200 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-red-200 dark:hover:bg-red-950/40 dark:hover:border-red-900"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
                <button
                  onClick={() => copyLinkForItem(selectedItem!, "public")}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <Link2 className="w-4 h-4" />
                  公共链接
                </button>
                <button
                  onClick={() => copyLinkForItem(selectedItem!, "custom")}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-blue-200"
                >
                  <Link2 className="w-4 h-4" />
                  自定义链接
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-gray-950">
              <Search className="w-6 h-6 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 text-sm dark:text-gray-400">
              选择一个文件以查看详情
              <br />
              或进行管理
            </p>
          </div>
        )}

	        {!compact ? (
	          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100 dark:from-blue-950/35 dark:to-indigo-950/25 dark:border-blue-900">
	            <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-4 flex items-center gap-2">
	              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
	              当前视图统计
	            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">文件数</span>
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{currentViewStats.fileCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">文件夹数</span>
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{currentViewStats.folderCount}</span>
              </div>
              <div className="h-px bg-blue-200/50 my-2 dark:bg-blue-900/50"></div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">总大小</span>
                <span className="text-sm font-bold text-blue-700 dark:text-blue-200">{formatSize(currentViewStats.totalSize)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400 text-center dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-400">
        <p>{LOGIN_PAGE.title}</p>
        <p className="mt-0.5">R2对象存储多功能管理工具</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh md:h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden dark:bg-gray-900 dark:text-gray-100">
      {/* 移动端：左侧抽屉 */}
      {isMobile ? (
        <div className={`fixed inset-0 z-50 md:hidden ${mobileNavOpen ? "" : "pointer-events-none"}`}>
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={() => setMobileNavOpen(false)}
            className={`absolute inset-0 bg-black/40 transition-opacity ${mobileNavOpen ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`absolute inset-y-0 left-0 w-[18rem] max-w-[85vw] transition-transform duration-200 ${
              mobileNavOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <SidebarPanel onClose={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* 桌面端：左侧栏 */}
      <div className="hidden md:block w-[17rem] shrink-0">{isMobile ? null : <SidebarPanel />}</div>

      {/* 中间：文件浏览器 */}
      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
        {/* 顶部工具栏 */}
          <div className="border-b border-gray-200 bg-white shrink-0 dark:border-gray-800 dark:bg-gray-900">
          {/* 桌面端：保持原布局 */}
          <div className="hidden md:flex h-16 border-b-0 items-center px-6 gap-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => selectedBucket && fetchFiles(selectedBucket, path)}
                disabled={!selectedBucket}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800"
                title="刷新"
                aria-label="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">刷新</span>
              </button>
              <button
                onClick={handleBatchDownload}
                disabled={selectedKeys.size === 0}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800"
                title="批量下载（所选文件）"
                aria-label="下载"
              >
                <Download className="w-4 h-4" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">下载</span>
              </button>
              <button
                onClick={openBatchMove}
                disabled={selectedKeys.size === 0}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800"
                title="批量移动（所选项）"
                aria-label="移动"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">移动</span>
              </button>
              <button
                onClick={handleRenameFromToolbar}
                disabled={selectedKeys.size > 1 || (selectedKeys.size === 0 && !selectedItem)}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800"
                title="重命名（仅支持单选）"
                aria-label="重命名"
              >
                <Edit2 className="w-4 h-4" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">重命名</span>
              </button>
              <button
                onClick={handleDelete}
                disabled={selectedKeys.size === 0 && !selectedItem}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-red-200 dark:hover:bg-red-950/40"
                title="删除（所选项）"
                aria-label="删除"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-[10px] leading-none">删除</span>
              </button>
              <button
                onClick={openMkdir}
                disabled={!selectedBucket || !!searchTerm.trim()}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800"
                title={searchTerm.trim() ? "搜索中无法新建文件夹" : "新建文件夹"}
                aria-label="新建"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">新建</span>
              </button>
              <SortControl
                disabled={!selectedBucket}
                sortKey={fileSortKey}
                sortDirection={fileSortDirection}
                onChange={(key, direction) => {
                  setFileSortKey(key);
                  setFileSortDirection(direction);
                }}
              />
              <button
                type="button"
                onClick={() =>
                  setThemeMode((prev) =>
                    prev === "system" ? (resolvedDark ? "light" : "dark") : prev === "dark" ? "light" : "system",
                  )
                }
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors active:scale-95 dark:text-gray-300 dark:hover:bg-gray-800"
                title={themeMode === "system" ? "主题：跟随系统" : themeMode === "dark" ? "主题：深色" : "主题：浅色"}
                aria-label="主题"
              >
                {themeMode === "dark" ? (
                  <Moon className="w-4 h-4" />
                ) : themeMode === "light" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Monitor className="w-4 h-4" />
                )}
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">主题</span>
              </button>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="桶内全局搜索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-9 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-60 transition-all dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                {searchLoading ? (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <RefreshCw className="w-4 h-4 text-gray-400 animate-spin dark:text-gray-500" />
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => {
                  if (!selectedBucket) return;
                  if (uploadTasks.length > 0) setUploadPanelOpen(true);
                  else fileInputRef.current?.click();
                }}
                disabled={!selectedBucket}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadSummary.active > 0 ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{uploadSummary.pct}%</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>上传</span>
                  </>
                )}
              </button>
            </div>
          </div>

		          {/* 桌面端：面包屑单独一行显示，避免被按钮挤压 */}
		          <div className="hidden md:flex items-center justify-between gap-3 px-6 py-2 border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
		            <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600 dark:text-gray-300 min-w-0">
		              <button
		                onClick={() => {
		                  setPath([]);
	                  setSearchTerm("");
		                }}
		                className="hover:bg-gray-100 px-2 py-1 rounded-md transition-colors text-gray-500 flex items-center gap-1 dark:text-gray-300 dark:hover:bg-gray-800"
		              >
		                <FolderOpen className="w-5 h-5 text-gray-500 dark:text-gray-300" strokeWidth={1.75} />
		                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">根目录</span>
		              </button>
	              {path.length > 0 && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 dark:text-gray-600" />}
	              {path.map((folder, idx) => (
                <React.Fragment key={idx}>
                  <button
                    onClick={() => handleBreadcrumbClick(idx)}
                    className="hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors font-medium break-words dark:hover:text-blue-200 dark:hover:bg-blue-950/30"
                  >
                    {folder}
                  </button>
                  {idx < path.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 dark:text-gray-600" />}
                </React.Fragment>
	              ))}
		            </div>
		            <BucketHintChip
		              bucketName={selectedBucketDisplayName ?? "未选择"}
		              disabled={!selectedBucket}
		              onClick={() => setBucketHintOpen(true)}
		            />
		          </div>

          {/* 移动端：分行布局，避免按钮挤压 */}
          <div className="md:hidden px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="p-2.5 -ml-1 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label="打开菜单"
              >
                <Menu className="w-5 h-5" />
              </button>
			            <div className="flex items-center gap-3 min-w-0">
			              <BrandMark className="w-10 h-10 shrink-0" />
				              <div className="min-w-0">
					                <div className="font-bold text-[18px] leading-[1.15] tracking-tight text-blue-600 truncate dark:text-blue-400">
						                  {LOGIN_PAGE.title}
					                </div>
					                <div className="mt-0.25 text-[12px] leading-[1.1] text-gray-400 font-medium truncate dark:text-gray-400">
					                  {LOGIN_PAGE.subtitle}
					                </div>
					              </div>
			            </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="桶内搜索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                {searchLoading ? (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <RefreshCw className="w-4 h-4 text-gray-400 animate-spin dark:text-gray-500" />
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => {
                  if (!selectedBucket) return;
                  if (uploadTasks.length > 0) setUploadPanelOpen(true);
                  else fileInputRef.current?.click();
                }}
                disabled={!selectedBucket}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>上传</span>
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto -mx-3 px-3 pb-0.5">
              <button
                onClick={() => selectedBucket && fetchFiles(selectedBucket, path)}
                disabled={!selectedBucket}
                className="w-16 h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="刷新"
                aria-label="刷新"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">刷新</span>
              </button>
              <button
                onClick={handleBatchDownload}
                disabled={selectedKeys.size === 0}
                className="w-16 h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="批量下载（所选文件）"
                aria-label="下载"
              >
                <Download className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">下载</span>
              </button>
              <button
                onClick={openBatchMove}
                disabled={selectedKeys.size === 0}
                className="w-16 h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="批量移动（所选项）"
                aria-label="移动"
              >
                <ArrowRightLeft className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">移动</span>
              </button>
              <button
                onClick={handleRenameFromToolbar}
                disabled={selectedKeys.size > 1 || (selectedKeys.size === 0 && !selectedItem)}
                className="w-16 h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="重命名（仅支持单选）"
                aria-label="重命名"
              >
                <Edit2 className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">重命名</span>
              </button>
              <button
                onClick={handleDelete}
                disabled={selectedKeys.size === 0 && !selectedItem}
                className="w-16 h-14 flex flex-col items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-red-200 dark:hover:bg-red-950/40"
                title="删除（所选项）"
                aria-label="删除"
              >
                <Trash2 className="w-5 h-5" />
                <span className="text-[10px] leading-none">删除</span>
              </button>
              <button
                onClick={openMkdir}
                disabled={!selectedBucket || !!searchTerm.trim()}
                className="w-16 h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title={searchTerm.trim() ? "搜索中无法新建文件夹" : "新建文件夹"}
                aria-label="新建"
              >
                <FolderPlus className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">新建</span>
              </button>
              <SortControl
                compact
                disabled={!selectedBucket}
                sortKey={fileSortKey}
                sortDirection={fileSortDirection}
                onChange={(key, direction) => {
                  setFileSortKey(key);
                  setFileSortDirection(direction);
                }}
              />
              <button
                type="button"
                onClick={() =>
                  setThemeMode((prev) =>
                    prev === "system" ? (resolvedDark ? "light" : "dark") : prev === "dark" ? "light" : "system",
                  )
                }
                className="w-16 h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title={themeMode === "system" ? "主题：跟随系统" : themeMode === "dark" ? "主题：深色" : "主题：浅色"}
                aria-label="主题"
              >
                {themeMode === "dark" ? (
                  <Moon className="w-5 h-5" />
                ) : themeMode === "light" ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Monitor className="w-5 h-5" />
                )}
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">主题</span>
              </button>
            </div>

		            {/* 移动端：面包屑移动到功能区下方、文件列表上方 */}
		            <div className="pt-1">
		              <div className="flex items-center justify-between gap-2">
		                <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600 dark:text-gray-300 min-w-0">
		                  <button
		                    onClick={() => {
		                      setPath([]);
	                      setSearchTerm("");
		                    }}
		                    className="hover:bg-gray-100 px-2 py-1 rounded-md transition-colors text-gray-500 flex items-center gap-1 dark:text-gray-300 dark:hover:bg-gray-800"
		                  >
		                    <FolderOpen className="w-5 h-5 text-gray-500 dark:text-gray-300" strokeWidth={1.75} />
		                    <span className="text-sm font-medium">根目录</span>
		                  </button>
	                  {path.length > 0 && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 dark:text-gray-600" />}
	                  {path.map((folder, idx) => (
	                    <React.Fragment key={idx}>
	                      <button
	                        onClick={() => handleBreadcrumbClick(idx)}
	                        className="hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors font-medium whitespace-nowrap dark:hover:text-blue-200 dark:hover:bg-blue-950/30"
	                      >
	                        {folder}
	                      </button>
	                      {idx < path.length - 1 && (
	                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 dark:text-gray-600" />
	                      )}
	                    </React.Fragment>
	                  ))}
	                </div>
	                <BucketHintChip
	                  bucketName={selectedBucketDisplayName ?? "未选择"}
	                  disabled={!selectedBucket}
	                  onClick={() => setBucketHintOpen(true)}
	                  className="shrink-0"
	                />
	              </div>
	            </div>
	          </div>
	        </div>

        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleUpload} />

	        {fileListLoading || searchLoading ? (
	          <div className="h-1 w-full bg-[var(--loader-track)]">
	            <div className="h-1 w-full r2-loading-progress" />
	          </div>
	        ) : (
	          <div className="h-1 w-full bg-transparent" />
        )}

        {/* 文件列表 */}
        <div
	          className={`flex-1 overflow-y-auto p-3 md:py-4 md:px-6 bg-gray-50/30 dark:bg-gray-900 ${loading || fileListLoading ? "pointer-events-none" : ""}`}
          onClick={() => {
            setSelectedItem(null);
          }}
        >
          {connectionStatus === "unbound" ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-sm p-6 dark:bg-gray-900 dark:border-gray-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">未绑定存储桶</div>
                    <div className="mt-1 text-sm text-gray-500 leading-relaxed dark:text-gray-300">
                      当前账号还没有可用存储桶，请点击「新增存储桶」并填写你的 R2 账号参数后继续。
                    </div>
                  </div>
                  <button
                    onClick={openAddBucket}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    新增存储桶
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/30">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">配置步骤</div>
                    <ol className="mt-3 space-y-2 text-sm text-gray-700 list-decimal pl-5 dark:text-gray-200">
                      <li>点击「新增存储桶」按钮</li>
                      <li>填写桶名、Account ID、Access Key、Secret Key</li>
                      <li>可选填写公共链接和自定义域名</li>
                      <li>保存后即可开始管理文件</li>
                    </ol>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/30">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">字段说明</div>
                    <div className="mt-3 text-sm text-gray-700 leading-relaxed space-y-2 dark:text-gray-200">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">桶名称</span>
                        <code className="px-2 py-1 rounded bg-white border border-gray-200 text-xs dark:bg-gray-900 dark:border-gray-800">my-bucket</code>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">Account ID</span>
                        <code className="px-2 py-1 rounded bg-white border border-gray-200 text-xs dark:bg-gray-900 dark:border-gray-800">xxxxxxxx</code>
                      </div>
                      <div className="text-[12px] text-gray-500 dark:text-gray-400">
                        Access Key 和 Secret Key 在 Cloudflare R2 API Tokens 中创建与查看。
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-200">提示</div>
                  <ul className="mt-2 text-sm text-gray-700 space-y-1.5 list-disc pl-5 dark:text-gray-200">
                    <li>
                      每个账号可配置多个桶，也可混用多个 Cloudflare 账号的桶。
                    </li>
                    <li>
                      所有桶配置会绑定到当前登录账号，后续登录可直接继续使用。
                    </li>
                  </ul>
                </div>
              </div>
            </div>
	          ) : fileListLoading ? (
              <FileListSkeleton />
	          ) : fileListError && !loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
                <div className="text-sm font-semibold text-red-700 dark:text-red-200">文件列表读取失败</div>
                <div className="mt-2 text-sm leading-relaxed text-red-700/90 dark:text-red-200/90">{fileListError}</div>
                <div className="mt-4">
                  <button
                    onClick={() => selectedBucket && fetchFiles(selectedBucket, path)}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    重新读取
                  </button>
                </div>
              </div>
            </div>
          ) : filteredFiles.length === 0 && !loading && !searchLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-400">
              <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-4 dark:bg-gray-950">
                <Folder className="w-10 h-10 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-sm font-medium">{searchTerm.trim() ? "未找到匹配内容" : "文件夹为空"}</p>
            </div>
          ) : (
            <React.Fragment>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm dark:bg-gray-900 dark:border-gray-800">
                  <div className="flex items-center px-4 py-3 sm:py-2.5 text-[11px] font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 dark:bg-gray-950/30 dark:border-gray-800 dark:text-gray-400">
                    <div className="w-10 flex items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={filteredFiles.length > 0 && filteredFiles.every((f) => selectedKeys.has(f.key))}
                        onChange={(e) => {
                          const next = new Set(selectedKeys);
                          if (e.target.checked) {
                            for (const f of filteredFiles) next.add(f.key);
                          } else {
                            for (const f of filteredFiles) next.delete(f.key);
                          }
                          setSelectedKeys(next);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="flex-1">名称</div>
                    <div className="w-28 text-right hidden md:block">大小</div>
                    <div className="w-28 text-right hidden md:block">修改时间</div>
                    <div className="w-40 text-right hidden md:block">操作</div>
                    <div className="w-12 text-right md:hidden">操作</div>
                  </div>
                  <div>
                    {filteredFiles.map((file) => {
                      const checked = selectedKeys.has(file.key);
                      return (
                        <div
                          key={file.key}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isMobile) {
                              if (file.type === "folder") handleEnterFolder(file.name);
                              else previewItem(file);
                              return;
                            }
                            setSelectedItem(file);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (isMobile) return;
                            if (file.type === "folder") handleEnterFolder(file.name);
                            else previewItem(file);
                          }}
                          className={`group flex items-center px-4 py-3 md:py-2.5 text-sm border-b border-gray-100 hover:bg-gray-50 cursor-pointer dark:border-gray-800 dark:hover:bg-gray-800 ${
                            selectedItem?.key === file.key ? "bg-blue-50 dark:bg-blue-950/30" : "bg-white dark:bg-gray-900"
                          }`}
                        >
                          <div className="w-10 flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(selectedKeys);
                                if (e.target.checked) next.add(file.key);
                                else next.delete(file.key);
                                setSelectedKeys(next);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4"
                            />
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <div className="shrink-0">{getIcon(file.type, file.name, "sm")}</div>
                            <div className="min-w-0 flex items-center gap-2">
                          <div className="truncate" title={file.name}>{file.name}</div>
                              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600 font-semibold dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                                {getFileTag(file)}
                              </span>
                            </div>
                          </div>
                          <div className="w-28 text-right text-xs text-gray-500 hidden md:block dark:text-gray-400">
                            {file.type === "folder" ? "-" : formatSize(file.size)}
                          </div>
                          <div className="w-28 text-right text-xs text-gray-500 hidden md:block dark:text-gray-400">
                            {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : "-"}
                          </div>
                          <div className="w-40 hidden md:flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {file.type === "folder" ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEnterFolder(file.name);
                                  }}
                                  className="p-3 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                  title="打开"
                                >
                                  <FolderOpen className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRenameFor(file);
                                  }}
                                  className="p-3 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                  title="重命名"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMoveFor(file, "move");
                                  }}
                                  className="p-3 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                  title="移动"
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadItem(file);
                                  }}
                                  className="p-3 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                  title="下载"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRenameFor(file);
                                  }}
                                  className="p-3 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                  title="重命名"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMoveFor(file, "move");
                                  }}
                                  className="p-3 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                  title="移动"
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                          <div className="w-12 flex justify-end md:hidden">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(file);
                                setMobileDetailOpen(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                              aria-label="操作"
                              title="操作"
                            >
                              操作
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
            </React.Fragment>
          )}
        </div>
      </main>

      {/* 桌面端：右侧信息面板 */}
      <div className="hidden md:flex w-80 shrink-0">
        <DetailsPanel />
      </div>

	      {/* 移动端：详情底部弹窗 */}
	      <div className={`fixed inset-0 z-50 md:hidden ${mobileDetailOpen ? "" : "pointer-events-none"}`}>
	        <button
	          type="button"
	          aria-label="关闭详情"
	          onClick={() => setMobileDetailOpen(false)}
	          className={`absolute inset-0 bg-black/40 transition-opacity ${mobileDetailOpen ? "opacity-100" : "opacity-0"}`}
	        />
	        <div
	          className={`absolute inset-x-0 bottom-0 transition-transform duration-200 ${
	            mobileDetailOpen ? "translate-y-0" : "translate-y-full"
	          }`}
	          onClick={(e) => e.stopPropagation()}
	        >
	          <div className="h-[70dvh] bg-white rounded-t-2xl shadow-2xl border border-gray-200 overflow-hidden dark:bg-gray-900 dark:border-gray-800">
	            <DetailsPanel compact onClose={() => setMobileDetailOpen(false)} />
	          </div>
	        </div>
	      </div>

      {/* 旧版：右侧信息面板（已弃用） */}
      {false ? (
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col shadow-sm z-10">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wide">详细信息</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {selectedItem ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-center mb-4 shadow-sm">
                  {getIcon(selectedItem!.type, selectedItem!.name)}
                </div>
                <h3 className="font-semibold text-gray-900 text-center break-all px-2 leading-snug">{selectedItem!.name}</h3>
                <div className="mt-2 inline-flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600 font-semibold">
                    {getFileTag(selectedItem!)}
                  </span>
                  {selectedItem!.type === "file" ? (
                    <span className="text-[10px] text-gray-400 font-medium">{formatSize(selectedItem!.size)}</span>
                  ) : null}
                </div>
              </div>
              
              <div className="space-y-0 text-sm border rounded-lg border-gray-100 overflow-hidden">
                <div className="flex justify-between p-3 bg-gray-50/50 border-b border-gray-100">
                  <span className="text-gray-500">类型</span>
                  <span className="text-gray-900 font-medium">{selectedItem!.type === "folder" ? "文件夹" : "文件"}</span>
                </div>
                <div className="flex justify-between p-3 bg-white border-b border-gray-100">
                  <span className="text-gray-500">大小</span>
                  <span className="text-gray-900 font-medium">{formatSize(selectedItem!.size)}</span>
                </div>
                <div className="flex justify-between p-3 bg-gray-50/50">
                  <span className="text-gray-500">修改时间</span>
                  <span className="text-gray-900 font-medium text-right text-xs">
                    {selectedItem!.lastModified ? new Date(selectedItem!.lastModified as string).toLocaleDateString() : "-"}
                  </span>
                </div>
              </div>

              {selectedItem!.type === "folder" ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleEnterFolder(selectedItem!.name)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors col-span-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    打开文件夹
                  </button>
                  <button
                    onClick={handleRename}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    重命名
                  </button>
                  <button
                    onClick={() => handleMoveOrCopy("move")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    移动
                  </button>
                  <button
                    onClick={() => handleMoveOrCopy("copy")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    复制
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-red-600 hover:bg-red-50 hover:border-red-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除
                  </button>
                  <button
                    onClick={() => copyLinkForItem(selectedItem!, "public")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                    公共链接
                  </button>
                  <button
                    onClick={() => copyLinkForItem(selectedItem!, "custom")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                    自定义链接
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => previewItem(selectedItem!)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors col-span-2"
                  >
                    <Eye className="w-4 h-4" />
                    预览
                  </button>
                  <button
                    onClick={() => downloadItem(selectedItem!)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    下载
                  </button>
                  <button
                    onClick={handleRename}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    重命名
                  </button>
                  <button
                    onClick={() => handleMoveOrCopy("move")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    移动
                  </button>
                  <button
                    onClick={() => handleMoveOrCopy("copy")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    复制
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-red-600 hover:bg-red-50 hover:border-red-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除
                  </button>
                  <button
                    onClick={() => copyLinkForItem(selectedItem!, "public")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                    公共链接
                  </button>
                  <button
                    onClick={() => copyLinkForItem(selectedItem!, "custom")}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-blue-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                    自定义链接
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-gray-500 text-sm">选择一个文件以查看详情<br/>或进行管理</p>
            </div>
          )}

	          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
	            <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-4 flex items-center gap-2">
	              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
	              当前视图统计
	            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">文件数</span>
                <span className="text-sm font-bold text-gray-800">{currentViewStats.fileCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">文件夹数</span>
                <span className="text-sm font-bold text-gray-800">{currentViewStats.folderCount}</span>
              </div>
              <div className="h-px bg-blue-200/50 my-2"></div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">总大小</span>
                <span className="text-sm font-bold text-blue-700">{formatSize(currentViewStats.totalSize)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400 text-center">
          <p>{LOGIN_PAGE.title}</p>
          <p className="mt-0.5">R2对象存储多功能管理工具</p>
        </div>
      </div>
      ) : null}

	      <Modal
	        open={bucketHintOpen}
	        title="当前存储桶"
	        description="主页仅展示（不支持切换）；如需切换请在侧边栏/菜单中操作。"
	        onClose={() => setBucketHintOpen(false)}
	        footer={
	          <div className="flex justify-end">
	            <button
	              onClick={() => setBucketHintOpen(false)}
	              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
	            >
	              知道了
	            </button>
	          </div>
	        }
	      >
	        <div className="space-y-2">
	          <div className="text-xs text-gray-500 dark:text-gray-400">桶名称</div>
	          <div className="text-base font-semibold text-gray-900 break-all dark:text-gray-100">
	            {selectedBucketDisplayName ?? "未选择"}
	          </div>
	        </div>
	      </Modal>

	      <Modal
	        open={mkdirOpen}
	        title="新建文件夹"
	        description={path.length ? `当前位置：/${path.join("/")}/` : "当前位置：/（根目录）"}
	        onClose={() => { setMkdirOpen(false); setMkdirName(""); }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setMkdirOpen(false); setMkdirName(""); }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={executeMkdir}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              创建
            </button>
          </div>
        }
      >
        <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">文件夹名称</label>
        <input
          value={mkdirName}
          onChange={(e) => setMkdirName(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          placeholder="例如：images"
        />
      </Modal>

      <Modal
        open={renameOpen}
        title="重命名"
        description={selectedItem ? `当前：${selectedItem.name}` : undefined}
        onClose={() => setRenameOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setRenameOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={executeRename}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              确认
            </button>
          </div>
        }
      >
        <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">新名称</label>
        <input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          placeholder="输入新名称"
        />
      </Modal>

      <Modal
        open={moveOpen}
        title={moveMode === "move" ? "移动" : "复制"}
        panelClassName="max-w-[96vw] sm:max-w-[760px]"
        description={
          moveSources.length > 1
            ? `已选择 ${moveSources.length} 个对象`
            : selectedItem
              ? `对象：${selectedItem.key}`
              : undefined
        }
        onClose={closeMoveDialog}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={closeMoveDialog}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={executeMoveOrCopy}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              确认
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            当前目标：{moveTarget === "/" ? "/（根目录）" : `/${moveTarget}`}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => chooseMoveDirectory([])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              根目录
            </button>
            <button
              type="button"
              onClick={() => chooseMoveDirectory(moveBrowserPath.slice(0, -1))}
              disabled={moveBrowserPath.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
              上一级
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-xs dark:border-gray-800 dark:bg-gray-950/50">
            <button
              type="button"
              onClick={() => chooseMoveDirectory([])}
              className="rounded-md px-2 py-1 text-gray-700 hover:bg-white dark:text-gray-200 dark:hover:bg-gray-900"
            >
              根目录
            </button>
            {moveBrowserPath.map((folder, idx) => (
              <React.Fragment key={`move-breadcrumb-${idx}`}>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                <button
                  type="button"
                  onClick={() => chooseMoveDirectory(moveBrowserPath.slice(0, idx + 1))}
                  className="rounded-md px-2 py-1 text-gray-700 hover:bg-white dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  {folder}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400">
              点击文件夹进入并选择为目标目录
            </div>
            <div className="max-h-56 overflow-y-auto">
              {moveBrowserLoading ? (
                <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">正在读取目录...</div>
              ) : moveBrowserError ? (
                <div className="px-3 py-4 text-sm text-red-600 dark:text-red-300">{moveBrowserError}</div>
              ) : moveBrowserFolders.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">当前目录下没有子文件夹</div>
              ) : (
                moveBrowserFolders.map((folder) => (
                  <button
                    type="button"
                    key={`move-folder-${folder.key}`}
                    onClick={() => chooseMoveDirectory([...moveBrowserPath, folder.name])}
                    className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 last:border-b-0 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">手动路径（可选）</label>
            <input
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
              placeholder="例如：/ 或 photos/ 或 a/b/c/"
            />
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              目录建议以 `/` 结尾；选择根目录可直接点击上方「根目录」。
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={accountCenterOpen}
        title="账号中心"
        description="当前账号与存储桶管理"
        panelClassName="max-w-[96vw] sm:max-w-[600px]"
        showHeaderClose
        onClose={() => {
          setAccountCenterOpen(false);
          setBucketDeleteTargetId(null);
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="h-11 w-11 shrink-0 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 flex items-center justify-center">
                <UserCircle2 className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-tight font-semibold text-gray-800 break-all sm:truncate sm:break-normal dark:text-gray-100">
                  {auth?.email || "未读取到邮箱"}
                </div>
                <div className="mt-0 min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowAccountUserId((v) => !v)}
                    className="text-[11px] leading-none text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showAccountUserId ? "隐藏用户ID" : "显示用户ID"}
                  </button>
                  {showAccountUserId ? (
                    <div className="mt-0.5 text-xs leading-tight text-gray-500 break-all dark:text-gray-400">用户ID：{auth?.userId || "-"}</div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="w-full flex items-center gap-1.5 flex-wrap sm:w-auto sm:shrink-0 sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setAccountCenterOpen(false);
                  setLogoutOpen(true);
                }}
                className="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                退出登录
              </button>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(true)}
                className="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                修改密码
              </button>
              <button
                type="button"
                onClick={() => setDeleteAccountOpen(true)}
                className="px-2 py-1 rounded-md text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
              >
                注销账号
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="pl-3 pr-5 py-2 border-b border-gray-200 flex items-center justify-between gap-3 dark:border-gray-800">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">已绑定存储桶（{buckets.length}）</div>
              <button
                type="button"
                onClick={openAddBucket}
                className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium"
              >
                <HardDrive className="w-3.5 h-3.5" />
                添加存储桶
              </button>
            </div>
            {buckets.length ? (
              <div className="max-h-[45vh] overflow-y-auto p-2 space-y-2">
                {buckets.map((bucket) => {
                  const isCurrent = selectedBucket === bucket.id;
                  return (
                    <div
                      key={bucket.id}
                      className={`rounded-lg border px-3 py-2 ${
                        isCurrent
                          ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
                          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                      }`}
                    >
	                      <div className="flex items-start justify-between gap-3">
	                        <div className="min-w-0">
	                          <div className="text-sm font-medium text-gray-800 truncate dark:text-gray-100">
	                            {bucket.Name || bucket.bucketName || bucket.id}
	                          </div>
	                        </div>
	                        <div className="shrink-0 flex items-center gap-1">
	                          <button
	                            type="button"
	                            onClick={() => {
                              if (isCurrent) return;
                              selectBucket(bucket.id);
                              setAccountCenterOpen(false);
                            }}
                            disabled={isCurrent}
                            className="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:disabled:hover:bg-transparent"
                          >
                            {isCurrent ? "当前" : "切换"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditBucket(bucket.id)}
                            className="px-2 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteBucketConfirm(bucket.id)}
                            className="px-2 py-1 rounded-md text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                          >
	                            删除
	                          </button>
	                        </div>
	                      </div>
                        <div className="mt-1 text-xs text-gray-500 break-all dark:text-gray-400">
                          R2 桶名：{bucket.bucketName || "-"}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 break-all dark:text-gray-400" title={bucket.accountId || "-"}>
                          Account ID：{bucket.accountId || "-"}
                        </div>
	                    </div>
	                  );
	                })}
              </div>
            ) : (
              <div className="p-4 text-sm text-gray-500 dark:text-gray-400">当前账号还未绑定存储桶，请点击右上角「添加存储桶」。</div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={changePasswordOpen}
        title="修改密码"
        onClose={() => {
          setChangePasswordOpen(false);
          setChangePasswordValue("");
          setChangePasswordConfirmValue("");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setChangePasswordOpen(false);
                setChangePasswordValue("");
                setChangePasswordConfirmValue("");
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                void handleChangePassword();
              }}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              保存新密码
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">新密码</label>
            <input
              type="password"
              value={changePasswordValue}
              onChange={(e) => setChangePasswordValue(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              placeholder="至少六位密码"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">确认新密码</label>
            <input
              type="password"
              value={changePasswordConfirmValue}
              onChange={(e) => setChangePasswordConfirmValue(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              placeholder="再次输入新密码"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteAccountOpen}
        title="注销账号"
        description="该操作不可恢复，将永久删除当前账号及其桶配置。"
        onClose={() => {
          setDeleteAccountOpen(false);
          setDeleteAccountConfirmText("");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setDeleteAccountOpen(false);
                setDeleteAccountConfirmText("");
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                void handleDeleteAccount();
              }}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认注销
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-red-700 leading-relaxed dark:text-red-200">
            注销后无法恢复，账号下已绑定的桶配置会一并清理。
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">请输入“注销”确认</label>
            <input
              value={deleteAccountConfirmText}
              onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              placeholder="注销"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={addBucketOpen}
        title={editingBucketId ? "编辑存储桶" : "新增存储桶"}
        onClose={() => {
          setAddBucketOpen(false);
          setEditingBucketId(null);
          setBucketFormErrors({});
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setAddBucketOpen(false);
                setEditingBucketId(null);
                setBucketFormErrors({});
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                void handleSaveBucket();
              }}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingBucketId ? "保存修改" : "保存"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isNewBucket ? "带 * 的字段为必填；若缺失，点击保存后会在对应输入框提示。" : "编辑模式下 Access Key / Secret 可留空表示不修改。"}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">显示名称（可选）</label>
              <input
                value={bucketForm.bucketLabel}
                onChange={(e) => setBucketForm((prev) => ({ ...prev, bucketLabel: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="例如：我的云盘"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                R2 桶名称 <span className="text-red-500">*</span>
              </label>
              <input
                value={bucketForm.bucketName}
                onChange={(e) => {
                  setBucketForm((prev) => ({ ...prev, bucketName: e.target.value }));
                  setBucketFormErrors((prev) => ({ ...prev, bucketName: undefined }));
                }}
                className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                  bucketFormErrors.bucketName
                    ? "border-red-500 dark:border-red-500"
                    : "border-gray-200 dark:border-gray-800"
                }`}
                placeholder="例如：my-bucket"
              />
              {bucketFormErrors.bucketName ? (
                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{bucketFormErrors.bucketName}</div>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                Account ID <span className="text-red-500">*</span>
              </label>
              <input
                value={bucketForm.accountId}
                onChange={(e) => {
                  setBucketForm((prev) => ({ ...prev, accountId: e.target.value }));
                  setBucketFormErrors((prev) => ({ ...prev, accountId: undefined }));
                }}
                className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                  bucketFormErrors.accountId
                    ? "border-red-500 dark:border-red-500"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              />
              {bucketFormErrors.accountId ? (
                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{bucketFormErrors.accountId}</div>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                Access Key ID {isNewBucket ? <span className="text-red-500">*</span> : "（可选）"}
              </label>
              <input
                value={bucketForm.accessKeyId}
                onChange={(e) => {
                  setBucketForm((prev) => ({ ...prev, accessKeyId: e.target.value }));
                  setBucketFormErrors((prev) => ({ ...prev, accessKeyId: undefined }));
                }}
                className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                  bucketFormErrors.accessKeyId
                    ? "border-red-500 dark:border-red-500"
                    : "border-gray-200 dark:border-gray-800"
                }`}
                placeholder={editingBucketId ? "留空表示不修改" : ""}
              />
              {bucketFormErrors.accessKeyId ? (
                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{bucketFormErrors.accessKeyId}</div>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                Secret Access Key {isNewBucket ? <span className="text-red-500">*</span> : "（可选）"}
              </label>
              <input
                type="password"
                value={bucketForm.secretAccessKey}
                onChange={(e) => {
                  setBucketForm((prev) => ({ ...prev, secretAccessKey: e.target.value }));
                  setBucketFormErrors((prev) => ({ ...prev, secretAccessKey: undefined }));
                }}
                className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                  bucketFormErrors.secretAccessKey
                    ? "border-red-500 dark:border-red-500"
                    : "border-gray-200 dark:border-gray-800"
                }`}
                placeholder={editingBucketId ? "留空表示不修改" : ""}
              />
              {bucketFormErrors.secretAccessKey ? (
                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{bucketFormErrors.secretAccessKey}</div>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">公共开发 URL（可选）</label>
              <input
                value={bucketForm.publicBaseUrl}
                onChange={(e) => setBucketForm((prev) => ({ ...prev, publicBaseUrl: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">自定义域名（可选）</label>
              <input
                value={bucketForm.customBaseUrl}
                onChange={(e) => setBucketForm((prev) => ({ ...prev, customBaseUrl: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={bucketDeleteOpen}
        title="确认删除存储桶？"
        onClose={() => {
          setBucketDeleteOpen(false);
          setBucketDeleteTargetId(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setBucketDeleteOpen(false);
                setBucketDeleteTargetId(null);
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (!bucketDeleteTargetId) return;
                void handleDeleteBucket(bucketDeleteTargetId);
              }}
              disabled={!bucketDeleteTargetId}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              删除存储桶
            </button>
          </div>
        }
      >
        <div className="text-sm text-gray-700 leading-relaxed dark:text-gray-200">
          将删除以下存储桶配置：
          <span className="font-semibold"> {bucketDeleteTargetMeta?.Name || bucketDeleteTargetMeta?.bucketName || bucketDeleteTargetId || "-"}</span>
          。该操作不会删除 R2 中的真实文件，只会移除本账号下的桶绑定配置。
        </div>
      </Modal>

      <Modal
        open={logoutOpen}
        title="确认退出登录？"
        onClose={() => setLogoutOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setLogoutOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                setLogoutOpen(false);
                handleLogout();
              }}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              退出登录
            </button>
          </div>
        }
      >
        <div className="text-sm text-gray-700 dark:text-gray-200">退出后将清除本地登录状态，需要重新输入邮箱和密码才能继续使用。确定退出登录吗？</div>
      </Modal>

	      <Modal
	        open={linkOpen}
	        title="链接设置"
	        description={selectedBucket ? `桶：${selectedBucket}` : undefined}
	        onClose={() => setLinkOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setLinkOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={saveLinkConfig}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              保存
            </button>
          </div>
        }
	      >
	        <div className="space-y-4">
	          <div>
	            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">公共开发 URL（可选）</label>
	            <input
	              value={linkPublic}
	              onChange={(e) => setLinkPublic(e.target.value)}
	              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
	            />
	          </div>

	          <div>
	            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">自定义域名（可选）</label>
	            <input
	              value={linkCustom}
	              onChange={(e) => setLinkCustom(e.target.value)}
	              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
	            />
	          </div>


		          <div>
		            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">R2 存储桶名称（必填）</label>
		            <input
		              value={linkS3BucketName}
		              onChange={(e) => setLinkS3BucketName(e.target.value)}
		              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
		            />
		            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
		              修改后将重新校验该桶名，校验通过才会保存。
		            </div>
		          </div>
	        </div>
	      </Modal>

      <Modal
        open={deleteOpen}
        title="确认删除"
        description={
          selectedKeys.size > 0
            ? `将删除 ${selectedKeys.size} 项`
            : selectedItem
              ? `将删除：${selectedItem.key}`
              : undefined
        }
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={executeDelete}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              删除
            </button>
          </div>
        }
      >
        <div className="text-sm text-gray-700 dark:text-gray-200">
          确定删除文件？此操作不可恢复。
          {selectedKeys.size > 0
            ? Array.from(selectedKeys).some((k) => k.endsWith("/"))
              ? "（选择文件夹时，文件夹内的所有文件都将会被删除）"
              : null
            : selectedItem?.type === "folder"
              ? "（文件夹会递归删除前缀下的所有对象）"
              : null}
        </div>
      </Modal>

      {uploadTasks.length > 0 ? (
        <>
          <button
            onClick={() => setUploadPanelOpen((v) => !v)}
            className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">
              上传 {uploadSummary.active ? `(${uploadSummary.active})` : ""}
            </span>
            <span className="text-xs text-gray-200">{uploadSummary.pct}%</span>
          </button>

          {uploadPanelOpen ? (
            <div className="fixed bottom-20 right-5 z-40 w-[420px] max-w-[calc(100vw-2.5rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between dark:border-gray-800">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">上传任务</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium"
                  >
                    添加文件
                  </button>
                  <button
                    onClick={() =>
                      setUploadTasks((prev) => prev.filter((t) => t.status === "queued" || t.status === "uploading" || t.status === "paused"))
                    }
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    清理已完成
                  </button>
                  <button
                    onClick={() => setUploadPanelOpen(false)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    title="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-auto divide-y divide-gray-100 dark:divide-gray-800">
                {uploadTasks.map((t) => {
                  const pct = t.file.size ? Math.min(100, Math.round((Math.min(t.loaded, t.file.size) / t.file.size) * 100)) : 0;
                  return (
                    <div key={t.id} className="px-4 py-3">
	                      <div className="flex items-start justify-between gap-3">
	                        <div className="min-w-0">
	                          <div className="text-sm font-medium text-gray-900 truncate dark:text-gray-100" title={t.key}>
	                            {t.file.name}
	                          </div>
	                          <div className="mt-0.5 text-[11px] text-gray-500 truncate dark:text-gray-400" title={`${t.bucket}/${t.key}`}>
	                            {t.bucket}/{t.key}
	                          </div>
	                        </div>
	                        <div className="shrink-0 flex items-center gap-2">
	                          <div className="text-right">
	                            <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{pct}%</div>
	                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                              {t.status === "uploading"
                                ? formatSpeed(t.speedBps)
                                : t.status === "done"
                                  ? "完成"
                                  : t.status === "queued"
                                    ? "排队中"
                                    : t.status === "paused"
                                      ? "已暂停"
                                      : t.status === "canceled"
                                        ? "已取消"
                                        : t.status === "error"
                                          ? "失败"
                                          : t.status}
                            </div>
	                          </div>
	                          {t.status === "uploading" ? (
	                            <>
	                              <button
	                                onClick={() => pauseUploadTask(t.id)}
	                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
	                                title="暂停"
	                              >
	                                <Pause className="w-4 h-4" />
	                              </button>
	                              <button
	                                onClick={() => cancelUploadTask(t.id)}
	                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
	                                title="取消"
	                              >
	                                <CircleX className="w-4 h-4" />
	                              </button>
	                            </>
	                          ) : t.status === "paused" ? (
	                            <>
	                              <button
	                                onClick={() => resumeUploadTask(t.id)}
	                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
	                                title="继续"
	                              >
	                                <Play className="w-4 h-4" />
	                              </button>
	                              <button
	                                onClick={() => cancelUploadTask(t.id)}
	                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
	                                title="取消"
	                              >
	                                <CircleX className="w-4 h-4" />
	                              </button>
	                            </>
	                          ) : t.status === "queued" ? (
	                            <button
	                              onClick={() => cancelUploadTask(t.id)}
	                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
	                              title="取消"
	                            >
	                              <CircleX className="w-4 h-4" />
	                            </button>
	                          ) : t.status === "error" ? (
	                            <button
	                              onClick={() => resumeUploadTask(t.id)}
	                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
	                              title="重试"
	                            >
	                              <Play className="w-4 h-4" />
	                            </button>
	                          ) : null}
	                        </div>
	                      </div>
	                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden dark:bg-gray-800">
	                        <div
	                          className={`h-2 ${
	                            t.status === "error"
	                              ? "bg-red-500"
	                              : t.status === "done"
	                                ? "bg-green-500"
	                                : t.status === "paused" || t.status === "canceled"
	                                  ? "bg-gray-400"
	                                  : "bg-blue-600"
	                          }`}
	                          style={{ width: `${pct}%` }}
	                        />
	                      </div>
                      {t.status === "error" ? <div className="mt-2 text-[11px] text-red-600 dark:text-red-300">{t.error ?? "上传失败"}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showWorkingBadge ? (
        <div className="pointer-events-none fixed top-[4.25rem] right-4 z-40">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/70 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur dark:border-cyan-900/60 dark:bg-slate-900/90 dark:text-slate-100">
            <LoaderOrbit className="h-4 w-4" />
            <span>{dashboardLoadingText}</span>
            <LoaderDots />
          </div>
        </div>
      ) : null}

	      {ToastView}

      {preview ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden dark:bg-gray-900 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
	            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 dark:border-gray-800">
	              <div className="min-w-0">
	                <div className="text-sm font-semibold text-gray-900 truncate dark:text-gray-100" title={preview.name}>
	                  {preview.name}
	                </div>
	                <div className="text-[11px] text-gray-500 truncate dark:text-gray-400" title={preview.key}>
	                  {preview.key}
	                </div>
	              </div>
	              <div className="flex items-center gap-2">
	                <span className="hidden sm:inline-flex text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600 font-semibold dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
	                  {getFileExt(preview.name).toUpperCase() || "FILE"}
	                </span>
	                <button
	                  onClick={async () => {
	                    try {
	                      const url = await getSignedDownloadUrlForced(preview.bucket, preview.key, preview.name);
	                      triggerDownloadUrl(url, preview.name);
	                      setToast("已拉起下载");
	                    } catch {
	                      setToast("下载失败");
	                    }
	                  }}
	                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
	                  title="下载"
	                >
	                  <Download className="w-4 h-4" />
	                </button>
	                <button
	                  onClick={() => setPreview(null)}
	                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
	                  title="关闭"
	                >
	                  <X className="w-4 h-4" />
	                </button>
	              </div>
	            </div>
	            <div className="p-4 bg-gray-50 dark:bg-gray-950/30">
	              {preview.kind === "image" ? (
	                <div className="flex items-center justify-center">
	                  <img src={preview.url} alt={preview.name} className="max-h-[70vh] max-w-full rounded-lg shadow" />
	                </div>
	              ) : preview.kind === "video" ? (
	                <div className="w-full aspect-video rounded-lg shadow bg-black overflow-hidden">
	                  <video src={preview.url} controls className="w-full h-full object-contain" />
	                </div>
	              ) : preview.kind === "audio" ? (
	                <audio src={preview.url} controls className="w-full" />
	              ) : preview.kind === "pdf" ? (
	                <iframe
	                  src={preview.url}
	                  className="w-full h-[70vh] rounded-lg shadow bg-white dark:bg-gray-900"
	                  title="PDF Preview"
	                />
	              ) : preview.kind === "office" ? (
	                <iframe
	                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(preview.url)}`}
	                  className="w-full h-[70vh] rounded-lg shadow bg-white dark:bg-gray-900"
	                  title="Office Preview"
	                />
	              ) : preview.kind === "text" ? (
	                <pre className="text-xs bg-white border border-gray-200 rounded-lg p-4 overflow-auto max-h-[70vh] whitespace-pre-wrap dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
	                  {preview.text ?? "加载中..."}
	                </pre>
	              ) : (
	                <div className="bg-white border border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center text-center dark:bg-gray-900 dark:border-gray-800">
	                  <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center dark:bg-gray-800">
	                    <FileCode className="w-10 h-10 text-blue-600" />
	                  </div>
	                  <div className="mt-8 text-2xl font-semibold text-gray-900 dark:text-gray-100">无法预览此文件</div>
	                  <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">此文件类型暂不支持在线预览，请下载后查看。</div>
	                  <button
	                    onClick={async () => {
	                      try {
	                        const url = await getSignedDownloadUrlForced(preview.bucket, preview.key, preview.name);
	                        triggerDownloadUrl(url, preview.name);
	                        setToast("已拉起下载");
	                      } catch {
	                        setToast("下载失败");
	                      }
	                    }}
	                    className="mt-8 inline-flex items-center gap-3 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg"
	                  >
	                    <Download className="w-5 h-5" />
	                    下载文件
	                  </button>
	                </div>
	              )}
	            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
