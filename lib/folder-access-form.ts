import type { FolderAccessPolicy } from "./folder-access-policy";

export type FolderGrantScope = "roles" | "users" | "combined";

export function getFolderGrantScope(policy: FolderAccessPolicy, reservedIds: string[]): FolderGrantScope {
  const hasRoles = policy.allowedRoles.length > 0;
  const hasIndividuals = policy.allowedUserIds.some((id) => !reservedIds.includes(id));
  if (hasRoles && hasIndividuals) return "combined";
  return hasRoles ? "roles" : "users";
}

export function buildFolderPolicyDraft(policy: FolderAccessPolicy, scope: FolderGrantScope, reservedIds: string[]): FolderAccessPolicy {
  const usesMembers = policy.mode !== "password";
  return {
    ...policy,
    allowedRoles: usesMembers && scope !== "users" ? [...policy.allowedRoles] : [],
    allowedUserIds: usesMembers
      ? [...new Set([...(scope === "roles" ? [] : policy.allowedUserIds), ...reservedIds])]
      : [],
    // Opening the redesigned form must not discard existing access restrictions.
    deniedUserIds: [...policy.deniedUserIds],
  };
}

export function hasFolderPolicyChanges(saved: FolderAccessPolicy, draft: FolderAccessPolicy, reservedIds: string[]): boolean {
  const comparable = (policy: FolderAccessPolicy) => JSON.stringify({
    mode: policy.mode,
    allowedRoles: policy.mode === "password" ? [] : [...new Set(policy.allowedRoles)].sort(),
    allowedUserIds: policy.mode === "password" ? [] : [...new Set([...policy.allowedUserIds, ...reservedIds])].sort(),
    deniedUserIds: [...new Set(policy.deniedUserIds)].sort(),
    hideUnauthorized: policy.hideUnauthorized,
  });
  return comparable(saved) !== comparable(draft);
}
