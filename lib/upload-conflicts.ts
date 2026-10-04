export type UploadConflictDecision = "keep-both" | "replace" | "cancel";
export type UploadConflictPolicy = "reject" | "replace";

export type UploadKeyPlan = {
  key: string;
  conflictPolicy: UploadConflictPolicy;
};

const splitKeyName = (key: string) => {
  const slash = key.lastIndexOf("/");
  const prefix = slash >= 0 ? key.slice(0, slash + 1) : "";
  const name = slash >= 0 ? key.slice(slash + 1) : key;
  const dot = name.lastIndexOf(".");
  const hasExtension = dot > 0;
  return {
    prefix,
    stem: hasExtension ? name.slice(0, dot) : name,
    extension: hasExtension ? name.slice(dot) : "",
  };
};

export const countUploadKeyConflicts = (keys: string[], existingKeys: Iterable<string>) => {
  const occupied = new Set(existingKeys);
  let conflicts = 0;
  for (const key of keys) {
    if (occupied.has(key)) conflicts += 1;
    occupied.add(key);
  }
  return conflicts;
};

export const createAvailableUploadKey = (key: string, occupied: Set<string>) => {
  if (!occupied.has(key)) return key;
  const { prefix, stem, extension } = splitKeyName(key);
  for (let index = 1; index <= 10_000; index += 1) {
    const candidate = `${prefix}${stem} (${index})${extension}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("同名文件过多，无法生成可用文件名");
};

export const planUploadKeys = (
  keys: string[],
  existingKeys: Iterable<string>,
  decision: Exclude<UploadConflictDecision, "cancel">,
): UploadKeyPlan[] => {
  const existing = new Set(existingKeys);
  const occupied = new Set(existing);
  const replacementClaims = new Set<string>();

  return keys.map((originalKey) => {
    if (decision === "replace" && existing.has(originalKey) && !replacementClaims.has(originalKey)) {
      replacementClaims.add(originalKey);
      return { key: originalKey, conflictPolicy: "replace" };
    }

    const key = createAvailableUploadKey(originalKey, occupied);
    occupied.add(key);
    return { key, conflictPolicy: "reject" };
  });
};
