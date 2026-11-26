"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, HardDrive, Monitor, Moon, Sun, X, type LucideIcon } from "lucide-react";
import styles from "./StorageSidebar.module.css";

export type TransferModeOverride = "auto" | "presigned" | "proxy";

type ThemeMode = "system" | "light" | "dark";
type ConnectionStatus = "checking" | "connected" | "unbound" | "error";
type SidebarMenu = "storage" | "transfer";

type StorageOption = {
  id: string;
  name: string;
  icon: ReactNode;
};

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  unread?: string;
};

type StorageSidebarProps = {
  brand: ReactNode;
  buckets: StorageOption[];
  selectedBucketId: string | null;
  onSelectBucket: (id: string) => void;
  onManageStorage: () => void;
  navigation: NavItem[][];
  currentPage: string;
  connectionStatus: ConnectionStatus;
  connectionDetail?: string | null;
  connectionAction?: {
    label: string;
    onSelect: () => void;
  };
  transfer?: {
    mode: TransferModeOverride;
    label: string;
    description: string;
    detail?: string;
    canSelectDirect: boolean;
    onSelect: (mode: TransferModeOverride) => void;
  };
  mobileTheme?: { value: ThemeMode; onSelect: (theme: ThemeMode) => void };
  onClose?: () => void;
};

const connectionLabels: Record<ConnectionStatus, string> = {
  connected: "连接状态正常",
  checking: "连接中...",
  unbound: "未绑定存储平台",
  error: "连接状态异常",
};

const connectionFallbackDetails: Record<Exclude<ConnectionStatus, "connected">, string> = {
  checking: "正在检测存储连接",
  unbound: "尚未绑定存储平台",
  error: "暂时无法连接存储服务",
};

const transferOptions = [
  { value: "auto", label: "自动选择" },
  { value: "presigned", label: "直接连接" },
  { value: "proxy", label: "代理转发" },
] as const;

const themeOptions = [
  { value: "system", label: "系统", icon: Monitor },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
] as const;

