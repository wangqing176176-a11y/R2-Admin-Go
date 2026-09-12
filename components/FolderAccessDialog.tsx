"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Check, Eye, EyeOff, LoaderCircle, UnlockKeyhole } from "lucide-react";
import Modal from "@/components/Modal";
import FolderMemberPicker from "@/components/FolderMemberPicker";
import styles from "./FolderAccessDialog.module.css";
import { getFileIconSrc } from "@/lib/file-icons";
import { emptyFolderAccessPolicy, type FolderAccessMode, type FolderAccessPolicy, type FolderAccessRole } from "@/lib/folder-access-policy";
import { buildFolderPolicyDraft, getFolderGrantScope, hasFolderPolicyChanges, type FolderGrantScope } from "@/lib/folder-access-form";

export type FolderPolicyMember = { userId: string; displayName: string; role: FolderAccessRole; status: "active" | "disabled" };
type PolicyView = { ownerUserId: string; hint?: string; policy: FolderAccessPolicy; passwordEnabled: boolean; enabled: boolean };
type Props = {
  open: boolean;
  target: { bucketId: string; prefix: string; folderName: string };
  currentUserId: string;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onExited: () => void;
  onSaved: (removed: boolean) => Promise<void>;
  confirmRemove: () => Promise<boolean>;
};

const roles: Array<{ value: FolderAccessRole; label: string }> = [
  { value: "super_admin", label: "超级管理员" },
  { value: "admin", label: "管理员" },
  { value: "member", label: "协作成员" },
];
const modes: Array<{ value: FolderAccessMode; label: string; title: string }> = [
  { value: "password", label: "密码保护", title: "校验访问密码" },
  { value: "members", label: "成员授权", title: "仅允许授权成员访问" },
  { value: "members_password", label: "双重保护", title: "授权成员还需输入访问密码" },
];
const scopeOptions: Array<{ value: FolderGrantScope; label: string }> = [
  { value: "roles", label: "按角色授权" },
  { value: "users", label: "指定成员" },
  { value: "combined", label: "组合授权" },
];

