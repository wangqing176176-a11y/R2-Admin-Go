// Shared, side-effect-free policy evaluation for the server and UI.
export type FolderAccessMode = "password" | "members" | "members_password";
export type FolderAccessRole = "super_admin" | "admin" | "member";
export type FolderAccessPolicy = {
  mode: FolderAccessMode;
  allowedUserIds: string[];
  allowedRoles: FolderAccessRole[];
  deniedUserIds: string[];
  hideUnauthorized: boolean;
  version: string;
};
export type FolderAccessSubject = {
  user: { id: string };
  team: { id: string };
  role: FolderAccessRole;
  status: "active" | "disabled";
};
export type FolderPolicyRecord = {
  id: string;
  team_id: string;
  bucket_id: string;
  prefix: string;
  enabled: boolean;
  updated_at: string;
  access_policy?: FolderAccessPolicy | null;
};
export type FolderUnlockGrant = {
  userId: string;
  teamId: string;
  bucketId: string;
  policyId: string;
  policyVersion: string;
  prefix: string;
  expiresAt: number;
};
export const emptyFolderAccessPolicy = (): FolderAccessPolicy => ({
  mode: "password", allowedUserIds: [], allowedRoles: [], deniedUserIds: [], hideUnauthorized: false, version: "",
});
export const folderPolicyRequiresPassword = (policy: FolderAccessPolicy) => policy.mode !== "members";
export const getFolderAccessPolicy = (row: FolderPolicyRecord): FolderAccessPolicy => {
  if (!row.access_policy) return { ...emptyFolderAccessPolicy(), version: row.updated_at };
  const policy = row.access_policy;
  if (!["password", "members", "members_password"].includes(policy.mode)
    || !Array.isArray(policy.allowedUserIds) || !Array.isArray(policy.allowedRoles)
    || !Array.isArray(policy.deniedUserIds) || typeof policy.hideUnauthorized !== "boolean"
    || [...policy.allowedUserIds, ...policy.deniedUserIds].some((id) => typeof id !== "string")
    || policy.allowedRoles.some((role) => !["super_admin", "admin", "member"].includes(role))) {
    throw new Error("文件夹访问策略无效，请联系管理员");
  }
  return { ...policy, version: policy.version || row.updated_at };
};
export const pathWithinFolderPrefix = (path: string, prefix: string) =>
  Boolean(prefix && prefix.endsWith("/") && path.startsWith(prefix));
export const findEffectiveFolderLockFromRows = <T extends FolderPolicyRecord>(rows: T[], path: string): T | null => {
  let match: T | null = null;
  for (const row of rows) {
    if (row.enabled && pathWithinFolderPrefix(path, row.prefix) && (!match || row.prefix.length > match.prefix.length)) match = row;
  }
  return match;
};
export const hasFolderIdentityAccess = (ctx: FolderAccessSubject, row: FolderPolicyRecord) => {
  if (ctx.status !== "active" || ctx.team.id !== row.team_id) return false;
  const policy = getFolderAccessPolicy(row);
  if (policy.deniedUserIds.includes(ctx.user.id)) return false;
  return policy.mode === "password" || policy.allowedUserIds.includes(ctx.user.id) || policy.allowedRoles.includes(ctx.role);
};
export const hasValidFolderGrant = (ctx: FolderAccessSubject, row: FolderPolicyRecord, grants: FolderUnlockGrant[], now = Date.now()) => {
  const policy = getFolderAccessPolicy(row);
  return grants.some((grant) => grant.userId === ctx.user.id && grant.teamId === ctx.team.id
    && grant.bucketId === row.bucket_id && grant.policyId === row.id
    && grant.policyVersion === policy.version && grant.prefix === row.prefix && grant.expiresAt > now);
};
export type FolderAccessDecision = "allow" | "password_required" | "deny_visible" | "deny_hidden";
export const evaluateFolderAccess = (
  ctx: FolderAccessSubject, row: FolderPolicyRecord | null, grants: FolderUnlockGrant[] = [],
): FolderAccessDecision => {
  if (ctx.status !== "active") return "deny_hidden";
  if (!row?.enabled) return "allow";
  if (ctx.team.id !== row.team_id) return "deny_hidden";
  const policy = getFolderAccessPolicy(row);
  if (!hasFolderIdentityAccess(ctx, row)) return policy.hideUnauthorized ? "deny_hidden" : "deny_visible";
  if (folderPolicyRequiresPassword(policy) && !hasValidFolderGrant(ctx, row, grants)) return "password_required";
  return "allow";
};
// A locked folder itself can remain discoverable; its children cannot.
export const canDiscoverFolderPath = (path: string, row: FolderPolicyRecord | null, decision: FolderAccessDecision) =>
  decision === "allow" || (path === row?.prefix && decision !== "deny_hidden");