export default function StorageSidebar({
  brand, buckets, selectedBucketId, onSelectBucket, onManageStorage, navigation, currentPage,
  connectionStatus, connectionDetail, connectionAction, transfer, mobileTheme, onClose,
}: StorageSidebarProps) {
  const [openMenu, setOpenMenu] = useState<SidebarMenu | null>(null);
  const storageMenu = useRef<HTMLDivElement>(null);
  const storageTrigger = useRef<HTMLButtonElement>(null);
  const transferMenu = useRef<HTMLDivElement>(null);
  const transferTrigger = useRef<HTMLButtonElement>(null);
  const storageMenuId = useId();
  const transferMenuId = useId();
  const selectedBucket = buckets.find((bucket) => bucket.id === selectedBucketId);
  const statusDetail = connectionStatus === "connected"
    ? transfer ? null : "传输通道待就绪"
    : connectionDetail?.trim() || connectionFallbackDetails[connectionStatus];

  useEffect(() => {
    if (!openMenu) return;
    const menu = openMenu === "storage" ? storageMenu : transferMenu;
    const trigger = openMenu === "storage" ? storageTrigger : transferTrigger;
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpenMenu(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenMenu(null);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [openMenu]);

  return (
    <aside className={styles.sidebar} aria-label="侧栏">
      <header className={styles.header}>
        <span className={styles.brand} role="img" aria-label="R2 Admin Go">{brand}</span>
        {onClose ? (
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭菜单">
            <X size={19} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className={styles.body}>
        <section className={styles.storage} aria-label="存储空间">
          <div className={styles.storageHeading}>
            <span>存储空间</span>
            <button type="button" className={styles.manageButton} onClick={onManageStorage} aria-label="管理存储空间">
              管理
            </button>
          </div>
          <div ref={storageMenu} className={styles.menuAnchor}>
            <button
              ref={storageTrigger}
              type="button"
              className={styles.storageTrigger}
              onClick={() => setOpenMenu((menu) => menu === "storage" ? null : "storage")}
              aria-label={selectedBucket ? `切换存储空间，当前为 ${selectedBucket.name}` : "选择存储空间"}
              aria-expanded={openMenu === "storage"}
              aria-controls={openMenu === "storage" ? storageMenuId : undefined}
              title={selectedBucket?.name}
            >
              <span className={styles.storageIcon} aria-hidden="true">{selectedBucket?.icon ?? <HardDrive size={16} />}</span>
              <span className={styles.storageName}>{selectedBucket?.name ?? "选择存储空间"}</span>
              <ChevronsUpDown className={styles.chevron} size={15} aria-hidden="true" />
            </button>
            {openMenu === "storage" ? (
              <div id={storageMenuId} className={`${styles.popover} ${styles.storagePopover}`} role="group" aria-label="切换存储空间">
                {buckets.length === 0 ? <p className={styles.empty}>暂无存储连接</p> : buckets.map((bucket) => (
                  <button
                    key={bucket.id}
                    type="button"
                    className={styles.option}
                    aria-pressed={bucket.id === selectedBucketId}
                    title={bucket.name}
                    onClick={() => {
                      setOpenMenu(null);
                      storageTrigger.current?.focus();
                      onSelectBucket(bucket.id);
                    }}
                  >
                    <span className={styles.optionIcon} aria-hidden="true">{bucket.icon}</span>
                    <span className={styles.optionLabel}>{bucket.name}</span>
                    {bucket.id === selectedBucketId ? <Check size={15} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <nav aria-label="主导航" className={styles.navigation}>
          {navigation.map((group) => (
            <ul key={group[0].id} className={styles.navGroup}>
              {group.map(({ id, label, icon: Icon, onSelect, unread }) => (
                <li key={id}>
                  <button type="button" onClick={onSelect} className={styles.navButton} aria-current={currentPage === id ? "page" : undefined}>
                    <Icon size={18} strokeWidth={1.8} className={styles.navIcon} aria-hidden="true" />
                    <span className={styles.navLabel}>{label}</span>
                    {unread ? <span className={styles.unread}>{unread}<span className="sr-only"> 条未读消息</span></span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </nav>
      </div>

      <footer className={styles.footer}>
        <div className={styles.connection} data-status={connectionStatus}>
          <div className={styles.connectionState} role="status">
            <span className={styles.connectionIcon} aria-hidden="true" />
            {connectionLabels[connectionStatus]}
          </div>
          {connectionStatus === "connected" && transfer ? (
            <div className={styles.transferRow}>
              <span className={styles.transferLabel} title={`当前传输通道：${transfer.description}`}>
                当前传输通道：{transfer.label}
              </span>
              <div ref={transferMenu} className={styles.menuAnchor}>
                <button
                  ref={transferTrigger}
                  type="button"
                  className={styles.transferTrigger}
                  aria-label={`选择传输通道，当前为 ${transfer.label}`}
                  aria-expanded={openMenu === "transfer"}
                  aria-controls={openMenu === "transfer" ? transferMenuId : undefined}
                  title="选择传输通道"
                  onClick={() => setOpenMenu((menu) => menu === "transfer" ? null : "transfer")}
                >
                  切换
                </button>
                {openMenu === "transfer" ? (
                  <div id={transferMenuId} className={`${styles.popover} ${styles.transferPopover}`} role="group" aria-label="选择传输通道">
                    {transferOptions.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={styles.option}
                        aria-pressed={value === transfer.mode}
                        disabled={value === "presigned" && !transfer.canSelectDirect}
                        onClick={() => {
                          setOpenMenu(null);
                          transferTrigger.current?.focus();
                          transfer.onSelect(value);
                        }}
                      >
                        <span className={styles.optionLabel}>{label}</span>
                        {value === transfer.mode ? <Check size={14} aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {statusDetail ? (
            <div className={styles.connectionMessageRow}>
              <p className={styles.connectionDetail} title={statusDetail}>{statusDetail}</p>
              {connectionAction ? (
                <button type="button" className={styles.connectionAction} onClick={connectionAction.onSelect}>
                  {connectionAction.label}
                </button>
              ) : null}
            </div>
          ) : null}
          {connectionStatus === "connected" && transfer?.detail ? (
            <p className={styles.connectionNote} title={transfer.detail}>{transfer.detail}</p>
          ) : null}
        </div>
        {mobileTheme ? (
          <div className={styles.themeControl} role="group" aria-label="主题模式">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={styles.themeButton}
                aria-pressed={mobileTheme.value === value}
                onClick={() => mobileTheme.onSelect(value)}
              >
                <Icon size={15} aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        ) : null}
      </footer>
    </aside>
  );
}