export default function FolderAccessDialog({ open, target, currentUserId, request, onClose, onExited, onSaved, confirmRemove }: Props) {
  const id = useId();
  const [policy, setPolicy] = useState<FolderAccessPolicy>(emptyFolderAccessPolicy);
  const [existing, setExisting] = useState<PolicyView | null>(null);
  const [members, setMembers] = useState<FolderPolicyMember[]>([]);
  const [grantScope, setGrantScope] = useState<FolderGrantScope>("roles");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const requestRef = useRef(request);
  const mutationRef = useRef(false);
  requestRef.current = request;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setLoaded(false);
    setExisting(null);
    setError("");
    setPassword("");
    setShowPassword(false);
    const query = new URLSearchParams({ bucket: target.bucketId, prefix: target.prefix, manage: "1" });
    void requestRef.current("/api/folder-locks?" + query).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "读取访问保护失败");
      if (!active) return;
      const lock = data.lock as PolicyView | null;
      const nextPolicy = lock?.policy ?? emptyFolderAccessPolicy();
      const reserved = [currentUserId, ...(lock?.ownerUserId ? [lock.ownerUserId] : [])].filter(Boolean);
      setExisting(lock);
      setPolicy(nextPolicy);
      setGrantScope(lock && nextPolicy.mode !== "password" ? getFolderGrantScope(nextPolicy, reserved) : "roles");
      setMembers(data.members ?? []);
      setLoaded(true);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "读取访问保护失败");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, target.bucketId, target.prefix, currentUserId, reload]);

  const reservedIds = [...new Set([currentUserId, ...(existing?.ownerUserId ? [existing.ownerUserId] : [])].filter(Boolean))];
  const usesMembers = policy.mode !== "password";
  const needsPassword = policy.mode !== "members";
  const draft = buildFolderPolicyDraft(policy, grantScope, reservedIds);
  const isProtected = Boolean(existing?.enabled);
  const dirty = loaded && (!isProtected || !existing || hasFolderPolicyChanges(existing.policy, draft, reservedIds) || (needsPassword && password.length > 0));
  const hasLegacyCombination = existing && getFolderGrantScope(existing.policy, reservedIds) === "combined";
  // This summary intentionally reads the saved policy, never the editable draft.
  const currentMode = isProtected && existing ? modes.find((mode) => mode.value === existing.policy.mode)?.label ?? "密码保护" : "未启用";
  const currentStatus = !isProtected ? "未加密" : existing?.passwordEnabled ? "已加密" : "已授权";

  const changeMode = (mode: FolderAccessMode) => {
    setPolicy((prev) => ({ ...prev, mode }));
    setShowPassword(false);
    setError("");
  };
  const toggleRole = (role: FolderAccessRole) => setPolicy((prev) => ({
    ...prev,
    allowedRoles: prev.allowedRoles.includes(role) ? prev.allowedRoles.filter((value) => value !== role) : [...prev.allowedRoles, role],
  }));
  const toggleUser = (userId: string) => {
    if (reservedIds.includes(userId) || policy.deniedUserIds.includes(userId) || members.find((member) => member.userId === userId)?.status !== "active") return;
    setPolicy((prev) => ({
      ...prev,
      allowedUserIds: prev.allowedUserIds.includes(userId) ? prev.allowedUserIds.filter((value) => value !== userId) : [...prev.allowedUserIds, userId],
    }));
  };
  const close = () => { if (!mutationRef.current) onClose(); };
  const save = async () => {
    if (mutationRef.current || !loaded || !dirty) return;
    if (needsPassword && (!existing?.passwordEnabled || password) && (password.length < 8 || password.length > 128)) {
      setError("请输入 8–128 位访问密码");
      document.getElementById(id + "-password")?.focus();
      return;
    }
    mutationRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await request("/api/folder-locks", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert", bucketId: target.bucketId, prefix: target.prefix,
          policy: draft, passcode: needsPassword ? password : "", hint: existing?.hint ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      if (data.lock) {
        setExisting(data.lock);
        setPolicy(data.lock.policy);
        setPassword("");
      }
      await onSaved(false);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); }
    finally { mutationRef.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (mutationRef.current || !loaded || !existing) return;
    mutationRef.current = true;
    try {
      if (!(await confirmRemove())) return;
      setBusy(true);
      setError("");
      const res = await request("/api/folder-locks", {
        method: "POST",
        body: JSON.stringify({ action: "delete", bucketId: target.bucketId, prefix: target.prefix }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "取消保护失败");
      setExisting(null);
      await onSaved(true);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "取消保护失败"); }
    finally { mutationRef.current = false; setBusy(false); }
  };

  return (
    <Modal open={open} title="文件夹访问保护" showHeaderClose
      panelClassName={styles.panel}
      contentClassName={styles.content}
      onClose={close} onExited={onExited} closeOnBackdropClick={!busy}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {isProtected && loaded ? (
              <button type="button" disabled={busy} onClick={() => void remove()}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-red-400">
                <UnlockKeyhole className="h-4 w-4" aria-hidden="true" />解除保护
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && isProtected ? <span className="mr-2 hidden items-center gap-1.5 text-xs text-gray-500 sm:inline-flex dark:text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />未保存</span> : null}
            <button type="button" disabled={busy} onClick={close} className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">取消</button>
            <button type="submit" form={id + "-form"} disabled={busy || !dirty}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}保存设置
            </button>
          </div>
        </div>
      }>
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70 dark:bg-gray-900/70 dark:ring-gray-800">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
          <Image src={getFileIconSrc("folder", target.folderName)} alt="" width={32} height={32}
            unoptimized draggable={false} className="block h-8 w-8 shrink-0 object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100" title={target.folderName}>{target.folderName}</div>
          <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
            文件夹 · {loaded ? `${currentStatus} · ${currentMode}` : loading ? "正在读取保护状态" : "状态读取失败"}
          </div>
        </div>
      </div>

      {loading ? <div className={styles.loading + " text-sm text-gray-600 dark:text-gray-300"} role="status">
        <span className="r2-loader-orbit h-6 w-6 shrink-0" aria-hidden="true" />
        <span>加载中…</span>
      </div> : loaded ? (
        <form id={id + "-form"} className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy} className="min-w-0 space-y-6">
            <div className={styles.field}>
              <span id={id + "-mode-label"} className={styles.label}>保护方式</span>
              <div className={styles.modes} role="radiogroup" aria-labelledby={id + "-mode-label"}>
                {modes.map((mode) => (
                  <label key={mode.value} title={mode.title} className={[styles.mode, policy.mode === mode.value ? styles.selected : ""].join(" ")}>
                    <input type="radio" name={id + "-mode"} checked={policy.mode === mode.value} onChange={() => changeMode(mode.value)} className="h-3.5 w-3.5 shrink-0 accent-blue-600" />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <span id={id + "-scope-label"} className={styles.label}>授权范围</span>
              <div className={styles.audience}>
                {usesMembers ? <>
                  <div role="radiogroup" aria-labelledby={id + "-scope-label"} className="flex min-h-10 flex-wrap items-center gap-x-6 gap-y-2">
                    {scopeOptions.filter((scope) => scope.value !== "combined" || hasLegacyCombination).map((scope) => (
                      <label key={scope.value} className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
                        <input type="radio" name={id + "-scope"} checked={grantScope === scope.value} onChange={() => { setGrantScope(scope.value); setError(""); }} className="h-4 w-4 accent-blue-600" />
                        {scope.label}
                      </label>
                    ))}
                  </div>
                  <div className={[styles.scopeDetails, grantScope === "combined" ? styles.combinedScope : ""].join(" ")}>
                    <div className={[styles.scopeDetail, styles.roleChoices, grantScope === "users" ? styles.inactiveScope : ""].join(" ")}
                      aria-hidden={grantScope === "users"} inert={grantScope === "users"}>
                      {roles.map((role) => <label key={role.value} className="inline-flex min-h-8 cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
                        <input type="checkbox" checked={policy.allowedRoles.includes(role.value)} onChange={() => toggleRole(role.value)} className="h-4 w-4 rounded accent-blue-600" />{role.label}
                      </label>)}
                    </div>
                    <div className={[styles.scopeDetail, styles.memberChoice, grantScope === "roles" ? styles.inactiveScope : ""].join(" ")}
                      aria-hidden={grantScope === "roles"} inert={grantScope === "roles"}>
                      <FolderMemberPicker members={members} selectedIds={policy.allowedUserIds} reservedIds={reservedIds}
                        excludedIds={policy.deniedUserIds} currentUserId={currentUserId} disabled={busy || !open || grantScope === "roles"} onToggle={toggleUser} />
                    </div>
                  </div>
                </> : <div className="flex h-10 items-center text-sm text-gray-400 dark:text-gray-500">凭密码访问，无需指定成员</div>}
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor={id + "-password"} className={styles.label}>访问密码</label>
              <div className="relative">
                <input id={id + "-password"} type={showPassword ? "text" : "password"} disabled={!needsPassword}
                  autoComplete="new-password" maxLength={128} value={needsPassword ? password : ""}
                  onChange={(event) => { setPassword(event.target.value); setError(""); }}
                  placeholder={!needsPassword ? "成员授权无需密码" : existing?.passwordEnabled ? "已设置密码，留空保持不变" : "请输入访问密码"}
                  className="h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-white pl-3 pr-11 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:border-gray-800 dark:disabled:bg-gray-950" />
                <button type="button" disabled={!needsPassword} aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword}
                  aria-controls={id + "-password"} onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className={styles.field + " " + styles.visibility}>
              <span id={id + "-hide-label"} className={styles.label}>文件夹可见性</span>
              <div className="flex min-h-10 items-center gap-3">
                <button type="button" role="switch" aria-label="对无权成员隐藏文件夹" aria-checked={usesMembers && policy.hideUnauthorized} disabled={!usesMembers}
                  onClick={() => setPolicy((prev) => ({ ...prev, hideUnauthorized: !prev.hideUnauthorized }))}
                  className={"relative h-[22px] w-10 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40 " + (usesMembers && policy.hideUnauthorized ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700")}>
                  <span className={"absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform " + (usesMembers && policy.hideUnauthorized ? "translate-x-[18px]" : "")} />
                </button>
                <span className={"text-sm " + (usesMembers ? "text-gray-600 dark:text-gray-300" : "text-gray-400 dark:text-gray-500")}>
                  {usesMembers ? "对无权成员隐藏" : "密码保护下文件夹可见"}
                </span>
              </div>
            </div>
          </fieldset>
          {error ? <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
        </form>
      ) : <div className="flex min-h-64 flex-col items-center justify-center gap-4">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button type="button" onClick={() => setReload((value) => value + 1)} className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">重新加载</button>
      </div>}
    </Modal>
  );
}
