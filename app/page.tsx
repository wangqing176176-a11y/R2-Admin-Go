"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/Modal";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { FILE_ICON_PRELOAD_SRCS, getFileIconSrc } from "@/lib/file-icons";
import { LEGAL_DOCS, LEGAL_TAB_LABELS, LEGAL_TAB_ORDER, type LegalTabKey } from "@/lib/legal-docs";
import { 
  Folder, Trash2, Upload, RefreshCw, 
  ChevronRight, Search,
  Menu, Sun, Moon, Monitor, ChevronDown,
  Edit2,
  LogOut, ShieldCheck, Eye, EyeOff,
  Download, Link2, Copy, ArrowRightLeft, FolderOpen, X,
  Pause, Play, CircleX,
  Globe, BadgeInfo, Mail, BookOpen,
  FolderPlus, UserCircle2,
  HardDrive, ArrowUpDown, Share2, LayoutGrid, List as ListIcon,
  Users, Crown, UserPlus, UserX, KeyRound, CheckCircle2, Settings2, FileSpreadsheet, AlertTriangle, EllipsisVertical, Lock,
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
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
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

const QrImageCard = ({
  src,
  alt,
  sizeClass,
}: {
  src: string;
  alt: string;
  sizeClass: string;
}) => {
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(Boolean(src));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("");
  }, [src]);

  return (
    <div className={[sizeClass, "relative rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800"].join(" ")}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className={`h-full w-full rounded object-contain transition-opacity ${loading || error ? "opacity-0" : "opacity-100"}`}
          onLoad={() => {
            setLoading(false);
            setError("");
          }}
          onError={() => {
            setLoading(false);
            setError("二维码加载失败，请稍后重试。");
          }}
        />
      ) : null}

      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/92 text-gray-600 dark:bg-gray-900/92 dark:text-gray-200">
          <LoaderOrbit className="h-5 w-5" />
          <span className="text-xs font-medium">二维码生成中...</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/92 px-4 text-center text-xs font-medium text-red-600 dark:bg-gray-900/92 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
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
  locked?: boolean;
  unlocked?: boolean;
};
type FileSortKey = "name" | "size" | "type" | "time";
type FileSortDirection = "asc" | "desc";
type FileViewMode = "list" | "grid";
type FolderLockViewLite = {
  id: string;
  bucketId: string;
  prefix: string;
  ownerUserId: string;
  hint?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
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
      url?: string;
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
type FileListCacheEntry = {
  items: FileItem[];
  updatedAt: number;
  lockContext?: { currentPrefixLocked: boolean; prefix?: string; hint?: string | null };
};
type FileListCacheMap = Record<string, FileListCacheEntry>;
type ShareRecord = {
  id: string;
  shareCode: string;
  shareUrl?: string;
  itemType: "file" | "folder";
  itemKey: string;
  itemName: string;
  note?: string;
  passcodeEnabled: boolean;
  expiresAt?: string;
  isActive: boolean;
  status: "active" | "expired" | "stopped";
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
};
type ShareStatusFilter = "active" | "expired" | "stopped";
type ShareExpireDays = 0 | 1 | 7 | 30;
type AppRole = "super_admin" | "admin" | "member";
type PermissionKey =
  | "account.self.manage"
  | "account.self.delete"
  | "bucket.read"
  | "bucket.add"
  | "bucket.edit"
  | "object.list"
  | "object.read"
  | "object.upload"
  | "object.rename"
  | "object.move_copy"
  | "object.mkdir"
  | "object.delete"
  | "object.search"
  | "share.manage"
  | "usage.read"
  | "team.member.read"
  | "team.member.manage"
  | "team.role.manage"
  | "team.permission.grant"
  | "team.permission.request.create"
  | "team.permission.request.review"
  | "sys.team.read"
  | "sys.team.manage"
  | "sys.admin.manage"
  | "sys.metrics.read";
type MePayload = {
  profile: {
    userId: string;
    email: string;
    displayName: string;
    role: AppRole;
    roleLabel: string;
    status: "active" | "disabled";
  };
  team: {
    id: string;
    name: string;
    ownerUserId: string;
  };
  permissions: PermissionKey[];
  stats: {
    bucketCount: number;
    teamMemberCount: number;
    pendingRequestCount: number;
  };
  features: {
    canOpenTeamConsole: boolean;
    canOpenPlatformConsole: boolean;
  };
};
type TeamMemberRecord = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
  permissions: Array<{ id: string; permKey: PermissionKey; enabled: boolean; expiresAt?: string | null }>;
};
type PermissionRequestRecord = {
  id: string;
  teamId: string;
  userId: string;
  permKey: PermissionKey;
  reason: string;
  status: "pending" | "approved" | "rejected" | "canceled";
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  requesterDisplayName?: string;
  requesterEmail?: string;
  createdAt: string;
  updatedAt: string;
};
type PlatformSummary = {
  totals: {
    teams: number;
    members: number;
    buckets: number;
    pendingRequests: number;
  };
  teams: Array<{
    id: string;
    name: string;
    ownerUserId: string;
    members: number;
    admins: number;
    buckets: number;
    pendingRequests: number;
    createdAt: string;
    updatedAt: string;
  }>;
};
type PermissionDraftMap = Record<string, Partial<Record<PermissionKey, boolean>>>;
type MemberImportMode = "single" | "batch";
type MemberBatchDraft = {
  rowNo: number;
  displayName: string;
  email: string;
  password: string;
  role: AppRole;
  errors: string[];
};
type MemberBatchResult = {
  index: number;
  email: string;
  reason: string;
};
type XlsxRuntime = {
  read: (data: ArrayBuffer, opts?: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  writeFile: (wb: unknown, filename: string) => void;
  utils: {
    sheet_to_json: (sheet: unknown, opts?: Record<string, unknown>) => unknown[][];
    aoa_to_sheet: (rows: unknown[][]) => unknown;
    book_new: () => unknown;
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
  };
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

const formatDateYmd = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const SHARE_EXPIRE_OPTIONS: { value: ShareExpireDays; label: string }[] = [
  { value: 1, label: "1天" },
  { value: 7, label: "7天" },
  { value: 30, label: "30天" },
  { value: 0, label: "永久有效" },
];

const REQUESTABLE_PERMISSION_OPTIONS: { key: PermissionKey; label: string }[] = [
  { key: "bucket.add", label: "添加存储桶" },
  { key: "bucket.edit", label: "编辑存储桶" },
  { key: "object.upload", label: "上传文件" },
  { key: "object.mkdir", label: "新建文件夹" },
  { key: "object.rename", label: "重命名" },
  { key: "object.move_copy", label: "移动/复制" },
  { key: "object.delete", label: "删除文件" },
  { key: "share.manage", label: "分享功能" },
  { key: "usage.read", label: "查看容量统计" },
];

const PERMISSION_OVERVIEW_OPTIONS: { key: PermissionKey; label: string }[] = [
  { key: "bucket.read", label: "查看/切换存储桶" },
  { key: "object.list", label: "浏览文件列表" },
  { key: "object.read", label: "文件预览/下载" },
  { key: "object.search", label: "搜索文件" },
  { key: "bucket.add", label: "添加存储桶" },
  { key: "bucket.edit", label: "编辑存储桶" },
  { key: "object.upload", label: "上传文件" },
  { key: "object.mkdir", label: "新建文件夹" },
  { key: "object.rename", label: "重命名" },
  { key: "object.move_copy", label: "移动/复制" },
  { key: "object.delete", label: "删除文件" },
  { key: "share.manage", label: "分享功能" },
  { key: "usage.read", label: "查看容量统计" },
  { key: "account.self.manage", label: "修改用户名/密码" },
  { key: "account.self.delete", label: "注销账号" },
  { key: "team.permission.request.create", label: "发起权限申请" },
  { key: "team.member.read", label: "查看团队成员" },
  { key: "team.member.manage", label: "新增/禁用成员" },
  { key: "team.role.manage", label: "调整成员角色" },
  { key: "team.permission.grant", label: "配置成员权限" },
  { key: "team.permission.request.review", label: "审批权限申请" },
  { key: "sys.team.read", label: "查看跨团队数据" },
  { key: "sys.team.manage", label: "管理跨团队配置" },
  { key: "sys.admin.manage", label: "管理管理员账号" },
  { key: "sys.metrics.read", label: "查看平台统计" },
];

const PERMISSION_LABEL_MAP = Object.fromEntries(
  PERMISSION_OVERVIEW_OPTIONS.map((item) => [item.key, item.label]),
) as Record<PermissionKey, string>;

const getPermissionLabel = (key: PermissionKey | string) =>
  (PERMISSION_LABEL_MAP[key as PermissionKey] ?? key) as string;

const MEMBER_IMPORT_HEADER_ALIASES = {
  displayName: ["用户名", "姓名", "displayname", "display_name", "name", "username"],
  email: ["邮箱", "email", "mail"],
  password: ["初始密码", "密码", "password", "pwd"],
  role: ["身份", "角色", "role"],
} as const;

const MEMBER_IMPORT_TEMPLATE_ROWS = [
  ["用户名", "邮箱", "初始密码", "身份"],
  ["张三", "zhangsan@example.com", "123456", "member"],
  ["李四", "lisi@example.com", "12345678", "admin"],
];

const normalizeImportHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "")
    .replaceAll("-", "")
    .replaceAll("_", "");

const normalizeImportRole = (raw: string): AppRole | null => {
  const v = raw.trim().toLowerCase();
  if (!v) return "member";
  if (v === "member" || v === "协作成员" || v === "成员" || v === "普通成员") return "member";
  if (v === "admin" || v === "管理员" || v === "管理") return "admin";
  if (v === "super_admin" || v === "superadmin" || v === "超级管理员" || v === "超级管理") return "super_admin";
  return null;
};

const resolveMemberImportColumns = (rows: string[][]) => {
  const fallback = { displayName: 0, email: 1, password: 2, role: 3, hasHeader: false };
  const firstRow = rows[0] ?? [];
  if (!firstRow.length) return fallback;

  const normalized = firstRow.map((cell) => normalizeImportHeader(cell));
  const pickIndex = (aliases: readonly string[]) => {
    const aliasSet = new Set(aliases.map((a) => normalizeImportHeader(a)));
    return normalized.findIndex((cell) => aliasSet.has(cell));
  };

  const displayName = pickIndex(MEMBER_IMPORT_HEADER_ALIASES.displayName);
  const email = pickIndex(MEMBER_IMPORT_HEADER_ALIASES.email);
  const password = pickIndex(MEMBER_IMPORT_HEADER_ALIASES.password);
  const role = pickIndex(MEMBER_IMPORT_HEADER_ALIASES.role);
  const hitCount = [displayName, email, password, role].filter((idx) => idx >= 0).length;
  if (hitCount < 2) return fallback;

  return {
    displayName: displayName >= 0 ? displayName : 0,
    email: email >= 0 ? email : 1,
    password: password >= 0 ? password : 2,
    role: role >= 0 ? role : 3,
    hasHeader: true,
  };
};

const buildMemberBatchDrafts = (rows: string[][], existingEmails: Set<string>) => {
  const cols = resolveMemberImportColumns(rows);
  const start = cols.hasHeader ? 1 : 0;
  const emailInBatch = new Set<string>();
  const drafts: MemberBatchDraft[] = [];

  for (let i = start; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const displayName = String(row[cols.displayName] ?? "").trim();
    const email = String(row[cols.email] ?? "").trim().toLowerCase();
    const password = String(row[cols.password] ?? "").trim();
    const roleRaw = String(row[cols.role] ?? "").trim();
    if (!displayName && !email && !password && !roleRaw) continue;

    const errors: string[] = [];
    if (!displayName) errors.push("用户名不能为空");
    if (!email || !email.includes("@")) errors.push("邮箱格式不正确");
    if (password.length < 6) errors.push("初始密码至少 6 位");
    if (email && emailInBatch.has(email)) errors.push("导入列表中邮箱重复");
    if (email && existingEmails.has(email)) errors.push("该邮箱已在团队中");

    const role = normalizeImportRole(roleRaw);
    if (!role) errors.push("身份不合法（仅支持 member/admin/super_admin）");
    if (email) emailInBatch.add(email);

    drafts.push({
      rowNo: i + 1,
      displayName,
      email,
      password,
      role: role ?? "member",
      errors,
    });
  }
  return drafts;
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
  announcementText: `近期更新 V2.0版本
  
- 增加了文件列表自定义排序功能。
- 修复了已知问题。
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

const toPrefixFromPath = (currentPath: string[]) => (currentPath.length > 0 ? `${currentPath.join("/")}/` : "");

const FILE_LIST_CACHE_VERSION = "v2";
const makeFileListCacheKey = (bucketId: string, currentPath: string[]) =>
  `${FILE_LIST_CACHE_VERSION}::${bucketId}::${toPrefixFromPath(currentPath)}`;

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

const SortTriangleIcon = ({
  active = false,
  direction = "asc",
  small = false,
}: {
  active?: boolean;
  direction?: FileSortDirection;
  small?: boolean;
}) => {
  const upTone = active && direction === "asc" ? "text-blue-600 dark:text-blue-300" : "text-gray-300 dark:text-gray-600";
  const downTone = active && direction === "desc" ? "text-blue-600 dark:text-blue-300" : "text-gray-300 dark:text-gray-600";
  const size = small ? "h-3 w-3" : "h-3 w-3";
  const spacing = small ? "-space-y-[5px]" : "-space-y-[5px]";
  return (
    <span className={`inline-flex select-none flex-col items-center justify-center ${spacing}`} aria-hidden="true">
      <svg viewBox="0 0 10 10" className={`${size} ${upTone}`} fill="currentColor">
        <path d="M5 1.9Q5.26 2.04 5.46 2.34L8.05 6.22Q8.48 6.86 7.74 6.86H2.26Q1.52 6.86 1.95 6.22L4.54 2.34Q4.74 2.04 5 1.9Z" />
      </svg>
      <svg viewBox="0 0 10 10" className={`${size} ${downTone}`} fill="currentColor">
        <path d="M2.26 3.14H7.74Q8.48 3.14 8.05 3.78L5.46 7.66Q5.26 7.96 5 8.1Q4.74 7.96 4.54 7.66L1.95 3.78Q1.52 3.14 2.26 3.14Z" />
      </svg>
    </span>
  );
};

const SortControl = ({
  disabled,
  sortKey,
  sortDirection,
  onChange,
  compact = false,
  small = false,
}: {
  disabled: boolean;
  sortKey: FileSortKey;
  sortDirection: FileSortDirection;
  onChange: (key: FileSortKey, direction: FileSortDirection) => void;
  compact?: boolean;
  small?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentLabel = getFileSortLabel(sortKey, sortDirection);

  useEffect(() => {
    if (!open) return;
    if (compact) return;
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
  }, [compact, open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (disabled) setOpen(false);
  }, [disabled]);

  const tone = compact ? "text-gray-600 dark:text-gray-200" : "text-gray-500 dark:text-gray-300";
  const size = small ? "w-7 h-7" : compact ? "w-full h-14" : "w-12 h-14";
  const icon = small ? "w-3.5 h-3.5" : compact ? "w-5 h-5" : "w-4 h-4";
  const menu = (
    <div className="w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <div className="px-3 py-2 text-xs font-normal text-gray-500 dark:text-gray-400">排序方式</div>
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
                className={`w-full px-3 py-2.5 text-left text-[13px] font-normal leading-tight transition-colors ${
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
  );

  return (
    <div ref={rootRef} className={`relative ${size}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        disabled={disabled}
        title={`排序：${currentLabel}`}
        aria-label="排序"
        className={`${size} ${small ? "flex items-center justify-center" : "flex flex-col items-center justify-center gap-1"} rounded-lg transition-colors ${
          disabled
            ? `opacity-50 cursor-not-allowed ${tone}`
            : `${tone} hover:bg-blue-50/70 hover:text-blue-600 active:scale-95 dark:hover:bg-blue-950/30 dark:hover:text-blue-300`
        }`}
      >
        {small ? <SortTriangleIcon active direction={sortDirection} small /> : <ArrowUpDown className={icon} />}
        {small ? null : <span className="text-[10px] leading-none">排序</span>}
      </button>

      {open ? (
        compact ? (
          <div className="fixed inset-0 z-[70] md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/35"
              onClick={() => setOpen(false)}
              aria-label="关闭排序菜单"
            />
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-[18svh]">
              <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                {menu}
              </div>
            </div>
          </div>
        ) : (
          <div className={`absolute top-[calc(100%+0.5rem)] z-30 ${small ? "right-0" : "left-0"}`}>
            {menu}
          </div>
        )
      ) : null}
    </div>
  );
};

const ViewModeToggle = ({
  value,
  onChange,
  compact = false,
}: {
  value: FileViewMode;
  onChange: (next: FileViewMode) => void;
  compact?: boolean;
}) => {
  const wrapClass = compact
    ? "inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-800 dark:bg-gray-900"
    : "inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-800 dark:bg-gray-900";

  const btnClass = (active: boolean) =>
    [
      "inline-flex items-center justify-center rounded-md transition-colors",
      compact ? "h-7 w-7" : "h-7 px-2 gap-1 text-[11px]",
      active
        ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
    ].join(" ");

  return (
    <div className={wrapClass} role="tablist" aria-label="文件视图模式">
      <button
        type="button"
        role="tab"
        aria-selected={value === "list"}
        title="列表视图"
        className={btnClass(value === "list")}
        onClick={(e) => {
          e.stopPropagation();
          onChange("list");
        }}
      >
        <ListIcon className="h-3.5 w-3.5" />
        {compact ? null : <span>列表</span>}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "grid"}
        title="图标视图"
        className={btnClass(value === "grid")}
        onClick={(e) => {
          e.stopPropagation();
          onChange("grid");
        }}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        {compact ? null : <span>图标</span>}
      </button>
    </div>
  );
};

export default function R2Admin() {
  // --- 状态管理 ---
  const [auth, setAuth] = useState<AppSession | null>(null);
  const authRef = useRef<AppSession | null>(null);
  const restoringSessionRef = useRef(false);
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
  const [restoringSession, setRestoringSession] = useState(false);
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
  const [fileViewMode, setFileViewMode] = useState<FileViewMode>("list");
  const [currentFolderLockContext, setCurrentFolderLockContext] = useState<{ currentPrefixLocked: boolean; prefix?: string; hint?: string | null }>({
    currentPrefixLocked: false,
  });
  const [fileListCache, setFileListCache] = useState<FileListCacheMap>({});
  const [linkConfigMap, setLinkConfigMap] = useState<LinkConfigMap>({});
  const [s3BucketNameCheckMap, setS3BucketNameCheckMap] = useState<S3BucketNameCheckMap>({});
  const [transferModeOverrideMap, setTransferModeOverrideMap] = useState<TransferModeOverrideMap>({});

  const [toast, setToast] = useState<ToastState>(null);
  const toastPayload = useMemo(() => normalizeToast(toast), [toast]);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const isXlUp = useMediaQuery("(min-width: 1280px)");
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
  const [shareCreateOpen, setShareCreateOpen] = useState(false);
  const [shareManageOpen, setShareManageOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<FileItem | null>(null);
  const [shareExpireDays, setShareExpireDays] = useState<ShareExpireDays>(7);
  const [sharePasscodeEnabled, setSharePasscodeEnabled] = useState(false);
  const [sharePasscode, setSharePasscode] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareResult, setShareResult] = useState<ShareRecord | null>(null);
  const [shareRecords, setShareRecords] = useState<ShareRecord[]>([]);
  const [shareListLoading, setShareListLoading] = useState(false);
  const [shareStatusFilter, setShareStatusFilter] = useState<ShareStatusFilter>("active");
  const [shareCleanupLoading, setShareCleanupLoading] = useState(false);
  const [shareQrPreviewUrl, setShareQrPreviewUrl] = useState("");
  const [shareQrOpen, setShareQrOpen] = useState(false);
  const [shareQrSaving, setShareQrSaving] = useState(false);
  const [folderUnlockOpen, setFolderUnlockOpen] = useState(false);
  const [folderUnlockTarget, setFolderUnlockTarget] = useState<{
    bucketId: string;
    prefix: string;
    folderName?: string;
    hint?: string;
    nextAction: "enter" | "refresh";
  } | null>(null);
  const [folderUnlockPasscode, setFolderUnlockPasscode] = useState("");
  const [showFolderUnlockPasscode, setShowFolderUnlockPasscode] = useState(false);
  const [folderUnlockSubmitting, setFolderUnlockSubmitting] = useState(false);
  const [folderLockManageOpen, setFolderLockManageOpen] = useState(false);
  const [folderLockManageTarget, setFolderLockManageTarget] = useState<{ bucketId: string; prefix: string; folderName: string } | null>(null);
  const [folderLockManageLoading, setFolderLockManageLoading] = useState(false);
  const [folderLockManageSaving, setFolderLockManageSaving] = useState(false);
  const [folderLockManageDeleting, setFolderLockManageDeleting] = useState(false);
  const [folderLockManageExists, setFolderLockManageExists] = useState(false);
  const [folderLockManageHint, setFolderLockManageHint] = useState("");
  const [folderLockManageHintEnabled, setFolderLockManageHintEnabled] = useState(false);
  const [folderLockManagePasscode, setFolderLockManagePasscode] = useState("");
  const [folderLockManagePasscodeConfirm, setFolderLockManagePasscodeConfirm] = useState("");
  const [showFolderLockManagePasscode, setShowFolderLockManagePasscode] = useState(false);
  const [showFolderLockManagePasscodeConfirm, setShowFolderLockManagePasscodeConfirm] = useState(false);
  const [folderLockManageInfo, setFolderLockManageInfo] = useState<FolderLockViewLite | null>(null);
  const [meInfo, setMeInfo] = useState<MePayload | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [teamConsoleOpen, setTeamConsoleOpen] = useState(false);
  const [teamMemberViewerOpen, setTeamMemberViewerOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [memberImportMode, setMemberImportMode] = useState<MemberImportMode>("single");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [newMemberDisplayName, setNewMemberDisplayName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<AppRole>("member");
  const [memberCreating, setMemberCreating] = useState(false);
  const [memberBatchFileName, setMemberBatchFileName] = useState("");
  const [memberBatchDrafts, setMemberBatchDrafts] = useState<MemberBatchDraft[]>([]);
  const [memberBatchParsing, setMemberBatchParsing] = useState(false);
  const [memberBatchImporting, setMemberBatchImporting] = useState(false);
  const [memberTemplateDownloading, setMemberTemplateDownloading] = useState(false);
  const [memberBatchResults, setMemberBatchResults] = useState<MemberBatchResult[]>([]);
  const [memberActionLoadingId, setMemberActionLoadingId] = useState<string | null>(null);
  const [resetPasswordResultOpen, setResetPasswordResultOpen] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ memberLabel: string; password: string } | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState<PermissionDraftMap>({});
  const [permissionBatchSaving, setPermissionBatchSaving] = useState(false);
  const [requestRecords, setRequestRecords] = useState<PermissionRequestRecord[]>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestPermKey, setRequestPermKey] = useState<PermissionKey>("object.upload");
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestClearing, setRequestClearing] = useState(false);
  const [platformConsoleOpen, setPlatformConsoleOpen] = useState(false);
  const [platformSummary, setPlatformSummary] = useState<PlatformSummary | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [bucketHintOpen, setBucketHintOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [addBucketOpen, setAddBucketOpen] = useState(false);
  const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
  const [accountCenterOpen, setAccountCenterOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [permissionOverviewOpen, setPermissionOverviewOpen] = useState(false);
  const [permissionRequestOpen, setPermissionRequestOpen] = useState(false);
  const [permissionReviewOpen, setPermissionReviewOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [bucketDeleteOpen, setBucketDeleteOpen] = useState(false);
  const [bucketDeleteTargetId, setBucketDeleteTargetId] = useState<string | null>(null);

  const uploadTasksRef = useRef<UploadTask[]>([]);
  const uploadProcessingRef = useRef(false);
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  const uploadQueuePausedRef = useRef(false);
  const fileListCacheRef = useRef<FileListCacheMap>({});
  const accountCenterLeftCardRef = useRef<HTMLDivElement>(null);
  const [accountCenterRightHeight, setAccountCenterRightHeight] = useState<number | null>(null);
  const memberBatchFileRef = useRef<HTMLInputElement>(null);
  const xlsxRuntimeRef = useRef<XlsxRuntime | null>(null);

  useEffect(() => {
    uploadTasksRef.current = uploadTasks;
  }, [uploadTasks]);

  useEffect(() => {
    uploadQueuePausedRef.current = uploadQueuePaused;
  }, [uploadQueuePaused]);

  useEffect(() => {
    fileListCacheRef.current = fileListCache;
  }, [fileListCache]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const warmed = new Set<string>();
    for (const src of FILE_ICON_PRELOAD_SRCS) {
      if (!src || warmed.has(src)) continue;
      warmed.add(src);
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }
  }, []);

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
  const [rememberMe, setRememberMe] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showRegisterSecret, setShowRegisterSecret] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangePasswordConfirm, setShowChangePasswordConfirm] = useState(false);
  const [showBucketAccessKeyId, setShowBucketAccessKeyId] = useState(false);
  const [showBucketSecretAccessKey, setShowBucketSecretAccessKey] = useState(false);

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
    // "未勾选记住登录状态" 不落盘，避免下次启动自动恢复旧会话。
    sessionStorage.removeItem(SESSION_STORE_KEY_EPHEMERAL);
    localStorage.removeItem(SESSION_STORE_KEY);
  };

  const activateRecoverySession = (accessToken: string, refreshToken?: string) => {
    const nextAccessToken = String(accessToken ?? "").trim();
    const nextRefreshToken = String(refreshToken ?? "").trim();
    if (!nextAccessToken) return false;

    persistSession(null, false);
    restoringSessionRef.current = false;
    setRestoringSession(false);
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
    if (sessionStorage.getItem(SESSION_STORE_KEY_EPHEMERAL)) {
      // 清理历史版本遗留的临时会话。
      sessionStorage.removeItem(SESSION_STORE_KEY_EPHEMERAL);
    }
    const next = persisted;
    if (next) {
      restoringSessionRef.current = true;
      setRestoringSession(true);
      setAuth(next);
      if (next.email) setFormEmail(next.email);
      setRememberMe(Boolean(persisted));
      setAuthRequired(false);
      setConnectionStatus("checking");
      setConnectionDetail(null);
    } else {
      restoringSessionRef.current = false;
      setRestoringSession(false);
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

  const ToastView = toastPayload
    ? (() => {
        const node = (
          <div className="pointer-events-none fixed top-5 left-1/2 -translate-x-1/2 z-[9999] max-w-[92vw]">
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
        );
        if (typeof document === "undefined") return node;
        return createPortal(node, document.body);
      })()
    : null;

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
      if (restoringSessionRef.current) {
        restoringSessionRef.current = false;
        setRestoringSession(false);
      }
      setAuthRequired(true);
      setBuckets([]);
      setSelectedBucket(null);
      setFiles([]);
      setFileListCache({});
      setFileListError(null);
      setPath([]);
      setBucketUsage(null);
      setBucketUsageError(null);
      setAccountCenterOpen(false);
      setProfileEditOpen(false);
      setPermissionRequestOpen(false);
      setChangePasswordOpen(false);
      setDeleteAccountOpen(false);
      setForgotOpen(false);
      setForgotNotice("");
      setRegisterNotice("");
      setFormPassword("");
      setRegisterPassword("");
      setRegisterCode("");
      setShareCreateOpen(false);
      setShareManageOpen(false);
      setShareTarget(null);
      setShareResult(null);
      setShareRecords([]);
      setMeInfo(null);
      setProfileNameDraft("");
      setTeamMembers([]);
      setPermissionDrafts({});
      setMemberImportMode("single");
      setMemberBatchFileName("");
      setMemberBatchDrafts([]);
      setMemberBatchParsing(false);
      setMemberBatchImporting(false);
      setMemberTemplateDownloading(false);
      setMemberBatchResults([]);
      setMemberActionLoadingId(null);
      setResetPasswordResultOpen(false);
      setResetPasswordResult(null);
      setRequestRecords([]);
      setPlatformSummary(null);
      setTeamConsoleOpen(false);
      setPlatformConsoleOpen(false);
      setShareQrOpen(false);
      setShareQrPreviewUrl("");
      setConnectionStatus("error");
      setConnectionDetail("请登录后继续使用");
      return;
    }
    let cancelled = false;
    let meTimer: number | null = null;

    (async () => {
      await fetchBuckets();
      if (cancelled) return;
      // Let bucket selection commit first so file list fetching can start ASAP.
      meTimer = window.setTimeout(() => {
        if (cancelled) return;
        void fetchMeInfo();
      }, 0);
    })();

    return () => {
      cancelled = true;
      if (meTimer !== null) window.clearTimeout(meTimer);
    };
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

  const permissionSet = useMemo(() => new Set<PermissionKey>(meInfo?.permissions ?? []), [meInfo?.permissions]);
  const hasPermission = (key: PermissionKey) => permissionSet.has(key);
  const canManageFolderLocks = meInfo?.profile.role === "admin" || meInfo?.profile.role === "super_admin";
  const roleLabel = meInfo?.profile.roleLabel ?? "身份加载中";
  const displayName = meInfo?.profile.displayName || auth?.email?.split("@")[0] || "未命名成员";
  const canAddBucket = hasPermission("bucket.add");
  const canEditBucket = hasPermission("bucket.edit");
  const canUploadObject = hasPermission("object.upload");
  const canRenameObject = hasPermission("object.rename");
  const canMoveCopyObject = hasPermission("object.move_copy");
  const canMkdirObject = hasPermission("object.mkdir");
  const canDeleteObject = hasPermission("object.delete");
  const canManageShare = hasPermission("share.manage");
  const canViewUsage = hasPermission("usage.read");
  const canReadTeamMembers = hasPermission("team.member.read");
  const canViewTeamConsole = Boolean(meInfo?.features.canOpenTeamConsole);
  const canViewPlatformConsole = Boolean(meInfo?.features.canOpenPlatformConsole);
  const canCreatePermissionRequest = hasPermission("team.permission.request.create");
  const canReviewPermissionRequest = hasPermission("team.permission.request.review");
  const canOpenPermissionOverview = meInfo?.profile.role === "member";
  const formatUploadTaskDestinationLabel = (_bucket: string, key: string) => {
    const normalizedKey = String(key ?? "").replace(/^\/+/, "");
    const segments = normalizedKey.split("/").filter(Boolean);
    const first = segments[0] ?? "";
    // Hide system-style userId prefix (UUID) in upload list display.
    const visibleSegments =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(first)
        ? segments.slice(1)
        : segments;
    const dirSegments = visibleSegments.length > 1 ? visibleSegments.slice(0, -1) : [];
    return dirSegments.length ? `上传路径：根目录 / ${dirSegments.join(" / ")}` : "上传路径：根目录";
  };
  const permissionOverview = useMemo(() => {
    const enabled: Array<{ key: PermissionKey; label: string }> = [];
    const disabled: Array<{ key: PermissionKey; label: string }> = [];
    for (const item of PERMISSION_OVERVIEW_OPTIONS) {
      if (permissionSet.has(item.key)) {
        enabled.push(item);
      } else {
        disabled.push(item);
      }
    }
    return { enabled, disabled };
  }, [permissionSet]);
  const approvedRequestCount = useMemo(
    () => requestRecords.reduce((total, item) => total + (item.status === "approved" ? 1 : 0), 0),
    [requestRecords],
  );
  const pendingPermissionChanges = useMemo(
    () => Object.values(permissionDrafts).reduce((total, memberDraft) => total + Object.keys(memberDraft).length, 0),
    [permissionDrafts],
  );

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

  const sendRegisterOtpWithServer = async (email: string, password: string) => {
    const res = await fetch("/api/auth/register-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(String((data as { error?: unknown }).error ?? "发送注册验证码失败，请重试。"));
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
        type: "signup",
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
      await sendRegisterOtpWithServer(email, password);
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
      setShowChangePassword(false);
      setShowChangePasswordConfirm(false);
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
      setShowBucketAccessKeyId(false);
      setShowBucketSecretAccessKey(false);
      resetBucketForm();
      await fetchBuckets();
      let createToast = isEditing ? "存储桶已更新" : "存储桶已添加";
      if (created?.id || selectedBucket) {
        const bucketIdToUse = created?.id ?? selectedBucket;
        if (!bucketIdToUse) return;
        invalidateFileListCache(bucketIdToUse);
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
      invalidateFileListCache(bucketId);
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
    setFileListCache({});
    setCurrentFolderLockContext({ currentPrefixLocked: false });
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
    setProfileEditOpen(false);
    setPermissionRequestOpen(false);
    setChangePasswordOpen(false);
    setDeleteAccountOpen(false);
    setDeleteOpen(false);
    setBucketDeleteTargetId(null);
    setBucketDeleteOpen(false);
    setTeamMembers([]);
    setMemberImportMode("single");
    setMemberBatchFileName("");
    setMemberBatchDrafts([]);
    setMemberBatchParsing(false);
    setMemberBatchImporting(false);
    setMemberTemplateDownloading(false);
    setMemberBatchResults([]);
    setMemberActionLoadingId(null);
    setPermissionDrafts({});
    setChangePasswordValue("");
    setChangePasswordConfirmValue("");
    setShowChangePassword(false);
    setShowChangePasswordConfirm(false);
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
    setFolderUnlockOpen(false);
    setFolderUnlockTarget(null);
    setFolderUnlockPasscode("");
    setShowFolderUnlockPasscode(false);
    setFolderLockManageOpen(false);
    setFolderLockManageTarget(null);
    setFolderLockManageInfo(null);
    setFolderLockManageHint("");
    setFolderLockManageHintEnabled(false);
    setFolderLockManagePasscode("");
    setFolderLockManagePasscodeConfirm("");
    setShowFolderLockManagePasscode(false);
    setShowFolderLockManagePasscodeConfirm(false);
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
  const invalidateFileListCache = (bucketId?: string) => {
    setFileListCache((prev) => {
      if (!bucketId) return {};
      const marker = `${bucketId}::`;
      let changed = false;
      const next: FileListCacheMap = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith(marker)) {
          changed = true;
          continue;
        }
        next[k] = v;
      }
      return changed ? next : prev;
    });
  };

  const fetchFiles = async (bucketId: string, currentPath: string[], options?: { force?: boolean }) => {
    if (!bucketId) return;
    const force = Boolean(options?.force);
    const cacheKey = makeFileListCacheKey(bucketId, currentPath);

    if (!force) {
      const cached = fileListCacheRef.current[cacheKey];
      if (cached?.items) {
        setLoading(false);
        setFileListLoading(false);
        setFiles(cached.items);
        setCurrentFolderLockContext(cached.lockContext ?? { currentPrefixLocked: false });
        setFileListError(null);
        setConnectionStatus("connected");
        setConnectionDetail(null);
        return;
      }
    }

    setLoading(true);
    setFileListLoading(true);
    setFileListError(null);
    const prefix = toPrefixFromPath(currentPath);
    try {
      const res = await fetchWithAuth(`/api/files?bucket=${encodeURIComponent(bucketId)}&prefix=${encodeURIComponent(prefix)}`);
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setFiles([]);
        const lock = (data as { lock?: { prefix?: string; hint?: string } }).lock;
        if (res.status === 423 && lock?.prefix && bucketId) {
          setFolderUnlockTarget({
            bucketId,
            prefix: lock.prefix,
            hint: lock.hint,
            nextAction: "refresh",
          });
          setFolderUnlockPasscode("");
          setShowFolderUnlockPasscode(false);
          setFolderUnlockOpen(true);
        }
        setCurrentFolderLockContext({ currentPrefixLocked: false });
        const message = toChineseErrorMessage((data as { error?: unknown }).error, "读取文件列表失败");
        setFileListError(message);
        setConnectionStatus("error");
        setConnectionDetail(null);
        setBucketUsageError(null);
        return;
      }
      const items = Array.isArray((data as { items?: unknown }).items)
        ? (((data as { items?: FileItem[] }).items ?? []) as FileItem[])
        : [];
      const lockContextRaw = (data as { lockContext?: { currentPrefixLocked?: unknown; prefix?: unknown; hint?: unknown } }).lockContext;
      const lockContext = {
        currentPrefixLocked: Boolean(lockContextRaw?.currentPrefixLocked),
        prefix: typeof lockContextRaw?.prefix === "string" ? lockContextRaw.prefix : undefined,
        hint: typeof lockContextRaw?.hint === "string" ? lockContextRaw.hint : null,
      };
      setFiles(items);
      setCurrentFolderLockContext(lockContext);
      setFileListCache((prev) => ({ ...prev, [cacheKey]: { items, updatedAt: Date.now(), lockContext } }));
      setFileListError(null);
      setConnectionStatus("connected");
      setConnectionDetail(null);
    } catch (e) {
      setFiles([]);
      setCurrentFolderLockContext({ currentPrefixLocked: false });
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

  const fetchBuckets = async () => {
    if (!authRef.current) {
      setAuthRequired(true);
      if (restoringSessionRef.current) {
        restoringSessionRef.current = false;
        setRestoringSession(false);
      }
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
        setConnectionDetail(restoringSessionRef.current ? "请登录后继续使用" : "登录已失效，请重新登录");
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
          setFileListCache({});
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
    } finally {
      if (restoringSessionRef.current) {
        restoringSessionRef.current = false;
        setRestoringSession(false);
      }
    }
  };

  const fetchMeInfo = async () => {
    if (!authRef.current) {
      setMeInfo(null);
      return;
    }
    try {
      setMeLoading(true);
      const res = await fetchWithAuth("/api/me");
      const data = (await readJsonSafe(res)) as Partial<MePayload> & { error?: unknown };
      if (!res.ok) {
        throw new Error(String(data.error ?? "读取账号信息失败"));
      }
      const next = data as MePayload;
      setMeInfo(next);
      setProfileNameDraft(next.profile.displayName || "");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "读取账号信息失败，请稍后重试。"));
    } finally {
      setMeLoading(false);
    }
  };

  const saveDisplayName = async () => {
    const name = profileNameDraft.trim();
    if (!name) {
      setToast("用户名不能为空");
      return;
    }
    try {
      setProfileSaving(true);
      const res = await fetchWithAuth("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: name }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "更新用户名失败"));
      setToast("用户名已更新");
      await fetchMeInfo();
      setProfileEditOpen(false);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "更新用户名失败，请稍后重试。"));
    } finally {
      setProfileSaving(false);
    }
  };

  const fetchTeamMembers = async () => {
    if (!authRef.current || !canReadTeamMembers) return;
    try {
      setTeamMembersLoading(true);
      const res = await fetchWithAuth("/api/team/members");
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "读取成员失败"));
      const members = Array.isArray((data as { members?: unknown }).members)
        ? ((data as { members: TeamMemberRecord[] }).members ?? [])
        : [];
      setTeamMembers(members);
      setPermissionDrafts({});
      setMemberActionLoadingId(null);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "读取成员失败，请稍后重试。"));
    } finally {
      setTeamMembersLoading(false);
    }
  };

  const fetchPermissionRequests = async () => {
    if (!authRef.current) return;
    try {
      setRequestLoading(true);
      const res = await fetchWithAuth("/api/team/requests");
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "读取权限申请失败"));
      const requests = Array.isArray((data as { requests?: unknown }).requests)
        ? ((data as { requests: PermissionRequestRecord[] }).requests ?? [])
        : [];
      setRequestRecords(requests);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "读取权限申请失败，请稍后重试。"));
    } finally {
      setRequestLoading(false);
    }
  };

  const submitPermissionRequest = async () => {
    try {
      setRequestSubmitting(true);
      const res = await fetchWithAuth("/api/team/requests", {
        method: "POST",
        body: JSON.stringify({ permKey: requestPermKey, reason: requestReason.trim() }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "提交权限申请失败"));
      setRequestReason("");
      setToast("权限申请已提交");
      await fetchPermissionRequests();
      await fetchMeInfo();
    } catch (error) {
      setToast(toChineseErrorMessage(error, "提交权限申请失败，请稍后重试。"));
    } finally {
      setRequestSubmitting(false);
    }
  };

  const clearApprovedPermissionRequests = async (scope: "self" | "team" = "self") => {
    if (approvedRequestCount <= 0) {
      setToast("当前没有可清除的已批准记录");
      return;
    }
    const confirmText =
      scope === "team"
        ? "确定清除当前团队所有“已批准”的权限申请记录吗？该操作会同步删除数据库记录。"
        : "确定清除所有“已批准”的权限申请记录吗？该操作会同步删除数据库记录。";
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(confirmText);
      if (!confirmed) return;
    }
    try {
      setRequestClearing(true);
      const suffix = scope === "team" ? "?scope=team" : "";
      const res = await fetchWithAuth(`/api/team/requests${suffix}`, { method: "DELETE" });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "清除已批准申请失败"));
      const deleted = Number((data as { deleted?: unknown }).deleted ?? 0);
      setToast(`${scope === "team" ? "已清除团队" : "已清除"} ${Number.isFinite(deleted) ? deleted : 0} 条已批准记录`);
      await fetchPermissionRequests();
    } catch (error) {
      setToast(toChineseErrorMessage(error, "清除已批准申请失败，请稍后重试。"));
    } finally {
      setRequestClearing(false);
    }
  };

  const createTeamMember = async () => {
    const email = newMemberEmail.trim();
    const password = newMemberPassword.trim();
    const displayNameInput = newMemberDisplayName.trim();
    if (!email || !password || !displayNameInput) {
      setToast("请填写成员邮箱、用户名和密码");
      return;
    }
    try {
      setMemberCreating(true);
      const res = await fetchWithAuth("/api/team/members", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          displayName: displayNameInput,
          role: newMemberRole,
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "新增成员失败"));
      setNewMemberEmail("");
      setNewMemberPassword("");
      setNewMemberDisplayName("");
      setNewMemberRole("member");
      setToast("成员已创建");
      await fetchTeamMembers();
      await fetchMeInfo();
    } catch (error) {
      const raw = String(error instanceof Error ? error.message : error ?? "").trim();
      if (raw) {
        setToast(toChineseErrorMessage(raw, raw));
      } else {
        setToast("新增成员失败，请稍后重试。");
      }
    } finally {
      setMemberCreating(false);
    }
  };

  const clearMemberBatchState = () => {
    setMemberBatchFileName("");
    setMemberBatchDrafts([]);
    setMemberBatchParsing(false);
    setMemberBatchImporting(false);
    setMemberTemplateDownloading(false);
    setMemberBatchResults([]);
    if (memberBatchFileRef.current) {
      memberBatchFileRef.current.value = "";
    }
  };

  const loadXlsxRuntime = async (): Promise<XlsxRuntime> => {
    if (xlsxRuntimeRef.current) return xlsxRuntimeRef.current;
    if (typeof window === "undefined") {
      throw new Error("当前环境不支持解析 Excel 文件");
    }
    const existing = (window as unknown as { XLSX?: XlsxRuntime }).XLSX;
    if (existing) {
      xlsxRuntimeRef.current = existing;
      return existing;
    }

    await new Promise<void>((resolve, reject) => {
      const scriptId = "r2-member-xlsx-runtime";
      const found = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (found) {
        if ((window as unknown as { XLSX?: XlsxRuntime }).XLSX || found.getAttribute("data-loaded") === "1") {
          resolve();
          return;
        }
        found.addEventListener("load", () => resolve(), { once: true });
        found.addEventListener("error", () => reject(new Error("加载 Excel 解析库失败")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      script.async = true;
      script.onload = () => {
        script.setAttribute("data-loaded", "1");
        resolve();
      };
      script.onerror = () => reject(new Error("加载 Excel 解析库失败，请检查网络"));
      document.head.appendChild(script);
    });

    const loaded = (window as unknown as { XLSX?: XlsxRuntime }).XLSX;
    if (!loaded) throw new Error("Excel 解析库加载失败");
    xlsxRuntimeRef.current = loaded;
    return loaded;
  };

  const applyMemberImportRows = (rows: string[][]) => {
    const existingEmails = new Set(
      teamMembers
        .map((member) => String(member.email ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    const drafts = buildMemberBatchDrafts(rows, existingEmails);
    setMemberBatchDrafts(drafts);
    setMemberBatchResults([]);
    if (!drafts.length) {
      setToast("没有识别到可导入的数据行");
      return;
    }
    const invalid = drafts.filter((item) => item.errors.length > 0).length;
    setToast(
      invalid > 0
        ? `已解析 ${drafts.length} 条，含 ${invalid} 条待修正`
        : `已解析 ${drafts.length} 条，校验通过`,
    );
  };

  const parseMemberFile = async (file: File) => {
    const fileName = file.name || "未命名文件";
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!["xls", "xlsx"].includes(ext)) {
      throw new Error("仅支持 .xls/.xlsx 文件");
    }

    const xlsx = await loadXlsxRuntime();
    const buffer = await file.arrayBuffer();
    const wb = xlsx.read(buffer, { type: "array", cellDates: false, raw: false });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new Error("Excel 文件内没有可读取的工作表");
    const firstSheet = wb.Sheets[firstSheetName];
    const matrixRaw = xlsx.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false, raw: false });
    const matrix = (Array.isArray(matrixRaw) ? matrixRaw : []).map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()),
    );
    return matrix;
  };

  const handleMemberFilePicked = async (file: File) => {
    try {
      setMemberBatchParsing(true);
      const matrix = await parseMemberFile(file);
      setMemberBatchFileName(file.name || "");
      applyMemberImportRows(matrix);
    } catch (error) {
      setMemberBatchDrafts([]);
      setMemberBatchResults([]);
      setToast(toChineseErrorMessage(error, "解析导入文件失败，请检查格式"));
    } finally {
      setMemberBatchParsing(false);
    }
  };

  const downloadMemberImportTemplate = async () => {
    try {
      setMemberTemplateDownloading(true);
      const xlsx = await loadXlsxRuntime();
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet(MEMBER_IMPORT_TEMPLATE_ROWS);
      xlsx.utils.book_append_sheet(wb, ws, "成员导入模板");
      xlsx.writeFile(wb, "团队成员导入模板.xlsx");
      setToast("模板已下载");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "模板下载失败，请稍后重试"));
    } finally {
      setMemberTemplateDownloading(false);
    }
  };

  const importMemberBatch = async () => {
    if (!memberBatchDrafts.length) {
      setToast("请先解析导入数据");
      return;
    }
    const invalid = memberBatchDrafts.filter((item) => item.errors.length > 0);
    if (invalid.length > 0) {
      setToast(`当前有 ${invalid.length} 条数据校验失败，请修正后再导入`);
      return;
    }
    try {
      setMemberBatchImporting(true);
      const res = await fetchWithAuth("/api/team/members", {
        method: "POST",
        body: JSON.stringify({
          members: memberBatchDrafts.map((item) => ({
            displayName: item.displayName,
            email: item.email,
            password: item.password,
            role: item.role,
          })),
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "批量导入失败"));

      const createdCount = Math.max(0, Number((data as { createdCount?: unknown }).createdCount ?? 0));
      const failedCount = Math.max(0, Number((data as { failedCount?: unknown }).failedCount ?? 0));
      const failuresRaw = Array.isArray((data as { failures?: unknown }).failures)
        ? ((data as { failures: MemberBatchResult[] }).failures ?? [])
        : [];
      setMemberBatchResults(failuresRaw);
      setToast(`批量导入完成：成功 ${createdCount} 条，失败 ${failedCount} 条`);

      if (createdCount > 0) {
        setNewMemberDisplayName("");
        setNewMemberEmail("");
        setNewMemberPassword("");
        setNewMemberRole("member");
        await Promise.all([fetchTeamMembers(), fetchMeInfo()]);
      }
      if (failedCount === 0) {
        clearMemberBatchState();
      }
    } catch (error) {
      setToast(toChineseErrorMessage(error, "批量导入失败，请稍后重试。"));
    } finally {
      setMemberBatchImporting(false);
    }
  };

  const updateMemberRole = async (member: TeamMemberRecord, role: AppRole) => {
    try {
      const res = await fetchWithAuth("/api/team/members", {
        method: "PATCH",
        body: JSON.stringify({ memberId: member.id, role }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "更新角色失败"));
      setToast("角色已更新");
      await fetchTeamMembers();
    } catch (error) {
      setToast(toChineseErrorMessage(error, "更新角色失败，请稍后重试。"));
    }
  };

  const updateMemberStatus = async (member: TeamMemberRecord, status: "active" | "disabled") => {
    try {
      const res = await fetchWithAuth("/api/team/members", {
        method: "PATCH",
        body: JSON.stringify({ memberId: member.id, status }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "更新成员状态失败"));
      setToast(status === "active" ? "成员已启用" : "成员已禁用");
      await fetchTeamMembers();
    } catch (error) {
      setToast(toChineseErrorMessage(error, "更新成员状态失败，请稍后重试。"));
    }
  };

  const resetMemberPassword = async (member: TeamMemberRecord) => {
    if (member.userId === auth?.userId) {
      setToast("请在账号中心修改自己的密码");
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm(`确认重置成员 ${member.email || member.displayName || member.userId} 的密码吗？`);
      if (!ok) return;
    }
    const actionKey = `reset:${member.id}`;
    try {
      setMemberActionLoadingId(actionKey);
      const res = await fetchWithAuth("/api/team/members", {
        method: "PATCH",
        body: JSON.stringify({ memberId: member.id, action: "reset_password" }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "重置密码失败"));
      const password = String((data as { password?: unknown }).password ?? "").trim();
      setResetPasswordResult({
        memberLabel: member.email || member.displayName || member.userId,
        password: password || "（服务端未返回）",
      });
      setResetPasswordResultOpen(true);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "重置密码失败，请稍后重试。"));
    } finally {
      setMemberActionLoadingId(null);
    }
  };

  const deleteMemberAccount = async (member: TeamMemberRecord) => {
    if (member.userId === auth?.userId) {
      setToast("请在账号中心注销当前账号");
      return;
    }
    if (typeof window !== "undefined") {
      const confirmInput = window.prompt(
        `即将注销账号：${member.email || member.userId}\\n该操作会删除该账号及其全部数据，无法恢复。\\n请输入“注销”继续：`,
      );
      if ((confirmInput ?? "").trim() !== "注销") {
        setToast("已取消注销操作");
        return;
      }
    }
    const actionKey = `delete:${member.id}`;
    try {
      setMemberActionLoadingId(actionKey);
      const res = await fetchWithAuth("/api/team/members", {
        method: "PATCH",
        body: JSON.stringify({ memberId: member.id, action: "delete_account" }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "注销账号失败"));
      setToast("成员账号已注销并清理数据");
      await Promise.all([fetchTeamMembers(), fetchMeInfo()]);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "注销账号失败，请稍后重试。"));
    } finally {
      setMemberActionLoadingId(null);
    }
  };

  const isRoleDefaultPermissionEnabled = (role: AppRole, permKey: PermissionKey) => {
    if (role === "super_admin") return true;
    if (role === "admin") return !permKey.startsWith("sys.");
    if (role === "member") {
      return (
        permKey === "account.self.manage" ||
        permKey === "account.self.delete" ||
        permKey === "bucket.read" ||
        permKey === "object.list" ||
        permKey === "object.read" ||
        permKey === "object.search" ||
        permKey === "team.member.read" ||
        permKey === "team.permission.request.create"
      );
    }
    return false;
  };

  const getMemberBasePermissionEnabled = (member: TeamMemberRecord, permKey: PermissionKey) => {
    const override = member.permissions.find((p) => p.permKey === permKey);
    if (override) return Boolean(override.enabled);
    return isRoleDefaultPermissionEnabled(member.role, permKey);
  };

  const getMemberPermissionEnabled = (member: TeamMemberRecord, permKey: PermissionKey) => {
    const draft = permissionDrafts[member.id]?.[permKey];
    if (typeof draft === "boolean") return draft;
    return getMemberBasePermissionEnabled(member, permKey);
  };

  const getMemberPermissionVisualState = (
    member: TeamMemberRecord,
    permKey: PermissionKey,
  ): "enabled" | "disabled" | "draft_enable" | "draft_disable" => {
    const baseEnabled = getMemberBasePermissionEnabled(member, permKey);
    const draft = permissionDrafts[member.id]?.[permKey];
    if (typeof draft === "boolean") {
      if (!baseEnabled && draft) return "draft_enable";
      if (baseEnabled && !draft) return "draft_disable";
      return draft ? "enabled" : "disabled";
    }
    return baseEnabled ? "enabled" : "disabled";
  };

  const toggleMemberPermissionDraft = (member: TeamMemberRecord, permKey: PermissionKey) => {
    const current = getMemberPermissionEnabled(member, permKey);
    const nextEnabled = !current;
    const baseEnabled = getMemberBasePermissionEnabled(member, permKey);

    setPermissionDrafts((prev) => {
      const memberDraft = { ...(prev[member.id] ?? {}) };
      if (nextEnabled === baseEnabled) {
        delete memberDraft[permKey];
      } else {
        memberDraft[permKey] = nextEnabled;
      }

      if (Object.keys(memberDraft).length === 0) {
        const next = { ...prev };
        delete next[member.id];
        return next;
      }

      return { ...prev, [member.id]: memberDraft };
    });
  };

  const clearPermissionDrafts = () => {
    setPermissionDrafts({});
  };

  const savePermissionDrafts = async () => {
    const tasks = teamMembers.flatMap((member) => {
      const memberDraft = permissionDrafts[member.id];
      if (!memberDraft) return [];
      return Object.entries(memberDraft).map(([permKey, enabled]) => ({
        userId: member.userId,
        permKey: permKey as PermissionKey,
        enabled: Boolean(enabled),
      }));
    });

    if (!tasks.length) {
      setToast("没有需要保存的权限变更");
      return;
    }

    try {
      setPermissionBatchSaving(true);
      for (const task of tasks) {
        const res = await fetchWithAuth("/api/team/permissions", {
          method: "PATCH",
          body: JSON.stringify(task),
        });
        const data = await readJsonSafe(res);
        if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "保存权限变更失败"));
      }
      setToast(`已保存 ${tasks.length} 项权限变更`);
      setPermissionDrafts({});
      await fetchTeamMembers();
    } catch (error) {
      setToast(toChineseErrorMessage(error, "保存权限变更失败，请稍后重试。"));
    } finally {
      setPermissionBatchSaving(false);
    }
  };

  const reviewPermissionRequest = async (requestId: string, status: "approved" | "rejected") => {
    try {
      const res = await fetchWithAuth("/api/team/requests", {
        method: "PATCH",
        body: JSON.stringify({ id: requestId, status }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "审批失败"));
      setToast(status === "approved" ? "已批准申请" : "已拒绝申请");
      await Promise.all([fetchPermissionRequests(), fetchTeamMembers(), fetchMeInfo()]);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "审批失败，请稍后重试。"));
    }
  };

  const fetchPlatformSummary = async () => {
    if (!authRef.current || !canViewPlatformConsole) return;
    try {
      setPlatformLoading(true);
      const res = await fetchWithAuth("/api/platform/summary");
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "读取平台统计失败"));
      setPlatformSummary(data as PlatformSummary);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "读取平台统计失败，请稍后重试。"));
    } finally {
      setPlatformLoading(false);
    }
  };

  useEffect(() => {
    if (!teamConsoleOpen) return;
    void fetchTeamMembers();
  }, [teamConsoleOpen]);

  useEffect(() => {
    if (!teamMemberViewerOpen) return;
    void fetchTeamMembers();
  }, [teamMemberViewerOpen]);

  useEffect(() => {
    if (!platformConsoleOpen) return;
    void fetchPlatformSummary();
  }, [platformConsoleOpen]);

  useEffect(() => {
    if (!accountCenterOpen) return;
    void fetchMeInfo();
  }, [accountCenterOpen]);

  useEffect(() => {
    if (!permissionRequestOpen) return;
    void fetchPermissionRequests();
  }, [permissionRequestOpen]);

  useEffect(() => {
    if (!permissionReviewOpen) return;
    void fetchPermissionRequests();
  }, [permissionReviewOpen]);

  useEffect(() => {
    if (!accountCenterOpen || !isXlUp) {
      setAccountCenterRightHeight(null);
      return;
    }
    const el = accountCenterLeftCardRef.current;
    if (!el) return;
    let raf = 0;
    const updateHeight = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = Math.round(el.getBoundingClientRect().height);
        setAccountCenterRightHeight(next > 0 ? next : null);
      });
    };
    updateHeight();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateHeight) : null;
    observer?.observe(el);
    window.addEventListener("resize", updateHeight);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [accountCenterOpen, isXlUp]);

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
      fetchFiles(selectedBucket, path).catch(() => {});
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
    if (selectedBucket && canViewUsage) {
      fetchBucketUsage(selectedBucket);
    } else if (!canViewUsage) {
      setBucketUsage(null);
      setBucketUsageError(null);
    }
  }, [selectedBucket, auth, canViewUsage]);

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

  const getFileTypeLabel = (item: FileItem) => {
    if (item.type === "folder") return item.locked ? "加密文件夹" : "文件夹";
    const lowerName = item.name.toLowerCase();
    const ext = getFileExt(item.name);

    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/.test(lowerName)) return "图片";
    if (/\.(mp4|webm|ogg|mov|mkv|avi|m4v)$/.test(lowerName)) return "视频";
    if (/\.(mp3|wav|ogg|m4a|flac|aac|wma)$/.test(lowerName)) return "音频";
    if (/\.(docx|doc)$/.test(lowerName)) return "Word";
    if (/\.(xlsx|xls|csv)$/.test(lowerName)) return "Excel";
    if (/\.(pptx|ppt)$/.test(lowerName)) return "PPT";
    if (lowerName.endsWith(".pdf")) return "文稿";
    if (/(dwg|dxf|dwt|dwf|step|stp|iges|igs|ifc)$/.test(ext)) return "CAD";
    if (/\.(html|css|js|jsx|ts|tsx|json|java|py|go|c|cpp|h|cs|php|rb|sh|bat|cmd|xml|yaml|yml|sql|rs|swift|kt)$/.test(lowerName)) {
      return "代码";
    }
    if (/\.(txt|md|markdown|log|ini|conf)$/.test(lowerName)) return "文字";
    if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(lowerName)) return "压缩包";
    return "其他";
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

  const buildShareUrl = (share: Pick<ShareRecord, "shareCode"> & { shareUrl?: string }) => {
    if (share.shareUrl) return share.shareUrl;
    if (typeof window !== "undefined") return `${window.location.origin}/s/${encodeURIComponent(share.shareCode)}`;
    return `/s/${encodeURIComponent(share.shareCode)}`;
  };

  const buildShareQrImageUrl = (url: string) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(url)}`;

  const findShareTarget = () => {
    if (selectedItem) return selectedItem;
    const keys = Array.from(selectedKeys);
    if (keys.length !== 1) return null;
    return filteredFiles.find((item) => item.key === keys[0]) ?? null;
  };

  const openShareCreateDialog = () => {
    if (!canManageShare) {
      setToast("当前身份没有创建分享权限");
      return;
    }
    if (!selectedBucket) return;
    const target = findShareTarget();
    if (!target) {
      setToast("请先选择一个文件或文件夹再分享");
      return;
    }
    if (isItemShareBlockedByFolderLock(target)) {
      setToast("加密目录内不可分享");
      return;
    }
    setShareTarget(target);
    setShareExpireDays(7);
    setSharePasscodeEnabled(false);
    setSharePasscode("");
    setShareNote("");
    setShareResult(null);
    setShareCreateOpen(true);
  };

  const fetchShareRecords = async () => {
    if (!auth) return;
    if (!canManageShare) return;
    try {
      setShareListLoading(true);
      const res = await fetchWithAuth("/api/shares");
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "读取分享列表失败"));
      const records = Array.isArray((data as { shares?: unknown }).shares) ? ((data as { shares: ShareRecord[] }).shares ?? []) : [];
      setShareRecords(records);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "读取分享列表失败，请稍后重试。"));
    } finally {
      setShareListLoading(false);
    }
  };

  const openShareManageDialog = () => {
    if (!canManageShare) {
      setToast("当前身份没有分享管理权限");
      return;
    }
    if (isMobile) setMobileNavOpen(false);
    setShareManageOpen(true);
    void fetchShareRecords();
  };

  const openTeamMemberViewerDialog = () => {
    if (!canReadTeamMembers) {
      setToast("当前身份没有查看团队成员的权限");
      return;
    }
    if (isMobile) setMobileNavOpen(false);
    setAccountCenterOpen(false);
    setTeamMemberViewerOpen(true);
    void fetchTeamMembers();
  };

  const normalizeSharePasscodeInput = (raw: string) =>
    String(raw ?? "")
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/\u3000/g, " ")
      .trim();

  const submitShareCreate = async () => {
    if (!selectedBucket || !shareTarget) return;
    const passcode = normalizeSharePasscodeInput(sharePasscode);
    if (sharePasscodeEnabled) {
      if (!passcode) {
        setToast("请输入提取码");
        return;
      }
      if (!/^[A-Za-z0-9]{4,16}$/.test(passcode)) {
        setToast("提取码仅支持 4-16 位字母或数字");
        return;
      }
    }

    try {
      setShareSubmitting(true);
      const res = await fetchWithAuth("/api/shares", {
        method: "POST",
        body: JSON.stringify({
          bucketId: selectedBucket,
          itemType: shareTarget.type,
          itemKey: shareTarget.key,
          itemName: shareTarget.name,
          expireDays: shareExpireDays,
          passcode: sharePasscodeEnabled ? passcode : "",
          note: shareNote.trim(),
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok || !(data as { share?: unknown }).share) {
        throw new Error(String((data as { error?: unknown }).error ?? "创建分享失败"));
      }
      const created = (data as { share: ShareRecord }).share;
      setShareResult(created);
      setShareRecords((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
      setToast("分享已创建");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "创建分享失败，请稍后重试。"));
    } finally {
      setShareSubmitting(false);
    }
  };

  const copyShareLink = async (share: ShareRecord) => {
    await copyToClipboard(buildShareUrl(share));
  };

  const previewShareQr = (share: ShareRecord) => {
    const url = buildShareUrl(share);
    setShareQrPreviewUrl(url);
    setShareQrOpen(true);
  };

  const saveShareQrImage = async (shareUrl: string, shareCode = "") => {
    if (typeof window === "undefined" || !shareUrl) return;
    setShareQrSaving(true);
    try {
      const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const qrImageUrl = buildShareQrImageUrl(shareUrl);
      const res = await fetch(qrImageUrl);
      if (!res.ok) throw new Error("二维码图片生成失败");
      const blob = await res.blob();
      const safeCode = (shareCode || "share").replace(/[^A-Za-z0-9_-]/g, "");
      const fileName = `r2-share-qr-${safeCode || "image"}.png`;

      if (isMobileDevice && typeof navigator.share === "function" && typeof File !== "undefined") {
        const file = new File([blob], fileName, { type: blob.type || "image/png" });
        const canShareFiles = typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : true;
        if (canShareFiles) {
          await navigator.share({
            files: [file],
            title: "分享二维码",
            text: "请保存此二维码图片",
          });
          setToast("已打开系统分享面板，可选择“存储到相册”");
          return;
        }
      }

      type SaveFilePickerWindow = Window & {
        showSaveFilePicker?: (options?: {
          suggestedName?: string;
          types?: Array<{ description: string; accept: Record<string, string[]> }>;
        }) => Promise<{
          createWritable: () => Promise<{
            write: (data: Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      };

      const showSaveFilePicker = (window as SaveFilePickerWindow).showSaveFilePicker;
      if (!isMobileDevice && typeof showSaveFilePicker === "function") {
        const handle = await showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: "PNG 图片", accept: { "image/png": [".png"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setToast("二维码图片已保存");
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      setToast(isMobileDevice ? "二维码图片已下载，请在系统相册中查看" : "二维码图片已开始下载");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setToast(toChineseErrorMessage(error, "保存二维码失败，请稍后重试。"));
    } finally {
      setShareQrSaving(false);
    }
  };

  const stopShare = async (share: ShareRecord) => {
    try {
      const res = await fetchWithAuth(`/api/shares/${encodeURIComponent(share.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "停止分享失败"));
      setShareRecords((prev) =>
        prev.map((item) => (item.id === share.id ? { ...item, isActive: false, status: "stopped", updatedAt: new Date().toISOString() } : item)),
      );
      setToast("已停止分享");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "停止分享失败，请稍后重试。"));
    }
  };

  const cleanupStoppedSharesNow = async () => {
    try {
      setShareCleanupLoading(true);
      const res = await fetchWithAuth("/api/shares", {
        method: "PATCH",
        body: JSON.stringify({ action: "cleanup_stopped_now" }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "立即清理失败"));
      const removedRaw = (data as { removed?: unknown }).removed;
      const removed = Number.isFinite(Number(removedRaw)) ? Number(removedRaw) : 0;
      setShareRecords((prev) => prev.filter((item) => item.status !== "stopped"));
      setToast(removed > 0 ? `已清理 ${removed} 条已停止分享` : "没有可清理的已停止分享");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "立即清理失败，请稍后重试。"));
    } finally {
      setShareCleanupLoading(false);
    }
  };

  const cleanupExpiredSharesNow = async () => {
    try {
      setShareCleanupLoading(true);
      const res = await fetchWithAuth("/api/shares", {
        method: "PATCH",
        body: JSON.stringify({ action: "cleanup_expired_now" }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "立即清理失败"));
      const removedRaw = (data as { removed?: unknown }).removed;
      const removed = Number.isFinite(Number(removedRaw)) ? Number(removedRaw) : 0;
      setShareRecords((prev) => prev.filter((item) => item.status !== "expired"));
      setToast(removed > 0 ? `已清理 ${removed} 条已过期分享` : "没有可清理的已过期分享");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "立即清理失败，请稍后重试。"));
    } finally {
      setShareCleanupLoading(false);
    }
  };

  const applyFileSort = (key: FileSortKey, direction: FileSortDirection) => {
    setFileSortKey(key);
    setFileSortDirection(direction);
  };

  const toggleFileSortByKey = (key: FileSortKey) => {
    if (fileSortKey === key) {
      setFileSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setFileSortKey(key);
    setFileSortDirection(key === "time" ? "desc" : "asc");
  };

  const openFolderUnlockPrompt = (target: {
    bucketId: string;
    prefix: string;
    folderName?: string;
    hint?: string;
    nextAction: "enter" | "refresh";
  }) => {
    setFolderUnlockTarget(target);
    setFolderUnlockPasscode("");
    setShowFolderUnlockPasscode(false);
    setFolderUnlockOpen(true);
  };

  // --- 操作逻辑 ---
  const handleEnterFolder = (folderName: string) => {
    setPath([...path, folderName]);
    setSearchTerm("");
  };

  const attemptEnterFolder = (item: FileItem) => {
    if (item.type !== "folder") return;
    if (!selectedBucket) return;
    if (item.locked) {
      openFolderUnlockPrompt({
        bucketId: selectedBucket,
        prefix: item.key,
        folderName: item.name,
        nextAction: "enter",
      });
      return;
    }
    handleEnterFolder(item.name);
  };

  const submitFolderUnlock = async () => {
    if (!folderUnlockTarget) return;
    const passcode = folderUnlockPasscode.trim();
    if (!passcode) {
      setToast("请输入加密密码");
      return;
    }
    try {
      setFolderUnlockSubmitting(true);
      const res = await fetchWithAuth("/api/folder-locks", {
        method: "POST",
        body: JSON.stringify({
          action: "unlock",
          bucketId: folderUnlockTarget.bucketId,
          prefix: folderUnlockTarget.prefix,
          passcode,
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "解锁失败"));

      const target = folderUnlockTarget;
      setFolderUnlockOpen(false);
      setFolderUnlockTarget(null);
      setFolderUnlockPasscode("");
      setShowFolderUnlockPasscode(false);
      invalidateFileListCache(target.bucketId);

      if (target.nextAction === "enter" && target.folderName && selectedBucket === target.bucketId) {
        handleEnterFolder(target.folderName);
      } else if (target.nextAction === "refresh" && selectedBucket === target.bucketId) {
        invalidateFileListCache(target.bucketId);
        await fetchFiles(target.bucketId, path, { force: true });
      }
      setToast("文件夹已解锁");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "解锁失败，请重试。"));
    } finally {
      setFolderUnlockSubmitting(false);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    setPath(path.slice(0, index + 1));
    setSearchTerm("");
  };

  const refreshCurrentView = async () => {
    if (!selectedBucket) return;
    const term = searchTerm.trim();
    if (term) await runGlobalSearch(selectedBucket, term);
    else await fetchFiles(selectedBucket, path, { force: true });
  };

  const isItemShareBlockedByFolderLock = (item: FileItem | null) => {
    if (!item) return false;
    if (item.type === "folder" && item.locked) return true;
    if (currentFolderLockContext.currentPrefixLocked && currentFolderLockContext.prefix) {
      return item.key.startsWith(currentFolderLockContext.prefix);
    }
    return false;
  };

  const openFolderLockManageDialog = async (item?: FileItem | null) => {
    const targetItem = item ?? selectedItem;
    if (!targetItem || targetItem.type !== "folder") return;
    if (!selectedBucket) return;
    if (!canManageFolderLocks) {
      setToast("仅管理员可管理加密文件夹");
      return;
    }
    try {
      setFolderLockManageOpen(true);
      setFolderLockManageTarget({ bucketId: selectedBucket, prefix: targetItem.key, folderName: targetItem.name });
      setFolderLockManageLoading(true);
      setFolderLockManageExists(false);
      setFolderLockManageInfo(null);
      setFolderLockManageHint("");
      setFolderLockManagePasscode("");
      setFolderLockManagePasscodeConfirm("");
      setShowFolderLockManagePasscode(false);
      setShowFolderLockManagePasscodeConfirm(false);

      const res = await fetchWithAuth(
        `/api/folder-locks?bucket=${encodeURIComponent(selectedBucket)}&prefix=${encodeURIComponent(targetItem.key)}`,
      );
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "读取加密状态失败"));
      const lock = ((data as { lock?: FolderLockViewLite | null }).lock ?? null) as FolderLockViewLite | null;
      setFolderLockManageExists(Boolean(lock));
      setFolderLockManageInfo(lock);
      setFolderLockManageHint(lock?.hint ?? "");
      setFolderLockManageHintEnabled(Boolean(lock?.hint));
    } catch (error) {
      setToast(toChineseErrorMessage(error, "读取加密状态失败，请稍后重试。"));
      setFolderLockManageOpen(false);
      setFolderLockManageTarget(null);
    } finally {
      setFolderLockManageLoading(false);
    }
  };

  const submitFolderLockManageSave = async () => {
    if (!folderLockManageTarget) return;
    if (!canManageFolderLocks) {
      setToast("仅管理员可管理加密文件夹");
      return;
    }
    const pass = folderLockManagePasscode.trim();
    const confirm = folderLockManagePasscodeConfirm.trim();
    if (!pass) {
      setToast("请输入加密密码");
      return;
    }
    if (pass !== confirm) {
      setToast("两次输入的密码不一致");
      return;
    }
    try {
      setFolderLockManageSaving(true);
      const res = await fetchWithAuth("/api/folder-locks", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          bucketId: folderLockManageTarget.bucketId,
          prefix: folderLockManageTarget.prefix,
          passcode: pass,
          hint: "",
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "保存失败"));
      const lock = ((data as { lock?: FolderLockViewLite }).lock ?? null) as FolderLockViewLite | null;
      setFolderLockManageExists(true);
      setFolderLockManageInfo(lock);
      setFolderLockManagePasscode("");
      setFolderLockManagePasscodeConfirm("");
      setShowFolderLockManagePasscode(false);
      setShowFolderLockManagePasscodeConfirm(false);
      invalidateFileListCache(folderLockManageTarget.bucketId);
      await refreshCurrentView();
      setToast(folderLockManageExists ? "已更新加密密码" : "已启用文件夹加密");
      setFolderLockManageOpen(false);
      setFolderLockManageTarget(null);
      setFolderLockManageInfo(null);
      setFolderLockManageHint("");
      setFolderLockManageHintEnabled(false);
    } catch (error) {
      setToast(toChineseErrorMessage(error, "保存加密配置失败，请稍后重试。"));
    } finally {
      setFolderLockManageSaving(false);
    }
  };

  const submitFolderLockDelete = async () => {
    if (!folderLockManageTarget) return;
    if (!canManageFolderLocks) {
      setToast("仅管理员可管理加密文件夹");
      return;
    }
    const ok = window.confirm(`确认取消文件夹「${folderLockManageTarget.folderName}」的加密保护吗？`);
    if (!ok) return;
    try {
      setFolderLockManageDeleting(true);
      const res = await fetchWithAuth("/api/folder-locks", {
        method: "POST",
        body: JSON.stringify({
          action: "delete",
          bucketId: folderLockManageTarget.bucketId,
          prefix: folderLockManageTarget.prefix,
        }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(String((data as { error?: unknown }).error ?? "删除失败"));
      setFolderLockManageExists(false);
      setFolderLockManageInfo(null);
      setFolderLockManagePasscode("");
      setFolderLockManagePasscodeConfirm("");
      setShowFolderLockManagePasscode(false);
      setShowFolderLockManagePasscodeConfirm(false);
      invalidateFileListCache(folderLockManageTarget.bucketId);
      await refreshCurrentView();
      setToast("已取消文件夹加密");
    } catch (error) {
      setToast(toChineseErrorMessage(error, "取消加密失败，请稍后重试。"));
    } finally {
      setFolderLockManageDeleting(false);
    }
  };

  const openMkdir = () => {
    if (!canMkdirObject) {
      setToast("当前身份没有新建目录权限");
      return;
    }
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
      invalidateFileListCache(selectedBucket);
      await fetchFiles(selectedBucket, path, { force: true });
      setToast("新建文件夹成功");
    } catch {
      setToast("新建文件夹失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!canDeleteObject) {
      setToast("当前身份没有删除权限");
      return;
    }
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
      invalidateFileListCache(selectedBucket);
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
    if (!canRenameObject) {
      setToast("当前身份没有重命名权限");
      return;
    }
    if (!selectedBucket || !selectedItem) return;
    setRenameValue(selectedItem.name);
    setRenameOpen(true);
  };

  const openRenameForSelection = () => {
    if (!canRenameObject) {
      setToast("当前身份没有重命名权限");
      return;
    }
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
    if (!canRenameObject) {
      setToast("当前身份没有重命名权限");
      return;
    }
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
    if (!canRenameObject) {
      setToast("当前身份没有重命名权限");
      return;
    }
    if (!selectedBucket) return;
    setSelectedItem(item);
    setRenameValue(item.name);
    setRenameOpen(true);
  };

  const executeRename = async () => {
    if (!canRenameObject) {
      setToast("当前身份没有重命名权限");
      return;
    }
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
      invalidateFileListCache(selectedBucket);
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
    if (!canMoveCopyObject) {
      setToast("当前身份没有移动/复制权限");
      return;
    }
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
    if (!canMoveCopyObject) {
      setToast("当前身份没有移动/复制权限");
      return;
    }
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
    if (!canMoveCopyObject) {
      setToast("当前身份没有移动权限");
      return;
    }
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
    if (!canMoveCopyObject) {
      setToast("当前身份没有移动/复制权限");
      return;
    }
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
      invalidateFileListCache(selectedBucket);
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
    if (!hasPermission("object.read")) {
      setToast("当前身份没有下载权限");
      return;
    }
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
    if (!canEditBucket) {
      setToast("当前身份没有存储桶配置权限");
      return;
    }
    if (!selectedBucket) return;
    const current = getLinkConfig(selectedBucket);
    setLinkPublic(current.publicBaseUrl ?? "");
    setLinkCustom(current.customBaseUrl ?? "");
    setLinkS3BucketName(current.s3BucketName ?? "");
    setLinkOpen(true);
  };

  const saveLinkConfig = async () => {
    if (!canEditBucket) {
      setToast("当前身份没有存储桶配置权限");
      return;
    }
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
    if (isItemShareBlockedByFolderLock(item)) {
      setToast("加密目录内不支持复制外链");
      return;
    }
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

    const previewSeed = { name: item.name, key: item.key, bucket: selectedBucket, kind } as NonNullable<PreviewState>;
    setPreview(previewSeed);
    if (kind === "other") return;

    try {
      const url = await getSignedDownloadUrl(selectedBucket, item.key, item.name);
      setPreview((prev) =>
        prev && prev.key === item.key && prev.bucket === selectedBucket ? { ...prev, url } : prev,
      );
      if (kind === "text") {
        const res = await fetch(url, { headers: { Range: "bytes=0-204799" } });
        const text = await res.text();
        setPreview((prev) => (prev && prev.key === item.key ? { ...prev, text } : prev));
      }
    } catch {
      setPreview((prev) => (prev && prev.key === item.key ? null : prev));
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
      const parseUploadError = (status: number, text: string) => {
        const raw = String(text || "");
        const xmlCode = raw.match(/<Code>([^<]+)<\/Code>/i)?.[1]?.trim() || "";
        const xmlMsg = raw.match(/<Message>([^<]+)<\/Message>/i)?.[1]?.trim() || "";
        const jsonErr = raw.match(/\"error\"\s*:\s*\"([^\"]+)\"/i)?.[1]?.trim() || "";
        const merged = `${xmlCode} ${xmlMsg} ${jsonErr}`.trim();
        if (/NoSuchUpload/i.test(merged)) {
          return "分片上传会话已失效，请重试上传（系统会自动重建会话）。";
        }
        if (merged) return toChineseErrorMessage(merged, `上传失败（状态码：${status}）`);
        return `上传失败（状态码：${status}）`;
      };

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
        if (evt.lengthComputable) {
          onProgress(evt.loaded, evt.total);
        } else {
          onProgress(evt.loaded, body.size);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(body.size, body.size);
          resolve({ etag: xhr.getResponseHeader("ETag") });
        } else {
          reject(new Error(parseUploadError(xhr.status, xhr.responseText)));
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
      const primaryUrl = String(signData.url ?? "");
      const fallbackUrl = String(signData.proxyUrl ?? "").trim();
      try {
        await xhrPut(primaryUrl, file, file.type, (loaded) => onLoaded(loaded), signal);
      } catch (firstError) {
        if (fallbackUrl && fallbackUrl !== primaryUrl) {
          await xhrPut(fallbackUrl, file, file.type, (loaded) => onLoaded(loaded), signal);
          return;
        }
        throw firstError;
      }
	  };

  const uploadMultipartFile = async (
    taskId: string,
    bucket: string,
    key: string,
    file: File,
    onLoaded: (loaded: number) => void,
    signal?: AbortSignal,
    resetRetried = false,
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

    const isValidPartSize = (value: number) =>
      Number.isFinite(value) && Number.isInteger(value) && value >= 5 * 1024 * 1024;
    const shouldResetMultipartSession = (message: string) => {
      const raw = String(message || "");
      return (
        raw.includes("NoSuchUpload") ||
        raw.includes("nosuchupload") ||
        raw.includes("分片上传会话已失效") ||
        raw.includes("目标资源不存在：请检查桶名、路径或文件名。")
      );
    };

    if (resetRetried) {
      // On reset retry we must force a brand-new multipart session.
      // Do not trust in-memory task state because it may still hold stale uploadId.
      uploadId = null;
      partsMap = {};
      partSize = pickPartSize(file.size);
      deleteResumeRecord(resumeKey);
    }

    // If the persisted record doesn't match the file, ignore it.
    if (
      persisted &&
      (persisted.size !== file.size ||
        persisted.lastModified !== file.lastModified ||
        !isValidPartSize(persisted.partSize) ||
        !persisted.uploadId ||
        typeof persisted.parts !== "object")
    ) {
      uploadId = existing?.uploadId ?? null;
      partsMap = existing?.parts ?? {};
      deleteResumeRecord(resumeKey);
    }

    if (!isValidPartSize(partSize)) {
      partSize = pickPartSize(file.size);
      partsMap = {};
      uploadId = null;
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

    const partCount = Math.ceil(file.size / partSize);
    const normalizedPartsMap: Record<string, string> = {};
    for (const [pn, etag] of Object.entries(partsMap)) {
      const partNumber = Number.parseInt(pn, 10);
      if (!Number.isFinite(partNumber) || partNumber <= 0 || partNumber > partCount) continue;
      if (typeof etag !== "string" || !etag.trim()) continue;
      normalizedPartsMap[String(partNumber)] = etag;
    }
    partsMap = normalizedPartsMap;

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

    const inFlightLoaded = new Map<number, number>();
    const inFlightLoadedPeak = new Map<number, number>();
    const partSizeByNumber = (partNumber: number) => {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(file.size, start + partSize);
      return Math.max(0, end - start);
    };
    let committedBytes = Object.keys(partsMap).reduce((acc, pn) => {
      const n = Number.parseInt(pn, 10);
      if (!Number.isFinite(n) || n <= 0) return acc;
      return acc + partSizeByNumber(n);
    }, 0);
    const emitLoaded = () => {
      const inFlightBytes = Array.from(inFlightLoaded.values()).reduce((a, b) => a + b, 0);
      onLoaded(Math.min(file.size, committedBytes + inFlightBytes));
    };
    emitLoaded();

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
      const primaryUrl = String(signData.url ?? "");
      const fallbackUrl = String(signData.proxyUrl ?? "").trim();

	      let etag: string | null = null;
	      try {
        const onPartProgress = (loaded: number, total: number) => {
          const safeLoaded = Math.min(loaded, total);
          const prevPeak = inFlightLoadedPeak.get(partNumber) ?? 0;
          const nextLoaded = Math.max(prevPeak, safeLoaded);
          inFlightLoadedPeak.set(partNumber, nextLoaded);
          inFlightLoaded.set(partNumber, nextLoaded);
          emitLoaded();
        };
        try {
          const putRes = await xhrPut(primaryUrl, blob, file.type, onPartProgress, signal);
          etag = putRes.etag;
        } catch (firstErr) {
          if (fallbackUrl && fallbackUrl !== primaryUrl) {
            const putRes = await xhrPut(fallbackUrl, blob, file.type, onPartProgress, signal);
            etag = putRes.etag;
          } else {
            throw firstErr;
          }
        }
	      } finally {
	        if (!etag) {
	          inFlightLoaded.delete(partNumber);
	          emitLoaded();
	        }
	      }
	      if (!etag) throw new Error("上传响应缺少 ETag");
        inFlightLoadedPeak.delete(partNumber);
	      inFlightLoaded.delete(partNumber);
      committedBytes = Math.min(file.size, committedBytes + blob.size);
      emitLoaded();
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
          const completeMessage = toChineseErrorMessage(completeData.error, `完成分片上传失败（状态码：${completeRes.status}）`);
          const shouldResetAndRetry =
            !resetRetried &&
            (String(completeData?.error ?? completeMessage).includes("All non-trailing parts must have the same length") ||
              String(completeData?.error ?? completeMessage).includes("InvalidPart") ||
              String(completeData?.error ?? completeMessage).includes("InvalidPartOrder") ||
              shouldResetMultipartSession(completeMessage));
          if (shouldResetAndRetry) {
            await fetchWithAuth("/api/multipart", {
              method: "POST",
              body: JSON.stringify({ action: "abort", bucket, key, uploadId }),
            }).catch(() => {});
            deleteResumeRecord(resumeKey);
            updateUploadTask(taskId, (t) => ({ ...t, loaded: 0, multipart: undefined }));
            onLoaded(0);
            await uploadMultipartFile(taskId, bucket, key, file, onLoaded, signal, true);
            return;
          }
          throw new Error(completeMessage);
        }
      deleteResumeRecord(resumeKey);
    } catch (err) {
      aborted = true;
      const current = uploadTasksRef.current.find((t) => t.id === taskId);
      const status = current?.status;
      const abortedByUser = signal?.aborted === true;
      const errorMessage = err instanceof Error ? err.message : String(err ?? "");
      if (abortedByUser && status === "paused") {
        // Keep uploadId/parts for resume.
      } else if (abortedByUser && status === "canceled") {
        await fetchWithAuth("/api/multipart", {
          method: "POST",
          body: JSON.stringify({ action: "abort", bucket, key, uploadId }),
        }).catch(() => {});
        deleteResumeRecord(resumeKey);
      } else if (!resetRetried && shouldResetMultipartSession(errorMessage)) {
        await fetchWithAuth("/api/multipart", {
          method: "POST",
          body: JSON.stringify({ action: "abort", bucket, key, uploadId }),
        }).catch(() => {});
        deleteResumeRecord(resumeKey);
        updateUploadTask(taskId, (t) => ({ ...t, loaded: 0, multipart: undefined }));
        onLoaded(0);
        await uploadMultipartFile(taskId, bucket, key, file, onLoaded, signal, true);
        return;
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
        const taskStartedAt = performance.now();

        updateUploadTask(next.id, (t) => ({
          ...t,
          status: "uploading",
          startedAt: taskStartedAt,
          loaded: typeof t.loaded === "number" && t.loaded > 0 ? t.loaded : 0,
          speedBps: 0,
          error: undefined,
        }));

        // Prefer multipart for most files to improve throughput on some networks/regions.
        // Keep small files as single PUT to reduce overhead.
        // Respect deployment constraints: keep files over 70MB on multipart path.
        // <=70MB uses direct PUT, >70MB uses multipart upload.
        const threshold = 70 * 1024 * 1024;
        const uploadFn = next.file.size >= threshold ? uploadMultipartFile : uploadSingleFile;

        const speedPoints: Array<{ at: number; loaded: number }> = [
          { at: taskStartedAt, loaded: Math.max(0, next.loaded ?? 0) },
        ];
        let smoothedSpeedBps = 0;
        let lastLoaded = Math.max(0, next.loaded ?? 0);
        let lastUiUpdateAt = taskStartedAt;

        try {
          await uploadFn(next.id, next.bucket, next.key, next.file, (loaded) => {
            const now = performance.now();
            const safeLoaded = Math.max(0, loaded);
            const normalizedLoaded = Math.max(lastLoaded, safeLoaded);
            lastLoaded = normalizedLoaded;
            speedPoints.push({ at: now, loaded: normalizedLoaded });
            while (speedPoints.length > 2 && now - speedPoints[0].at > 3000) {
              speedPoints.shift();
            }
            const base = speedPoints[0];
            const deltaBytes = Math.max(0, normalizedLoaded - base.loaded);
            const deltaSec = Math.max(0.5, (now - base.at) / 1000);
            const instantSpeed = deltaBytes / deltaSec;
            smoothedSpeedBps =
              smoothedSpeedBps > 0 ? smoothedSpeedBps * 0.8 + instantSpeed * 0.2 : instantSpeed;
            const elapsedSec = Math.max(0.5, (now - taskStartedAt) / 1000);
            const avgSpeed = normalizedLoaded / elapsedSec;
            let displaySpeed = smoothedSpeedBps;
            if (Number.isFinite(avgSpeed) && avgSpeed > 0) {
              displaySpeed = Math.min(displaySpeed, avgSpeed * 1.6 + 512 * 1024);
            }
            displaySpeed = Math.min(Math.max(0, displaySpeed), 300 * 1024 * 1024);
            const shouldUpdateSpeed = now - lastUiUpdateAt >= 120;
            if (shouldUpdateSpeed) lastUiUpdateAt = now;

            updateUploadTask(next.id, (t) => ({
              ...t,
              loaded: Math.max(t.loaded, normalizedLoaded),
              speedBps: shouldUpdateSpeed && Number.isFinite(displaySpeed) ? displaySpeed : t.speedBps,
            }));
          }, controller.signal);

          updateUploadTask(next.id, (t) => ({ ...t, status: "done", loaded: t.file.size, speedBps: 0, multipart: undefined }));
          invalidateFileListCache(next.bucket);
          if (selectedBucket === next.bucket) {
            fetchFiles(next.bucket, path, { force: true }).catch(() => {});
          }
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
    if (!canUploadObject) {
      setToast("当前身份没有上传权限");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
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
        const byType = textCmp(getFileTypeLabel(a), getFileTypeLabel(b));
        if (byType !== 0) return byType * direction;
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

  const filteredShareRecords = useMemo(() => {
    return shareRecords.filter((item) => item.status === shareStatusFilter);
  }, [shareRecords, shareStatusFilter]);

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

  const getIcon = (type: string, name: string, size: "xl" | "lg" | "sm" = "lg") => {
    const iconSizeClass =
      size === "xl"
        ? "h-12 w-12 sm:h-14 sm:w-14"
        : size === "lg"
          ? "h-8 w-8"
          : "h-[2rem] w-[2rem] md:h-7 md:w-7";
    return (
      <img
        src={getFileIconSrc(type, name)}
        alt=""
        aria-hidden="true"
        className={`${iconSizeClass} shrink-0 object-contain block`}
        decoding="async"
        draggable={false}
      />
    );
  };

  if (restoringSession) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 px-4 sm:px-6 flex items-center justify-center">
        <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-900/90 dark:text-gray-200">
          <LoaderOrbit className="h-5 w-5" />
          <span>正在恢复登录状态</span>
        </div>
      </div>
    );
  }

  // --- 渲染：登录界面 ---
  if (authRequired) {
    const showAnnouncementPanel = !isMobile || loginAnnouncementOpen;
    const authLoadingText = registerOpen ? "正在提交注册信息" : "正在验证账号信息";
    const legalDocs = LEGAL_DOCS;
    const legalDocsReady = LEGAL_TAB_ORDER.every((tab) => legalDocs[tab].trim().length > 0);
    const activeLegalDoc = legalDocs[legalActiveTab].replace(/^\s*#{1,6}\s*/gm, "");
    const activeLegalDocLines = activeLegalDoc.split("\n");
    const isLegalWarningLine = (line: string) => /^\s*【重点(?:提示|红线)】/.test(line);
    const getLegalLineText = (line: string) => line.replace(/^\s*【重点(?:提示|红线)】\s*/, "");
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
                    版本号：V2.0
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
                我已阅读理解并同意全部条款
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
                activeLegalDocLines.map((line, idx) => {
                  const highlight = isLegalWarningLine(line);
                  const text = getLegalLineText(line);
                  return (
                    <React.Fragment key={`${legalActiveTab}-${idx}`}>
                      {highlight ? <span className="font-semibold text-red-600 dark:text-red-300">{text}</span> : text}
                      {idx < activeLegalDocLines.length - 1 ? "\n" : null}
                    </React.Fragment>
                  );
                })
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
          if (!canAddBucket) {
            setToast("当前身份没有添加存储桶权限");
            return;
          }
          setEditingBucketId(null);
          setBucketFormErrors({});
          setShowBucketAccessKeyId(false);
          setShowBucketSecretAccessKey(false);
		        resetBucketForm();
		        setAddBucketOpen(true);
		      };

      const openEditBucket = (bucketId?: string) => {
        if (!canEditBucket) {
          setToast("当前身份没有编辑存储桶权限");
          return;
        }
        const target = findBucketById(bucketId ?? selectedBucket);
        if (!target) {
          setToast("请先选择要编辑的存储桶");
          return;
        }
	        setEditingBucketId(target.id);
	        setBucketFormErrors({});
        setShowBucketAccessKeyId(false);
        setShowBucketSecretAccessKey(false);
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
        if (!canEditBucket) {
          setToast("当前身份没有编辑存储桶权限");
          return;
        }
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
                桶管理入口已移至底部「账号中心」模块。
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
	
	        {canViewUsage ? (
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
        ) : null}

	        <button
            type="button"
            onClick={() => {
              setAccountCenterOpen(true);
              setMobileNavOpen(false);
            }}
            className="group w-full px-3 py-2 rounded-md border border-gray-200 bg-white text-left text-xs text-gray-600 hover:border-blue-200 hover:bg-blue-50 transition-colors dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-900 dark:hover:bg-blue-950/40"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <UserCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="min-w-0 flex items-center gap-1.5">
                  <div className="min-w-0 truncate text-sm font-semibold text-blue-600 dark:text-blue-300">{displayName}</div>
                  <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-[1px] text-[10px] font-medium text-blue-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                    {roleLabel}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-gray-800 truncate dark:text-gray-100">
                  {auth?.email ? auth.email : "未读取到邮箱"}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[10px] text-gray-400 transition-colors group-hover:text-blue-600 dark:text-gray-500 dark:group-hover:text-blue-300">点击进入账号中心，管理账号与团队权限设置。</div>
	        </button>

        {canManageShare ? (
          <button
            onClick={openShareManageDialog}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 rounded-lg text-xs font-medium transition-colors dark:bg-gray-900 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-blue-950/40 dark:hover:text-blue-200 dark:hover:border-blue-900"
          >
            <Share2 className="w-3 h-3" />
            分享管理
          </button>
        ) : null}
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
	          <div className={`${compact ? "space-y-4" : "min-h-full flex flex-col justify-center space-y-6 -mt-10"} animate-in fade-in slide-in-from-right-4 duration-300`}>
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
                  <span className={`${compact ? "inline-flex items-center gap-1.5" : "inline-flex items-center justify-center gap-1.5"}`}>
                    {selectedItem.type === "folder" && selectedItem.locked ? (
                      <Lock className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-300" />
                    ) : null}
                    <span>{selectedItem.name}</span>
                  </span>
                </h3>
                {compact ? (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {selectedItem.type === "folder" ? getFileTypeLabel(selectedItem) : formatSize(selectedItem.size)}
                    {selectedItem.lastModified ? ` · ${formatDateYmd(selectedItem.lastModified)}` : ""}
	                  </div>
	                ) : (
	                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
	                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600 font-semibold dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
	                      {getFileTag(selectedItem)}
	                    </span>
	                    <span className="text-xs text-gray-500 dark:text-gray-400">
	                      {selectedItem.type === "folder" ? getFileTypeLabel(selectedItem) : "文件"}
	                      {selectedItem.type === "file" ? ` · ${formatSize(selectedItem.size)}` : ""}
	                      {selectedItem.lastModified ? ` · ${formatDateYmd(selectedItem.lastModified)}` : ""}
	                    </span>
	                  </div>
	                )}
	              </div>
	            </div>
	
	            {selectedItem.type === "folder" ? (
	              <div className={`grid grid-cols-2 ${compact ? "gap-2 pt-1" : "gap-3 pt-2"}`}>
                <button
	                  onClick={() => attemptEnterFolder(selectedItem!)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors col-span-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  {selectedItem.locked ? "解锁并打开" : "打开文件夹"}
                </button>
                <button
                  onClick={openShareCreateDialog}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors col-span-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 dark:bg-gray-900 dark:border-blue-900 dark:text-blue-200 dark:hover:bg-blue-950/30"
                >
                  <Share2 className="w-4 h-4" />
                  文件夹分享
                </button>
                {canManageFolderLocks ? (
                  <button
                    onClick={() => void openFolderLockManageDialog(selectedItem)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-sm font-medium transition-colors col-span-2 dark:bg-gray-900 dark:border-amber-900 dark:text-amber-200 dark:hover:bg-amber-950/30"
                  >
                    <Lock className="w-4 h-4" />
                    {selectedItem.locked ? "管理加密文件夹" : "加密文件夹"}
                  </button>
                ) : null}
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
                  onClick={openShareCreateDialog}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 dark:bg-gray-900 dark:border-blue-900 dark:text-blue-200 dark:hover:bg-blue-950/30"
                >
                  <Share2 className="w-4 h-4" />
                  文件分享
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
          <div className="h-full min-h-[18rem] flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 dark:bg-gray-950">
              <Search className="w-6 h-6 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 text-sm dark:text-gray-400">
              选择一个文件以查看详情
              <br />
              或进行管理
            </p>
          </div>
        )}

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
            <div className="inline-grid grid-flow-col auto-cols-[3rem] items-stretch gap-2">
              <button
                onClick={() => selectedBucket && fetchFiles(selectedBucket, path, { force: true })}
                disabled={!selectedBucket}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                title="刷新"
                aria-label="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="text-[10px] leading-none">刷新</span>
              </button>
              <button
                onClick={openMkdir}
                disabled={!selectedBucket || !!searchTerm.trim()}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                title={searchTerm.trim() ? "搜索中无法新建文件夹" : "新建文件夹"}
                aria-label="新建"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="text-[10px] leading-none">新建</span>
              </button>
              <button
                onClick={handleBatchDownload}
                disabled={selectedKeys.size === 0}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                title="批量下载（所选文件）"
                aria-label="下载"
              >
                <Download className="w-4 h-4" />
                <span className="text-[10px] leading-none">下载</span>
              </button>
              <button
                onClick={openBatchMove}
                disabled={selectedKeys.size === 0}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                title="批量移动（所选项）"
                aria-label="移动"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span className="text-[10px] leading-none">移动</span>
              </button>
              <button
                onClick={handleRenameFromToolbar}
                disabled={selectedKeys.size > 1 || (selectedKeys.size === 0 && !selectedItem)}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                title="重命名（仅支持单选）"
                aria-label="重命名"
              >
                <Edit2 className="w-4 h-4" />
                <span className="text-[10px] leading-none">重命名</span>
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
                onClick={openShareCreateDialog}
                disabled={!selectedBucket || (selectedKeys.size !== 1 && !selectedItem)}
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                title="分享（需先选中一个文件或文件夹）"
                aria-label="分享"
              >
                <Share2 className="w-4 h-4" />
                <span className="text-[10px] leading-none">分享</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setThemeMode((prev) =>
                    prev === "system" ? (resolvedDark ? "light" : "dark") : prev === "dark" ? "light" : "system",
                  )
                }
                className="w-12 h-14 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 rounded-lg transition-colors active:scale-95 dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
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
                <span className="text-[10px] leading-none">主题</span>
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
                  if (!canUploadObject) {
                    setToast("当前身份没有上传权限");
                    return;
                  }
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
		            <div className="flex items-center gap-2 shrink-0">
		              <ViewModeToggle value={fileViewMode} onChange={setFileViewMode} />
		            </div>
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
                  if (!canUploadObject) {
                    setToast("当前身份没有上传权限");
                    return;
                  }
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

            <div className="grid grid-cols-8 items-stretch gap-1 pb-0.5">
              <button
                onClick={() => selectedBucket && fetchFiles(selectedBucket, path, { force: true })}
                disabled={!selectedBucket}
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="刷新"
                aria-label="刷新"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">刷新</span>
              </button>
              <button
                onClick={openMkdir}
                disabled={!selectedBucket || !!searchTerm.trim()}
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title={searchTerm.trim() ? "搜索中无法新建文件夹" : "新建文件夹"}
                aria-label="新建"
              >
                <FolderPlus className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">新建</span>
              </button>
              <button
                onClick={handleBatchDownload}
                disabled={selectedKeys.size === 0}
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="批量下载（所选文件）"
                aria-label="下载"
              >
                <Download className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">下载</span>
              </button>
              <button
                onClick={openBatchMove}
                disabled={selectedKeys.size === 0}
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="批量移动（所选项）"
                aria-label="移动"
              >
                <ArrowRightLeft className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">移动</span>
              </button>
              <button
                onClick={handleRenameFromToolbar}
                disabled={selectedKeys.size > 1 || (selectedKeys.size === 0 && !selectedItem)}
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="重命名（仅支持单选）"
                aria-label="重命名"
              >
                <Edit2 className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">重命名</span>
              </button>
              <button
                onClick={handleDelete}
                disabled={selectedKeys.size === 0 && !selectedItem}
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-red-200 dark:hover:bg-red-950/40"
                title="删除（所选项）"
                aria-label="删除"
              >
                <Trash2 className="w-5 h-5" />
                <span className="text-[10px] leading-none">删除</span>
              </button>
              <button
                onClick={openShareCreateDialog}
                disabled={!selectedBucket || (selectedKeys.size !== 1 && !selectedItem)}
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
                title="分享（需先选中一个文件或文件夹）"
                aria-label="分享"
              >
                <Share2 className="w-5 h-5" />
                <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400">分享</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setThemeMode((prev) =>
                    prev === "system" ? (resolvedDark ? "light" : "dark") : prev === "dark" ? "light" : "system",
                  )
                }
                className="w-full h-14 flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors active:scale-95 dark:text-gray-200 dark:hover:bg-gray-800"
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
                      {canAddBucket
                        ? "当前账号还没有可用存储桶，请点击「新增存储桶」并填写你的 R2 账号参数后继续。"
                        : "当前账号尚未配置可用存储桶，请联系管理员完成配置。"}
                    </div>
                  </div>
                  <button
                    onClick={openAddBucket}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    {canAddBucket ? "新增存储桶" : "联系管理员"}
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
                    onClick={() => selectedBucket && fetchFiles(selectedBucket, path, { force: true })}
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
                  <div
                    className={`px-4 py-3 sm:py-2.5 text-[11px] font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 dark:bg-gray-950/30 dark:border-gray-800 dark:text-gray-400 ${
                      fileViewMode === "list"
                        ? "flex items-center md:grid md:grid-cols-[1.75rem_minmax(0,1fr)_7rem_8.25rem_9.5rem] md:items-center md:gap-x-0"
                        : "flex items-center gap-2"
                    }`}
                  >
                    <div className="w-7 flex items-center justify-start">
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
                    <div className="flex-1 min-w-0 flex items-center gap-px">
                      <span>名称</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSortByKey("name");
                        }}
                        className={`hidden h-6 w-6 items-center justify-center rounded-sm md:inline-flex transition-colors ${
                          fileSortKey === "name"
                            ? "text-blue-600 dark:text-blue-300"
                            : "text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                        }`}
                        title={`名称排序（${fileSortKey === "name" ? (fileSortDirection === "asc" ? "升序" : "降序") : "未启用"}）`}
                        aria-label="按名称排序"
                      >
                        <SortTriangleIcon active={fileSortKey === "name"} direction={fileSortDirection} />
                      </button>
                      <div className="md:hidden">
                        <SortControl
                          disabled={!selectedBucket || loading || fileListLoading || searchLoading}
                          sortKey={fileSortKey}
                          sortDirection={fileSortDirection}
                          onChange={applyFileSort}
                          compact
                          small
                        />
                      </div>
                    </div>
                    <div className="ml-auto shrink-0 md:hidden">
                      <ViewModeToggle value={fileViewMode} onChange={setFileViewMode} compact />
                    </div>
                    {fileViewMode === "list" ? (
                    <div className="hidden w-20 shrink-0 items-center justify-start gap-px text-left md:flex md:w-auto md:pl-4">
                      <span>类型</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSortByKey("type");
                        }}
                        className={`h-5 w-5 items-center justify-center rounded-sm inline-flex transition-colors ${
                          fileSortKey === "type"
                            ? "text-blue-600 dark:text-blue-300"
                            : "text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                        }`}
                        title={`类型排序（${fileSortKey === "type" ? (fileSortDirection === "asc" ? "升序" : "降序") : "未启用"}）`}
                        aria-label="按类型排序"
                      >
                        <SortTriangleIcon active={fileSortKey === "type"} direction={fileSortDirection} />
                      </button>
                    </div>
                    ) : null}
                    {fileViewMode === "list" ? (
                    <div className="hidden w-24 shrink-0 items-center justify-start gap-px text-left md:flex md:w-auto md:justify-end md:pr-3">
                      <span>大小</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSortByKey("size");
                        }}
                        className={`h-5 w-5 items-center justify-center rounded-sm inline-flex transition-colors ${
                          fileSortKey === "size"
                            ? "text-blue-600 dark:text-blue-300"
                            : "text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                        }`}
                        title={`大小排序（${fileSortKey === "size" ? (fileSortDirection === "asc" ? "升序" : "降序") : "未启用"}）`}
                        aria-label="按大小排序"
                      >
                        <SortTriangleIcon active={fileSortKey === "size"} direction={fileSortDirection} />
                      </button>
                    </div>
                    ) : null}
                    {fileViewMode === "list" ? (
                    <div className="hidden w-[132px] shrink-0 items-center justify-start gap-px text-left md:flex md:w-auto md:justify-end md:pr-2">
                      <span>修改时间</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSortByKey("time");
                        }}
                        className={`h-5 w-5 items-center justify-center rounded-sm inline-flex transition-colors ${
                          fileSortKey === "time"
                            ? "text-blue-600 dark:text-blue-300"
                            : "text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                        }`}
                        title={`时间排序（${fileSortKey === "time" ? (fileSortDirection === "asc" ? "升序" : "降序") : "未启用"}）`}
                        aria-label="按时间排序"
                      >
                        <SortTriangleIcon active={fileSortKey === "time"} direction={fileSortDirection} />
                      </button>
                    </div>
                    ) : null}
                  </div>
                  {fileViewMode === "list" ? (
                    <div>
                      {filteredFiles.map((file) => {
                        const checked = selectedKeys.has(file.key);
                        return (
                          <div
                            key={file.key}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isMobile) {
                                if (file.type === "folder") attemptEnterFolder(file);
                                else previewItem(file);
                                return;
                              }
                              setSelectedItem(file);
                              setSelectedKeys((prev) => {
                                if (prev.size === 1 && prev.has(file.key)) return prev;
                                return new Set([file.key]);
                              });
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (isMobile) return;
                              if (file.type === "folder") attemptEnterFolder(file);
                              else previewItem(file);
                            }}
                            className={`group flex items-center px-4 py-3 md:py-3.5 text-sm border-b border-gray-100 hover:bg-gray-50 cursor-pointer md:grid md:grid-cols-[1.75rem_minmax(0,1fr)_7rem_8.25rem_9.5rem] md:items-center md:gap-x-0 dark:border-gray-800 dark:hover:bg-gray-800 ${
                              selectedItem?.key === file.key ? "bg-blue-50 dark:bg-blue-950/30" : "bg-white dark:bg-gray-900"
                            }`}
                          >
                            <div className="w-7 flex items-center justify-start">
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
                            <div className="flex-1 min-w-0 flex items-center gap-2.5 md:gap-3 pr-2">
                              <div className="shrink-0 relative">
                                {getIcon(file.type, file.name, "sm")}
                                {file.type === "folder" && file.locked ? (
                                  <span className="absolute bottom-0 right-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm ring-1 ring-white dark:bg-amber-400 dark:text-gray-900 dark:ring-gray-900">
                                    <Lock className="h-2.5 w-2.5" />
                                  </span>
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="min-w-0 flex items-center gap-2">
                                  <div
                                    className="truncate transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-300"
                                    title={file.name}
                                  >
                                    {file.name}
                                  </div>
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-gray-400 md:hidden dark:text-gray-500">
                                  <span className="shrink-0 text-[10px] px-1.5 py-[1px] rounded border border-gray-200 bg-white text-gray-500 font-medium dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                                    {getFileTag(file)}
                                  </span>
                                  <span>{formatSize(file.size)}</span>
                                  <span className="text-gray-300 dark:text-gray-600">|</span>
                                  <span>{formatDateYmd(file.lastModified)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="hidden w-20 shrink-0 text-xs text-gray-500 md:block md:w-auto md:pl-4 dark:text-gray-400" title={getFileTypeLabel(file)}>
                              {getFileTypeLabel(file)}
                            </div>
                            <div className="hidden w-24 shrink-0 text-right text-xs text-gray-500 md:block md:w-auto md:pr-3 dark:text-gray-400">
                              {formatSize(file.size)}
                            </div>
                            <div className="hidden w-[132px] shrink-0 text-right text-xs text-gray-500 md:block md:w-auto md:pr-2 dark:text-gray-400">
                              {formatDateYmd(file.lastModified)}
                            </div>
                            <div className="w-12 flex justify-end md:hidden">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItem(file);
                                  setMobileDetailOpen(true);
                                }}
                                className="h-9 w-9 translate-x-1.5 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 active:scale-95 transition dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                                aria-label="操作"
                                title="操作"
                              >
                                <EllipsisVertical className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 sm:p-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {filteredFiles.map((file) => {
                          const checked = selectedKeys.has(file.key);
                          const active = checked || selectedItem?.key === file.key;
                          return (
                            <div
                              key={file.key}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isMobile) {
                                  if (file.type === "folder") attemptEnterFolder(file);
                                  else previewItem(file);
                                  return;
                                }
                                setSelectedItem(file);
                                setSelectedKeys((prev) => {
                                  if (prev.size === 1 && prev.has(file.key)) return prev;
                                  return new Set([file.key]);
                                });
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (isMobile) return;
                                if (file.type === "folder") attemptEnterFolder(file);
                                else previewItem(file);
                              }}
                              className={`group relative cursor-pointer rounded-xl border p-3 transition-colors ${
                                active
                                  ? "border-blue-300 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/25"
                                  : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/70"
                              }`}
                            >
                              <div className="absolute left-2 top-2 z-10">
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
                                  className="h-4 w-4"
                                />
                              </div>
                              <div className="absolute right-2 top-2 z-10 md:hidden">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedItem(file);
                                    setMobileDetailOpen(true);
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-blue-50/70 hover:text-blue-600 active:scale-95 transition dark:text-gray-300 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                                  aria-label="操作"
                                  title="操作"
                                >
                                  <EllipsisVertical className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="flex min-h-[9.5rem] flex-col pt-6">
                                <div className="flex h-16 items-center justify-center">
                                  <div className="relative">
                                    {getIcon(file.type, file.name, "xl")}
                                    {file.type === "folder" && file.locked ? (
                                      <span className="absolute bottom-0 right-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm ring-1 ring-white dark:bg-amber-400 dark:text-gray-900 dark:ring-gray-900">
                                        <Lock className="h-2.5 w-2.5" />
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div
                                  className="mt-3 min-w-0 text-center text-sm font-medium text-gray-900 transition-colors group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-300"
                                  title={file.name}
                                >
                                  <span className="block truncate">{file.name}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] leading-none text-gray-400 dark:text-gray-500">
                                  <span className="truncate text-[11px] leading-none text-gray-400 dark:text-gray-500">
                                    {formatSize(file.size)}
                                  </span>
                                  <span className="text-gray-300 dark:text-gray-600">|</span>
                                  <span className="truncate">
                                    {formatDateYmd(file.lastModified)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                  <span className="text-gray-900 font-medium">{selectedItem!.type === "folder" ? getFileTypeLabel(selectedItem!) : "文件"}</span>
                </div>
                <div className="flex justify-between p-3 bg-white border-b border-gray-100">
                  <span className="text-gray-500">大小</span>
                  <span className="text-gray-900 font-medium">{formatSize(selectedItem!.size)}</span>
                </div>
                <div className="flex justify-between p-3 bg-gray-50/50">
                  <span className="text-gray-500">修改时间</span>
                  <span className="text-gray-900 font-medium text-right text-xs">
                    {formatDateYmd(selectedItem!.lastModified)}
                  </span>
                </div>
              </div>

              {selectedItem!.type === "folder" ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => attemptEnterFolder(selectedItem!)}
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
        open={folderUnlockOpen}
        title="解锁加密文件夹"
        description={
          folderUnlockTarget
            ? `目录：${folderUnlockTarget.folderName || folderUnlockTarget.prefix}`
            : "请输入文件夹加密密码"
        }
        onClose={() => {
          if (folderUnlockSubmitting) return;
          setFolderUnlockOpen(false);
          setFolderUnlockTarget(null);
          setFolderUnlockPasscode("");
          setShowFolderUnlockPasscode(false);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                if (folderUnlockSubmitting) return;
                setFolderUnlockOpen(false);
                setFolderUnlockTarget(null);
                setFolderUnlockPasscode("");
                setShowFolderUnlockPasscode(false);
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                void submitFolderUnlock();
              }}
              disabled={folderUnlockSubmitting || !folderUnlockTarget}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {folderUnlockSubmitting ? "解锁中..." : "解锁"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">加密密码</label>
            <div className="relative">
              <input
                value={folderUnlockPasscode}
                onChange={(e) => setFolderUnlockPasscode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitFolderUnlock();
                  }
                }}
                type={showFolderUnlockPasscode ? "text" : "password"}
                autoFocus
                className="w-full pr-11 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-base md:text-sm dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100"
                placeholder="请输入密码"
              />
              <button
                type="button"
                onClick={() => setShowFolderUnlockPasscode((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                aria-label={showFolderUnlockPasscode ? "隐藏密码" : "显示密码"}
              >
                {showFolderUnlockPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={folderLockManageOpen}
        title="管理加密文件夹"
        description={folderLockManageTarget ? `目录：${folderLockManageTarget.folderName}` : "为文件夹设置访问密码"}
        onClose={() => {
          if (folderLockManageSaving || folderLockManageDeleting) return;
          setFolderLockManageOpen(false);
          setFolderLockManageTarget(null);
          setFolderLockManageInfo(null);
          setFolderLockManagePasscode("");
          setFolderLockManagePasscodeConfirm("");
          setFolderLockManageHint("");
          setFolderLockManageHintEnabled(false);
          setShowFolderLockManagePasscode(false);
          setShowFolderLockManagePasscodeConfirm(false);
        }}
        footer={
          <div className="flex justify-between gap-2">
            <div>
              {folderLockManageExists ? (
                <button
                  onClick={() => {
                    void submitFolderLockDelete();
                  }}
                  disabled={folderLockManageDeleting || folderLockManageSaving || !folderLockManageTarget}
                  className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                >
                  {folderLockManageDeleting ? "取消中..." : "取消加密"}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFolderLockManageOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  void submitFolderLockManageSave();
                }}
                disabled={folderLockManageLoading || folderLockManageSaving || folderLockManageDeleting || !folderLockManageTarget}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {folderLockManageSaving ? "保存中..." : folderLockManageExists ? "更新密码" : "启用加密"}
              </button>
            </div>
          </div>
        }
      >
        {folderLockManageLoading ? (
          <div className="text-sm text-gray-500 dark:text-gray-300">读取中...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">当前状态</div>
                <span
                  className={`text-xs px-2 py-1 rounded-full border ${
                    folderLockManageExists
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                  }`}
                >
                  {folderLockManageExists ? "已加密" : "未加密"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                  {folderLockManageExists ? "新密码" : "加密密码"}
                </label>
                <div className="relative">
                  <input
                    value={folderLockManagePasscode}
                    onChange={(e) => setFolderLockManagePasscode(e.target.value)}
                    type={showFolderLockManagePasscode ? "text" : "password"}
                    className="w-full pr-11 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-base md:text-sm dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100"
                    placeholder="4-16 位字母或数字"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFolderLockManagePasscode((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label={showFolderLockManagePasscode ? "隐藏密码" : "显示密码"}
                  >
                    {showFolderLockManagePasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">确认密码</label>
                <div className="relative">
                  <input
                    value={folderLockManagePasscodeConfirm}
                    onChange={(e) => setFolderLockManagePasscodeConfirm(e.target.value)}
                    type={showFolderLockManagePasscodeConfirm ? "text" : "password"}
                    className="w-full pr-11 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-base md:text-sm dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100"
                    placeholder="再次输入密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFolderLockManagePasscodeConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label={showFolderLockManagePasscodeConfirm ? "隐藏密码" : "显示密码"}
                  >
                    {showFolderLockManagePasscodeConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </Modal>

      <Modal
        open={shareCreateOpen}
        title="分享文件"
        description={shareTarget ? `当前对象：${shareTarget.name}（${shareTarget.type === "folder" ? "文件夹" : "文件"}）` : "请选择文件或文件夹后再分享"}
        onClose={() => {
          setShareCreateOpen(false);
          setShareTarget(null);
          setShareResult(null);
          setSharePasscode("");
          setSharePasscodeEnabled(false);
          setShareNote("");
          setShareExpireDays(7);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShareCreateOpen(false);
                setShareTarget(null);
                setShareResult(null);
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              关闭
            </button>
            {shareResult ? (
              <button
                onClick={() => {
                  void copyShareLink(shareResult);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
              >
                复制链接
              </button>
            ) : (
              <button
                onClick={() => {
                  void submitShareCreate();
                }}
                disabled={shareSubmitting || !shareTarget}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {shareSubmitting ? "创建中..." : "创建分享"}
              </button>
            )}
          </div>
        }
      >
        {shareResult ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
              分享已创建，可直接复制链接或扫码分享。
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">分享链接</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={buildShareUrl(shareResult)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                />
                <button
                  onClick={() => {
                    void copyShareLink(shareResult);
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  复制
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-200">二维码分享</div>
              <div className="flex flex-col items-center gap-3">
                <QrImageCard src={buildShareQrImageUrl(buildShareUrl(shareResult))} alt="分享二维码" sizeClass="h-44 w-44" />
                <button
                  onClick={() => {
                    void saveShareQrImage(buildShareUrl(shareResult), shareResult.shareCode);
                  }}
                  disabled={shareQrSaving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  {shareQrSaving ? "保存中..." : "保存二维码图片"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">有效期</label>
              <div className="grid grid-cols-4 gap-2">
                {SHARE_EXPIRE_OPTIONS.map((opt) => (
                  <button
                    key={`expire-${opt.value}`}
                    type="button"
                    onClick={() => setShareExpireDays(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      shareExpireDays === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">启用提取码</label>
                <button
                  type="button"
                  onClick={() => setSharePasscodeEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    sharePasscodeEnabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                  aria-label="切换提取码"
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      sharePasscodeEnabled ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {sharePasscodeEnabled ? (
                <input
                  value={sharePasscode}
                  onChange={(e) => setSharePasscode(e.target.value)}
                  className="mt-3 w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                  placeholder="4-16 位字母或数字"
                />
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">备注（可选）</label>
              <input
                value={shareNote}
                onChange={(e) => setShareNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="例如：项目资料第一版"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={shareManageOpen}
        title="分享管理"
        description="查看已分享文件、复制链接、查看二维码与停止分享"
        panelClassName="max-w-[96vw] sm:max-w-[960px]"
        zIndex={120}
        onClose={() => setShareManageOpen(false)}
        footer={
          <div className="flex justify-between gap-2">
            <button
              onClick={() => {
                void fetchShareRecords();
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              刷新列表
            </button>
            <button
              onClick={() => setShareManageOpen(false)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              完成
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: "active", label: "生效中" },
              { value: "expired", label: "已过期" },
              { value: "stopped", label: "已停止" },
            ].map((opt) => (
              <button
                key={`share-filter-${opt.value}`}
                type="button"
                onClick={() => setShareStatusFilter(opt.value as ShareStatusFilter)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  shareStatusFilter === opt.value
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {shareStatusFilter === "stopped" || shareStatusFilter === "expired" ? (
              <button
                type="button"
                onClick={() => {
                  if (shareStatusFilter === "expired") {
                    void cleanupExpiredSharesNow();
                    return;
                  }
                  void cleanupStoppedSharesNow();
                }}
                disabled={shareCleanupLoading || !canManageShare}
                className="ml-auto rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
              >
                {shareCleanupLoading ? "清理中..." : shareStatusFilter === "expired" ? "立即清理已过期" : "立即清理已停止"}
              </button>
            ) : null}
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            提示：「已停止」和「已过期」的分享记录将会在 24 小时后自动删除数据库记录。
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden dark:border-gray-800">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[2.1fr_0.8fr_0.8fr_0.8fr_1.6fr] gap-2 px-4 py-2 text-[11px] font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sm:grid-cols-[2.1fr_0.8fr_0.8fr_0.8fr_1.2fr] dark:bg-gray-950/40 dark:border-gray-800 dark:text-gray-400">
                  <div>文件信息</div>
                  <div>有效期</div>
                  <div>提取码</div>
                  <div>状态</div>
                  <div className="text-right">操作</div>
                </div>

                {shareListLoading ? (
                  <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">正在加载分享记录...</div>
                ) : filteredShareRecords.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">暂无分享记录</div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredShareRecords.map((share) => (
                      <div key={share.id} className="grid grid-cols-[2.1fr_0.8fr_0.8fr_0.8fr_1.6fr] gap-2 px-4 py-3 text-sm sm:grid-cols-[2.1fr_0.8fr_0.8fr_0.8fr_1.2fr]">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate dark:text-gray-100">{share.itemName}</div>
                          <div className="mt-0.5 text-xs text-gray-500 truncate dark:text-gray-400">
                            {share.itemType === "folder" ? "文件夹" : "文件"} · 创建于 {new Date(share.createdAt).toLocaleString()}
                          </div>
                          {share.note ? (
                            <div className="mt-1 text-xs text-gray-600 truncate dark:text-gray-300">备注：{share.note}</div>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-600 self-center dark:text-gray-300">
                          {share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : "永久"}
                        </div>
                        <div className="text-xs text-gray-600 self-center dark:text-gray-300">{share.passcodeEnabled ? "已启用" : "未启用"}</div>
                        <div className="self-center">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              share.status === "active"
                                ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-200"
                                : share.status === "expired"
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                            }`}
                          >
                            {share.status === "active" ? "生效中" : share.status === "expired" ? "已过期" : "已停止"}
                          </span>
                        </div>
                        <div className="flex flex-nowrap items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              void copyShareLink(share);
                            }}
                            className="shrink-0 whitespace-nowrap px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            复制链接
                          </button>
                          <button
                            onClick={() => previewShareQr(share)}
                            className="shrink-0 whitespace-nowrap px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            二维码
                          </button>
                          <button
                            onClick={() => {
                              void stopShare(share);
                            }}
                            disabled={share.status !== "active" || !canManageShare}
                            className="shrink-0 whitespace-nowrap px-2 py-1 rounded-md border border-red-200 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                          >
                            停止
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={shareQrOpen}
        title="分享二维码"
        zIndex={130}
        onClose={() => {
          setShareQrOpen(false);
          setShareQrPreviewUrl("");
        }}
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => {
                setShareQrOpen(false);
                setShareQrPreviewUrl("");
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              完成
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex justify-center">
            <QrImageCard src={buildShareQrImageUrl(shareQrPreviewUrl)} alt="分享二维码" sizeClass="h-64 w-64" />
          </div>
          <input
            readOnly
            value={shareQrPreviewUrl}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
          />
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
                      <img
                        src={getFileIconSrc("folder", folder.name)}
                        alt=""
                        aria-hidden="true"
                        className="h-5 w-5 shrink-0 object-contain"
                        draggable={false}
                      />
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
        description="账号资料、身份权限与团队入口"
        panelClassName="max-w-[96vw] sm:max-w-[980px]"
        contentClassName="px-4 py-4 sm:px-5 sm:py-5"
        zIndex={90}
        showHeaderClose
        onClose={() => {
          setAccountCenterOpen(false);
          setBucketDeleteTargetId(null);
        }}
      >
        <div className="space-y-4">
          {meLoading ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              正在刷新账号信息...
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div ref={accountCenterLeftCardRef} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <UserCircle2 className="h-8 w-8" />
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="max-w-full truncate text-sm font-semibold text-blue-700 dark:text-blue-300">{displayName}</div>
                      <div className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {roleLabel}
                      </div>
                    </div>
                    <div className="mt-0.5 break-all text-[12px] leading-tight text-gray-600 dark:text-gray-300">
                      {auth?.email || "未读取到邮箱"}
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">账号操作</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileNameDraft(meInfo?.profile.displayName || profileNameDraft);
                        setProfileEditOpen(true);
                      }}
                      disabled={!hasPermission("account.self.manage")}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      修改用户名
                    </button>
                    <button
                      type="button"
                      onClick={() => setChangePasswordOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      修改密码
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLogoutOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      退出登录
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteAccountOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      注销账号
                    </button>
                  </div>
                </div>
                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">管理入口</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {canReviewPermissionRequest ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPermissionReviewOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100/70 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200 dark:hover:bg-indigo-950/35"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        权限审批
                        {(meInfo?.stats.pendingRequestCount ?? 0) > 0 ? (
                          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] leading-none text-white">
                            {meInfo?.stats.pendingRequestCount}
                          </span>
                        ) : null}
                      </button>
                    ) : null}
                    {canOpenPermissionOverview ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAccountCenterOpen(false);
                          setPermissionOverviewOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-2 text-xs font-medium text-cyan-700 hover:bg-cyan-100/70 dark:border-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-200 dark:hover:bg-cyan-950/35"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        我的权限
                      </button>
                    ) : null}
                    {canCreatePermissionRequest && !canReviewPermissionRequest ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAccountCenterOpen(false);
                          setPermissionRequestOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100/70 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200 dark:hover:bg-indigo-950/35"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        权限申请
                      </button>
                    ) : null}
                    {canManageShare ? (
                      <button
                        type="button"
                        onClick={() => {
                          openShareManageDialog();
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100/70 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200 dark:hover:bg-blue-950/35"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        分享管理
                      </button>
                    ) : null}
                    {canViewTeamConsole && meInfo?.profile.role !== "member" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTeamConsoleOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100/70 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200 dark:hover:bg-indigo-950/35"
                      >
                        <Users className="h-3.5 w-3.5" />
                        团队管理
                      </button>
                    ) : null}
                    {canReadTeamMembers && meInfo?.profile.role === "member" ? (
                      <button
                        type="button"
                        onClick={openTeamMemberViewerDialog}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100/70 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200 dark:hover:bg-indigo-950/35"
                      >
                        <Users className="h-3.5 w-3.5" />
                        团队成员
                      </button>
                    ) : null}
                    {canViewPlatformConsole ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPlatformConsoleOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100/70 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/35"
                      >
                        <Crown className="h-3.5 w-3.5" />
                        平台管理
                      </button>
                    ) : null}
                    {!canCreatePermissionRequest && !canReviewPermissionRequest && !canOpenPermissionOverview && !canManageShare && !canReadTeamMembers && !(canViewTeamConsole && meInfo?.profile.role !== "member") && !canViewPlatformConsole ? (
                      <div className="col-span-2 rounded-lg border border-dashed border-gray-200 px-2.5 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        当前身份暂无管理入口
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <div
                className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:flex xl:min-h-0 xl:flex-col"
                style={isXlUp && accountCenterRightHeight ? { height: `${accountCenterRightHeight}px` } : undefined}
              >
                <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                  <div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400">已绑定存储桶（{buckets.length}）</div>
                    <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                      {canAddBucket || canEditBucket ? "可按权限新增/编辑存储桶并切换" : "协作成员仅支持切换已授权存储桶"}
                    </div>
                  </div>
                  {canAddBucket ? (
                    <button
                      type="button"
                      onClick={openAddBucket}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      <HardDrive className="h-3.5 w-3.5" />
                      添加存储桶
                    </button>
                  ) : null}
                </div>
                {buckets.length ? (
                  <div className="max-h-[46vh] space-y-2 overflow-y-auto p-3 xl:max-h-none xl:min-h-0 xl:flex-1">
                    {buckets.map((bucket) => {
                      const isCurrent = selectedBucket === bucket.id;
                      return (
                        <div
                          key={bucket.id}
                          className={`rounded-xl border p-3 ${
                            isCurrent
                              ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"
                              : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                                {bucket.Name || bucket.bucketName || bucket.id}
                              </div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">R2 桶名：{bucket.bucketName || "-"}</div>
                              <div className="mt-0.5 break-all text-xs text-gray-500 dark:text-gray-400" title={bucket.accountId || "-"}>
                                Account ID：{bucket.accountId || "-"}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isCurrent) return;
                                  selectBucket(bucket.id);
                                  setAccountCenterOpen(false);
                                }}
                                disabled={isCurrent}
                                className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 dark:disabled:hover:bg-transparent"
                              >
                                {isCurrent ? "当前" : "切换"}
                              </button>
                              {canEditBucket ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditBucket(bucket.id)}
                                    className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openDeleteBucketConfirm(bucket.id)}
                                    className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                                  >
                                    删除
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400 xl:flex xl:min-h-0 xl:flex-1 xl:items-center">
                    当前账号还未绑定存储桶，请点击右上角「添加存储桶」。
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={canOpenPermissionOverview && permissionOverviewOpen}
        title="我的权限"
        description="查看当前账号已开启与未开启权限"
        panelClassName="max-w-[96vw] sm:max-w-[760px]"
        showHeaderClose
        onClose={() => setPermissionOverviewOpen(false)}
      >
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">当前账号权限</div>
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                已开启 {permissionOverview.enabled.length} / 未开启 {permissionOverview.disabled.length}
              </div>
              {canCreatePermissionRequest ? (
                <button
                  type="button"
                  onClick={() => {
                    setPermissionOverviewOpen(false);
                    setPermissionRequestOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100/70 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200 dark:hover:bg-indigo-950/35"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  申请权限
                </button>
              ) : null}
            </div>
          </div>
          {!meInfo ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">权限加载中...</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                <div className="mb-2 text-xs font-semibold text-blue-700 dark:text-blue-200">已开启权限</div>
                <div className="max-h-52 space-y-2 overflow-auto pr-1">
                  {permissionOverview.enabled.map((item) => (
                    <div
                      key={`perm-on-${item.key}`}
                      className="flex min-h-8 items-center gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/30">
                <div className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">未开启权限</div>
                <div className="max-h-52 space-y-2 overflow-auto pr-1">
                  {permissionOverview.disabled.map((item) => (
                    <div
                      key={`perm-off-${item.key}`}
                      className="flex min-h-8 items-center gap-2 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                    >
                      <CircleX className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={permissionRequestOpen}
        title="权限申请"
        description="向管理员申请额外操作权限"
        panelClassName="max-w-[96vw] sm:max-w-[620px]"
        showHeaderClose
        onClose={() => setPermissionRequestOpen(false)}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select
              value={requestPermKey}
              onChange={(e) => setRequestPermKey(e.target.value as PermissionKey)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
            >
              {REQUESTABLE_PERMISSION_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void submitPermissionRequest()}
              disabled={requestSubmitting}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              提交申请
            </button>
          </div>
          <textarea
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            rows={3}
            placeholder="可选：说明申请原因"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
          />
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">最近申请记录</div>
              <button
                type="button"
                onClick={() => void clearApprovedPermissionRequests()}
                disabled={requestClearing || requestLoading || approvedRequestCount <= 0}
                className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {requestClearing ? "清除中..." : `清除已批准${approvedRequestCount > 0 ? `（${approvedRequestCount}）` : ""}`}
              </button>
            </div>
            <div className="max-h-44 space-y-1 overflow-auto p-2">
              {requestLoading ? (
                <div className="px-1 py-1 text-xs text-gray-500 dark:text-gray-400">申请记录加载中...</div>
              ) : requestRecords.length ? (
                requestRecords.slice(0, 10).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] dark:border-gray-800 dark:bg-gray-950/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate">{getPermissionLabel(record.permKey)}</div>
                      <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                        申请时间：{formatDateTime(record.createdAt)}
                      </div>
                      {record.status !== "pending" ? (
                        <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                          审批时间：{formatDateTime(record.reviewedAt)}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 ${
                        record.status === "approved"
                          ? "text-green-600 dark:text-green-300"
                          : record.status === "rejected"
                            ? "text-red-600 dark:text-red-300"
                            : "text-amber-600 dark:text-amber-300"
                      }`}
                    >
                      {record.status === "approved" ? "已通过" : record.status === "rejected" ? "已拒绝" : "待审批"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-1 py-1 text-xs text-gray-500 dark:text-gray-400">暂无权限申请记录</div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={teamConsoleOpen}
        title="团队管理"
        description="成员与角色配置"
        panelClassName="max-w-none w-[98vw] sm:w-[97vw] lg:w-[1280px] xl:w-[1120px] 2xl:w-[1460px] lg:h-[820px]"
        contentClassName="px-4 py-4 sm:px-4 sm:py-5 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden"
        zIndex={110}
        showHeaderClose
        onClose={() => {
          setTeamConsoleOpen(false);
          setMemberActionLoadingId(null);
          clearMemberBatchState();
          setMemberImportMode("single");
        }}
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
              <Users className="w-3.5 h-3.5" />
              {meInfo?.team.name || "当前团队"}
            </div>
            <button
              type="button"
              onClick={() => {
                void fetchTeamMembers();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${teamMembersLoading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          <div
            className={`grid flex-1 min-h-0 grid-cols-1 gap-4 ${
              hasPermission("team.member.manage") ? "lg:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch" : ""
            }`}
          >

          {hasPermission("team.member.manage") ? (
            <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 lg:min-h-0 lg:self-stretch lg:flex lg:flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">新增成员</div>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800/60">
                  <button
                    type="button"
                    onClick={() => setMemberImportMode("single")}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                      memberImportMode === "single"
                        ? "bg-white text-blue-700 shadow-sm dark:bg-gray-900 dark:text-blue-300"
                        : "text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
                    }`}
                  >
                    单个添加
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemberImportMode("batch")}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium ${
                      memberImportMode === "batch"
                        ? "bg-white text-blue-700 shadow-sm dark:bg-gray-900 dark:text-blue-300"
                        : "text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
                    }`}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    批量导入
                  </button>
                </div>
              </div>

              <div className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
                {memberImportMode === "single" ? (
                  <div className="grid grid-cols-1 gap-2">
                    <div className="relative">
                      <UserCircle2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        value={newMemberDisplayName}
                        onChange={(e) => setNewMemberDisplayName(e.target.value)}
                        placeholder="用户名"
                        className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                      />
                    </div>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        placeholder="邮箱"
                        className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                      />
                    </div>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        value={newMemberPassword}
                        onChange={(e) => setNewMemberPassword(e.target.value)}
                        placeholder="初始密码"
                        className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[10rem] flex-1">
                        <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                        <select
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value as AppRole)}
                          disabled={!hasPermission("team.role.manage")}
                          className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                        >
                          <option value="member">协作成员</option>
                          <option value="admin">管理员</option>
                          {canViewPlatformConsole ? <option value="super_admin">超级管理员</option> : null}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void createTeamMember()}
                        disabled={memberCreating}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {memberCreating ? "添加中..." : "添加"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/30">
                  <input
                    ref={memberBatchFileRef}
                    type="file"
                    accept=".xls,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void handleMemberFilePicked(file);
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      请先下载模板填写后再上传 Excel
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void downloadMemberImportTemplate()}
                        disabled={memberTemplateDownloading || memberBatchParsing || memberBatchImporting}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {memberTemplateDownloading ? "生成中..." : "下载模板"}
                      </button>
                      <button
                        type="button"
                        onClick={() => memberBatchFileRef.current?.click()}
                        disabled={memberBatchParsing || memberBatchImporting}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        {memberBatchParsing ? "解析中..." : "上传 Excel"}
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-500 dark:text-gray-400">
                    {memberBatchFileName ? `已选择：${memberBatchFileName}` : "字段解释：admin = 管理员，member = 协作成员。"}
                  </div>

                  {memberBatchDrafts.length ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="text-gray-600 dark:text-gray-300">
                          预览 {memberBatchDrafts.length} 条，
                          <span className="text-red-600 dark:text-red-300">
                            {memberBatchDrafts.filter((item) => item.errors.length > 0).length}
                          </span>
                          条需修正
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={clearMemberBatchState}
                            disabled={memberBatchImporting}
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            清空
                          </button>
                          <button
                            type="button"
                            onClick={() => void importMemberBatch()}
                            disabled={memberBatchImporting}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            {memberBatchImporting ? "导入中..." : "确认导入"}
                          </button>
                        </div>
                      </div>
                      <div className="max-h-44 overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        {memberBatchDrafts.map((item) => (
                          <div
                            key={`batch-row-${item.rowNo}-${item.email}`}
                            className="border-b border-gray-100 px-3 py-2 text-[11px] last:border-b-0 dark:border-gray-800"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-gray-700 dark:text-gray-200">
                                第 {item.rowNo} 行 · {item.displayName || "未填写用户名"} · {item.email || "未填写邮箱"}
                              </div>
                              <div className="shrink-0 rounded-full bg-gray-500 px-2 py-0.5 text-[10px] font-medium text-white">
                                {item.role}
                              </div>
                            </div>
                            {item.errors.length ? (
                              <div className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                                <AlertTriangle className="h-3 w-3" />
                                {item.errors.join("；")}
                              </div>
                            ) : (
                              <div className="mt-1.5 text-[10px] text-green-600 dark:text-green-300">校验通过</div>
                            )}
                          </div>
                        ))}
                      </div>
                      {memberBatchResults.length ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] dark:border-amber-900 dark:bg-amber-950/30">
                          <div className="font-medium text-amber-700 dark:text-amber-200">导入失败明细</div>
                          <div className="mt-1 max-h-24 space-y-1 overflow-auto text-amber-700/90 dark:text-amber-200/90">
                            {memberBatchResults.slice(0, 20).map((item) => (
                              <div key={`failed-${item.index}-${item.email}`}>
                                第 {item.index} 行（{item.email || "未识别邮箱"}）：{item.reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      上传 Excel 后在此处显示详细信息。
                    </div>
                  )}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:min-h-0 lg:self-stretch lg:flex lg:flex-col">
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between gap-2 dark:border-gray-800">
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">团队成员（{teamMembers.length}）</div>
                {hasPermission("team.permission.grant") ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">已生效</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">本次开启</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">本次关闭</span>
                  </div>
                ) : null}
              </div>
              {hasPermission("team.permission.grant") ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={clearPermissionDrafts}
                    disabled={pendingPermissionChanges === 0 || permissionBatchSaving}
                    className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    清空变更
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePermissionDrafts()}
                    disabled={pendingPermissionChanges === 0 || permissionBatchSaving}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {permissionBatchSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                    保存变更{pendingPermissionChanges > 0 ? `（${pendingPermissionChanges}）` : ""}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="max-h-[50vh] overflow-auto lg:max-h-none lg:min-h-0 lg:flex-1">
              {teamMembersLoading ? (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">成员加载中...</div>
              ) : teamMembers.length ? (
                teamMembers.map((member) => {
                  const isSelfMember = member.userId === auth?.userId;
                  const isProtectedSuperAdmin = member.role === "super_admin" && !canViewPlatformConsole;
                  return (
                    <div
                      key={member.id}
                      className="px-3 py-3 border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-gray-800 truncate dark:text-gray-100">
                                {member.displayName || "未命名成员"}
                              </div>
                              {isSelfMember ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                                  <ShieldCheck className="h-3 w-3" />
                                  当前账号
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-gray-500 truncate dark:text-gray-400">{member.email || member.userId}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isProtectedSuperAdmin ? (
                              <div className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                                <Crown className="h-3.5 w-3.5" />
                                超级管理员
                              </div>
                            ) : (
                              <select
                                value={member.role}
                                onChange={(e) => void updateMemberRole(member, e.target.value as AppRole)}
                                disabled={!hasPermission("team.role.manage") || isSelfMember}
                                className="rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 disabled:opacity-60"
                              >
                                <option value="member">协作成员</option>
                                <option value="admin">管理员</option>
                                {canViewPlatformConsole ? <option value="super_admin">超级管理员</option> : null}
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() => void updateMemberStatus(member, member.status === "active" ? "disabled" : "active")}
                              disabled={!hasPermission("team.member.manage") || isSelfMember || isProtectedSuperAdmin}
                              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                                member.status === "active"
                                  ? "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-200 dark:hover:bg-green-950/30"
                                  : "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {member.status === "active" ? "启用中" : "已禁用"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void resetMemberPassword(member)}
                              disabled={
                                !hasPermission("team.member.manage") ||
                                isSelfMember ||
                                isProtectedSuperAdmin ||
                                memberActionLoadingId === `delete:${member.id}` ||
                                memberActionLoadingId === `reset:${member.id}`
                              }
                              className="rounded-md border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-900 dark:text-indigo-200 dark:hover:bg-indigo-950/30"
                            >
                              {memberActionLoadingId === `reset:${member.id}` ? "重置中..." : "重置密码"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteMemberAccount(member)}
                              disabled={
                                !hasPermission("team.member.manage") ||
                                isSelfMember ||
                                isProtectedSuperAdmin ||
                                memberActionLoadingId === `delete:${member.id}` ||
                                memberActionLoadingId === `reset:${member.id}`
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              {memberActionLoadingId === `delete:${member.id}` ? "注销中..." : "注销账号"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {hasPermission("team.permission.grant") ? (
                        <div className="mt-2 flex flex-wrap gap-1.5 lg:flex-nowrap lg:overflow-x-auto lg:pb-1">
                          {REQUESTABLE_PERMISSION_OPTIONS.map((opt) => {
                            const visualState = getMemberPermissionVisualState(member, opt.key);
                            const selected = visualState === "enabled" || visualState === "draft_enable";
                            const isDraft = visualState === "draft_enable" || visualState === "draft_disable";
                            return (
                              <button
                                key={`${member.id}-${opt.key}`}
                                type="button"
                                disabled={isProtectedSuperAdmin}
                                onClick={() => toggleMemberPermissionDraft(member, opt.key)}
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                  visualState === "enabled"
                                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"
                                    : visualState === "draft_enable"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                                      : visualState === "draft_disable"
                                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                                        : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    selected
                                      ? isDraft
                                        ? visualState === "draft_enable"
                                          ? "bg-emerald-500"
                                          : "bg-amber-500"
                                        : "bg-blue-500"
                                      : "bg-gray-300 dark:bg-gray-600"
                                  }`}
                                  aria-hidden="true"
                                />
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">暂无成员</div>
              )}
            </div>
          </div>

          </div>
        </div>
      </Modal>

      <Modal
        open={teamMemberViewerOpen}
        title="团队成员"
        description="查看当前项目团队成员（只读）"
        panelClassName="max-w-[96vw] sm:max-w-[760px]"
        zIndex={110}
        showHeaderClose
        onClose={() => setTeamMemberViewerOpen(false)}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
              <Users className="w-3.5 h-3.5" />
              {meInfo?.team.name || "当前团队"}
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] leading-none text-white">{teamMembers.length}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                void fetchTeamMembers();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${teamMembersLoading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="max-h-[60vh] overflow-auto">
              {teamMembersLoading ? (
                <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">成员加载中...</div>
              ) : teamMembers.length ? (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {teamMembers.map((member) => {
                    const isSelfMember = member.userId === auth?.userId;
                    const roleText =
                      member.role === "super_admin" ? "超级管理员" : member.role === "admin" ? "管理员" : "协作成员";
                    return (
                      <div key={`viewer-${member.id}`} className="px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                                {member.displayName || "未命名成员"}
                              </div>
                              {isSelfMember ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                                  <ShieldCheck className="h-3 w-3" />
                                  当前账号
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                              {member.email || member.userId}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                              {roleText}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                member.status === "active"
                                  ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200"
                                  : "border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
                              }`}
                            >
                              {member.status === "active" ? "启用中" : "已禁用"}
                            </span>
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">
                              加入于 {formatDateTime(member.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">暂无成员</div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={permissionReviewOpen}
        title="权限审批"
        description="审核团队成员发起的权限申请"
        panelClassName="max-w-[96vw] sm:max-w-[760px]"
        zIndex={120}
        showHeaderClose
        onClose={() => setPermissionReviewOpen(false)}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
              <KeyRound className="w-3.5 h-3.5" />
              {meInfo?.team.name || "当前团队"}
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] leading-none text-white">
                待审批 {requestRecords.filter((record) => record.status === "pending").length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                void fetchPermissionRequests();
                void fetchMeInfo();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${requestLoading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">申请列表</div>
              <button
                type="button"
                onClick={() => void clearApprovedPermissionRequests("team")}
                disabled={requestClearing || requestLoading || approvedRequestCount <= 0}
                className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {requestClearing ? "清除中..." : `清除已批准${approvedRequestCount > 0 ? `（${approvedRequestCount}）` : ""}`}
              </button>
            </div>
            <div className="max-h-[56vh] overflow-auto">
              {requestLoading ? (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">审批列表加载中...</div>
              ) : requestRecords.length ? (
                requestRecords.map((record) => (
                  <div
                    key={record.id}
                    className="px-3 py-2 border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-700 truncate dark:text-gray-200">
                          {getPermissionLabel(record.permKey)}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate dark:text-gray-400">
                          申请人：{record.requesterDisplayName || "未命名成员"}
                          {record.requesterEmail ? `（${record.requesterEmail}）` : `（${record.userId}）`}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate dark:text-gray-400">
                          理由：{record.reason || "无备注"}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate dark:text-gray-400">
                          申请时间：{formatDateTime(record.createdAt)}
                        </div>
                        {record.status !== "pending" ? (
                          <div className="text-[11px] text-gray-500 truncate dark:text-gray-400">
                            审批时间：{formatDateTime(record.reviewedAt)}
                          </div>
                        ) : null}
                      </div>
                      {record.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void reviewPermissionRequest(record.id, "approved")}
                            className="inline-flex items-center gap-1 rounded-md border border-green-200 px-2 py-1 text-[11px] text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-200 dark:hover:bg-green-950/30"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            批准
                          </button>
                          <button
                            type="button"
                            onClick={() => void reviewPermissionRequest(record.id, "rejected")}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/30"
                          >
                            <CircleX className="h-3 w-3" />
                            拒绝
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {record.status === "approved" ? "已批准" : "已拒绝"}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">暂无权限申请</div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={platformConsoleOpen}
        title="平台管理"
        description="超级管理员跨团队视图"
        panelClassName="max-w-[96vw] sm:max-w-[980px]"
        zIndex={120}
        showHeaderClose
        onClose={() => setPlatformConsoleOpen(false)}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <Crown className="w-3.5 h-3.5" />
              超级管理员视图
            </div>
            <button
              type="button"
              onClick={() => void fetchPlatformSummary()}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${platformLoading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">团队总数</div>
              <div className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{platformSummary?.totals.teams ?? "-"}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">成员总数</div>
              <div className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{platformSummary?.totals.members ?? "-"}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">桶总数</div>
              <div className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{platformSummary?.totals.buckets ?? "-"}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-[11px] text-gray-500 dark:text-gray-400">待审批申请</div>
              <div className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{platformSummary?.totals.pendingRequests ?? "-"}</div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="px-3 py-2 border-b border-gray-200 text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
              团队列表
            </div>
            <div className="max-h-[48vh] overflow-auto">
              {platformLoading ? (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">平台数据加载中...</div>
              ) : platformSummary?.teams?.length ? (
                platformSummary.teams.map((team) => (
                  <div key={team.id} className="px-3 py-2 border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate dark:text-gray-100">{team.name}</div>
                        <div className="text-[11px] text-gray-500 truncate dark:text-gray-400">Owner: {team.ownerUserId}</div>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        <Settings2 className="w-3 h-3" />
                        管理员 {team.admins}
                      </div>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <div>成员 {team.members}</div>
                      <div>桶 {team.buckets}</div>
                      <div>待审批 {team.pendingRequests}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">暂无团队数据</div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={profileEditOpen}
        title="修改用户名"
        description="用于团队内成员识别显示"
        zIndex={120}
        onClose={() => {
          setProfileEditOpen(false);
          setProfileNameDraft(meInfo?.profile.displayName || "");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setProfileEditOpen(false);
                setProfileNameDraft(meInfo?.profile.displayName || "");
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              取消
            </button>
            <button
              onClick={() => {
                void saveDisplayName();
              }}
              disabled={profileSaving || !hasPermission("account.self.manage")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              保存
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">用户名</label>
            <input
              value={profileNameDraft}
              onChange={(e) => setProfileNameDraft(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
              placeholder="请输入用户名"
            />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">建议填写真实姓名，便于团队管理和权限审批识别。</div>
        </div>
      </Modal>

      <Modal
        open={changePasswordOpen}
        title="修改密码"
        zIndex={120}
        onClose={() => {
          setChangePasswordOpen(false);
          setChangePasswordValue("");
          setChangePasswordConfirmValue("");
          setShowChangePassword(false);
          setShowChangePasswordConfirm(false);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setChangePasswordOpen(false);
                setChangePasswordValue("");
                setChangePasswordConfirmValue("");
                setShowChangePassword(false);
                setShowChangePasswordConfirm(false);
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
            <div className="relative">
              <input
                type={showChangePassword ? "text" : "password"}
                value={changePasswordValue}
                onChange={(e) => setChangePasswordValue(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="至少六位密码"
              />
              <button
                type="button"
                onClick={() => setShowChangePassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                aria-label={showChangePassword ? "隐藏密码" : "显示密码"}
              >
                {showChangePassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">确认新密码</label>
            <div className="relative">
              <input
                type={showChangePasswordConfirm ? "text" : "password"}
                value={changePasswordConfirmValue}
                onChange={(e) => setChangePasswordConfirmValue(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="再次输入新密码"
              />
              <button
                type="button"
                onClick={() => setShowChangePasswordConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                aria-label={showChangePasswordConfirm ? "隐藏密码" : "显示密码"}
              >
                {showChangePasswordConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteAccountOpen}
        title="注销账号"
        description="该操作不可恢复，将永久删除当前账号及其桶配置。"
        zIndex={120}
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
        zIndex={120}
        panelClassName="md:max-h-none"
        contentClassName="md:overflow-y-visible"
        onClose={() => {
          setAddBucketOpen(false);
          setEditingBucketId(null);
          setBucketFormErrors({});
          setShowBucketAccessKeyId(false);
          setShowBucketSecretAccessKey(false);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setAddBucketOpen(false);
                setEditingBucketId(null);
                setBucketFormErrors({});
                setShowBucketAccessKeyId(false);
                setShowBucketSecretAccessKey(false);
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
            显示星号为必填项，不会配置可查看
            <a href="/404" className="text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
              「使用教程」
            </a>
            。
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">显示名称</label>
              <input
                value={bucketForm.bucketLabel}
                onChange={(e) => setBucketForm((prev) => ({ ...prev, bucketLabel: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="例如：我的云盘"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                R2 桶名称{" "}
                <span className="text-red-500">*</span>
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
              />
              {bucketFormErrors.bucketName ? (
                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{bucketFormErrors.bucketName}</div>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                Account ID{" "}
                <span className="text-red-500">*</span>
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
                Access Key ID{" "}
                {isNewBucket ? <span className="text-red-500">*</span> : null}
              </label>
              <div className="relative">
                <input
                  type={showBucketAccessKeyId ? "text" : "password"}
                  value={bucketForm.accessKeyId}
                  onChange={(e) => {
                    setBucketForm((prev) => ({ ...prev, accessKeyId: e.target.value }));
                    setBucketFormErrors((prev) => ({ ...prev, accessKeyId: undefined }));
                  }}
                  className={`w-full px-4 py-2.5 pr-10 rounded-xl border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                    bucketFormErrors.accessKeyId
                      ? "border-red-500 dark:border-red-500"
                      : "border-gray-200 dark:border-gray-800"
                  }`}
                  placeholder={editingBucketId ? "留空表示不修改" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowBucketAccessKeyId((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  aria-label={showBucketAccessKeyId ? "隐藏密码" : "显示密码"}
                >
                  {showBucketAccessKeyId ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {bucketFormErrors.accessKeyId ? (
                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{bucketFormErrors.accessKeyId}</div>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">
                Secret Access Key{" "}
                {isNewBucket ? <span className="text-red-500">*</span> : null}
              </label>
              <div className="relative">
                <input
                  type={showBucketSecretAccessKey ? "text" : "password"}
                  value={bucketForm.secretAccessKey}
                  onChange={(e) => {
                    setBucketForm((prev) => ({ ...prev, secretAccessKey: e.target.value }));
                    setBucketFormErrors((prev) => ({ ...prev, secretAccessKey: undefined }));
                  }}
                  className={`w-full px-4 py-2.5 pr-10 rounded-xl border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                    bucketFormErrors.secretAccessKey
                      ? "border-red-500 dark:border-red-500"
                      : "border-gray-200 dark:border-gray-800"
                  }`}
                  placeholder={editingBucketId ? "留空表示不修改" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowBucketSecretAccessKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  aria-label={showBucketSecretAccessKey ? "隐藏密码" : "显示密码"}
                >
                  {showBucketSecretAccessKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {bucketFormErrors.secretAccessKey ? (
                <div className="mt-1 text-xs text-red-600 dark:text-red-300">{bucketFormErrors.secretAccessKey}</div>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">公共开发 URL</label>
              <input
                value={bucketForm.publicBaseUrl}
                onChange={(e) => setBucketForm((prev) => ({ ...prev, publicBaseUrl: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none dark:bg-gray-950 dark:border-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">自定义域名</label>
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
        zIndex={120}
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
        zIndex={120}
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
        open={resetPasswordResultOpen}
        title="密码已重置"
        description={resetPasswordResult ? `成员：${resetPasswordResult.memberLabel}` : undefined}
        zIndex={130}
        onClose={() => {
          setResetPasswordResultOpen(false);
          setResetPasswordResult(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setResetPasswordResultOpen(false);
                setResetPasswordResult(null);
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              关闭
            </button>
            <button
              onClick={() => {
                if (!resetPasswordResult?.password || resetPasswordResult.password === "（服务端未返回）") return;
                void copyToClipboard(resetPasswordResult.password);
              }}
              disabled={!resetPasswordResult?.password || resetPasswordResult.password === "（服务端未返回）"}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Copy className="w-4 h-4" />
              复制密码
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">新密码</label>
            <input
              readOnly
              value={resetPasswordResult?.password ?? ""}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
            />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            请及时将新密码发给该成员，并建议成员登录后立即修改密码。
          </div>
        </div>
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
	                  const pctRaw = t.file.size ? Math.min(100, (Math.min(t.loaded, t.file.size) / t.file.size) * 100) : 0;
	                  const pct = Math.round(pctRaw);
	                  return (
                    <div key={t.id} className="px-4 py-3">
	                      <div className="flex items-start justify-between gap-3">
	                        <div className="min-w-0 flex items-center gap-3">
                            <img
                              src={getFileIconSrc("file", t.file.name)}
                              alt=""
                              aria-hidden="true"
                              className="h-8 w-8 shrink-0 object-contain"
                              draggable={false}
                            />
                            <div className="min-w-0">
	                            <div className="text-sm font-medium text-gray-900 truncate dark:text-gray-100" title={t.key}>
	                              {t.file.name}
	                            </div>
	                          <div className="mt-0.5 text-[11px] text-gray-500 truncate dark:text-gray-400" title={`${t.bucket}/${t.key}`}>
	                            {formatUploadTaskDestinationLabel(t.bucket, t.key)}
	                          </div>
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
		                          style={{ width: `${pctRaw.toFixed(2)}%` }}
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
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4 md:p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:h-[86dvh] md:h-[84dvh] md:max-h-[52rem] dark:border-gray-800 dark:bg-gray-900"
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
	            <div className="flex-1 min-h-0 p-3 sm:p-4 bg-gray-50 dark:bg-gray-950/30">
	              {!preview.url && preview.kind !== "other" && preview.kind !== "text" ? (
	                <div className="h-full rounded-xl border border-gray-200 bg-white flex flex-col items-center justify-center gap-3 dark:border-gray-800 dark:bg-gray-900">
	                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-300" />
	                  <div className="text-sm text-gray-600 dark:text-gray-300">正在加载预览...</div>
	                </div>
	              ) : preview.kind === "image" ? (
	                <div className="h-full rounded-xl border border-gray-200 bg-white p-2 sm:p-3 flex items-center justify-center dark:border-gray-800 dark:bg-gray-900">
	                  <img src={preview.url!} alt={preview.name} className="max-h-full max-w-full rounded-lg shadow" />
	                </div>
	              ) : preview.kind === "video" ? (
	                <div className="h-full w-full rounded-lg shadow bg-black overflow-hidden">
	                  <video src={preview.url!} controls className="w-full h-full object-contain" />
	                </div>
	              ) : preview.kind === "audio" ? (
	                <div className="relative h-full overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
	                  <div className="absolute inset-0 bg-gradient-to-b from-slate-50/70 via-white to-white dark:from-gray-900 dark:via-gray-900 dark:to-gray-900" />
	                  <div className="relative flex h-full items-center justify-center p-4 sm:p-6">
	                    <div className="w-full max-w-3xl">
	                      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
	                        <div className="flex items-center justify-center">
	                          {getIcon("file", preview.name, "xl")}
	                        </div>
	                        <div className="mt-4 w-full truncate text-base font-medium text-gray-900 dark:text-gray-100" title={preview.name}>
	                          {preview.name}
	                        </div>
	                        <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
	                          <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
	                            {getFileExt(preview.name).toUpperCase() || "AUDIO"}
	                          </span>
	                          <span>在线音频预览</span>
	                        </div>
	                      </div>
	                      <div className="mx-auto mt-8 max-w-4xl">
	                        <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] text-gray-500 dark:text-gray-400">
	                          <span>浏览器播放器</span>
	                          <span>无法播放时可使用右上角下载</span>
	                        </div>
	                        <div className="rounded-xl border border-gray-200/80 bg-white/80 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/80">
	                          <audio src={preview.url!} controls className="w-full" />
	                        </div>
	                      </div>
	                    </div>
	                  </div>
	                </div>
	              ) : preview.kind === "pdf" ? (
	                <iframe
	                  src={preview.url!}
	                  className="w-full h-full rounded-lg shadow bg-white dark:bg-gray-900"
	                  title="PDF Preview"
	                />
	              ) : preview.kind === "office" ? (
	                <iframe
	                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(preview.url!)}`}
	                  className="w-full h-full rounded-lg shadow bg-white dark:bg-gray-900"
	                  title="Office Preview"
	                />
	              ) : preview.kind === "text" ? (
	                <pre className="h-full min-h-0 text-xs bg-white border border-gray-200 rounded-lg p-4 overflow-auto whitespace-pre-wrap dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
	                  {preview.url ? (preview.text ?? "加载中...") : "正在加载预览..."}
	                </pre>
	              ) : (
	                <div className="h-full bg-white border border-gray-200 rounded-xl p-6 sm:p-10 flex flex-col items-center justify-center text-center dark:bg-gray-900 dark:border-gray-800">
	                  <div className="flex items-center justify-center">
	                    {getIcon("file", preview.name, "xl")}
	                  </div>
	                  <div className="mt-6 text-lg font-normal text-gray-900 dark:text-gray-100">无法预览此文件</div>
	                  <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">文件类型暂不支持预览，请下载后查看</div>
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
	                    className="mt-6 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm text-white font-medium shadow-md"
	                  >
	                    <Download className="w-4 h-4" />
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
