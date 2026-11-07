import type { R2BucketLike, R2GetResultLike, R2HeadResultLike } from "@/lib/r2-s3";
import type { RouteTokenCredentials } from "@/lib/route-token";
import { getStorageOAuthConfig } from "@/lib/storage-oauth";

type RemoteProvider = "webdav" | "onedrive" | "google_drive" | "dropbox";

const encoder = new TextEncoder();

const storageError = async (provider: string, action: string, response: Response) => {
  const raw = await response.text().catch(() => "");
  let detail = raw.trim();
  if (detail.startsWith("{")) {
    try {
      const parsed = JSON.parse(detail) as { error?: unknown; error_summary?: unknown };
      detail = typeof parsed.error_summary === "string"
        ? parsed.error_summary
        : typeof parsed.error === "string"
          ? parsed.error
          : JSON.stringify(parsed.error ?? parsed);
    } catch {
      // Keep the raw response text.
    }
  }
  if (detail.length > 240) detail = `${detail.slice(0, 240)}…`;
  return Object.assign(new Error(`${provider} ${action}失败${detail ? `：${detail}` : ""}`), {
    status: response.status,
  });
};

const normalizeKey = (raw: string, folder = false) => {
  const parts = String(raw ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error("文件路径无效");
  const key = parts.join("/");
  return folder && key ? `${key}/` : key;
};

const joinPath = (...values: Array<string | undefined>) =>
  values
    .flatMap((value) => String(value ?? "").replaceAll("\\", "/").split("/"))
    .filter(Boolean)
    .join("/");

const encodeObjectPath = (value: string) => normalizeKey(value).split("/").filter(Boolean).map(encodeURIComponent).join("/");

const toBody = async (value: unknown): Promise<BodyInit | null> => {
  if (value == null) return null;
  if (
    typeof value === "string"
    || value instanceof Blob
    || value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || value instanceof ReadableStream
    || value instanceof URLSearchParams
    || value instanceof FormData
  ) return value as BodyInit;
  if (typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    return await (value as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
  }
  return encoder.encode(String(value));
};

const readJson = async <T>(response: Response): Promise<T> => await response.json() as T;

const refreshAccessToken = async (creds: RouteTokenCredentials, provider: Exclude<RemoteProvider, "webdav">) => {
  const serverConfig = getStorageOAuthConfig(provider);
  const clientId = serverConfig?.clientId || String(creds.clientId ?? "").trim();
  const clientSecret = serverConfig?.clientSecret || String(creds.clientSecret ?? "").trim();
  if (!creds.refreshToken || !clientId) throw new Error(`${provider} 访问令牌已失效，请重新登录账号`);
  let url = "";
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
    client_id: clientId,
  });
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });

  if (provider === "google_drive") {
    url = "https://oauth2.googleapis.com/token";
    if (clientSecret) form.set("client_secret", clientSecret);
  } else if (provider === "onedrive") {
    url = `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId || serverConfig?.tenantId || "common")}/oauth2/v2.0/token`;
    if (clientSecret) form.set("client_secret", clientSecret);
  } else {
    url = "https://api.dropboxapi.com/oauth2/token";
    if (clientSecret) {
      headers.set("authorization", `Basic ${btoa(`${clientId}:${clientSecret}`)}`);
      form.delete("client_id");
    }
  }

  const response = await fetch(url, { method: "POST", headers, body: form });
  if (!response.ok) throw await storageError(provider, "刷新访问令牌", response);
  const payload = await readJson<{ access_token?: string }>(response);
  if (!payload.access_token) throw new Error(`${provider} 未返回新的访问令牌`);
  return payload.access_token;
};

const createBearerFetch = (creds: RouteTokenCredentials, provider: Exclude<RemoteProvider, "webdav">) => {
  let accessToken = String(creds.accessToken ?? "").trim();
  let refreshPromise: Promise<string> | null = null;
  return async (url: string, init: RequestInit = {}) => {
    if (!accessToken) {
      refreshPromise ??= refreshAccessToken(creds, provider);
      accessToken = await refreshPromise;
    }
    const send = async () => {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${accessToken}`);
      return await fetch(url, { ...init, headers });
    };
    let response = await send();
    if (response.status === 401 && creds.refreshToken) {
      await response.body?.cancel().catch(() => undefined);
      refreshPromise = refreshAccessToken(creds, provider);
      accessToken = await refreshPromise;
      response = await send();
    }
    return response;
  };
};

const xmlDecode = (value: string) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const xmlValue = (block: string, name: string) => {
  const match = block.match(new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i"));
  return match?.[1] ? xmlDecode(match[1].trim()) : "";
};

const createWebDavBucket = (creds: RouteTokenCredentials): R2BucketLike => {
  const endpoint = String(creds.endpoint ?? "").trim().replace(/\/+$/, "");
  if (!endpoint) throw new Error("WebDAV 地址不能为空");
  const rootPath = normalizeKey(creds.rootPath ?? "", true);
  const endpointUrl = new URL(`${endpoint}/`);
  const endpointBasePath = endpointUrl.pathname.replace(/\/+$/, "");
  const basePath = `${endpointBasePath}/${encodeObjectPath(rootPath)}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  const auth = `Basic ${btoa(`${creds.username ?? ""}:${creds.password ?? ""}`)}`;
  const urlFor = (key: string) => {
    const path = [basePath, encodeObjectPath(key)].filter(Boolean).join("/").replace(/\/{2,}/g, "/");
    const trailing = String(key).endsWith("/") ? "/" : "";
    return `${endpointUrl.origin}${path.startsWith("/") ? path : `/${path}`}${trailing}`;
  };
  const request = async (key: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", auth);
    return await fetch(urlFor(key), { ...init, headers });
  };
  const ensureParents = async (key: string) => {
    const parts = normalizeKey(key).split("/").filter(Boolean).slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = `${current}${part}/`;
      const response = await request(current, { method: "MKCOL" });
      if (!response.ok && response.status !== 405) throw await storageError("WebDAV", "创建上级目录", response);
    }
  };
  const hrefToRelative = (href: string) => {
    const pathname = decodeURIComponent(new URL(href, endpointUrl.origin).pathname);
    const decodedBase = decodeURIComponent(basePath).replace(/\/$/, "");
    return normalizeKey(pathname.startsWith(decodedBase) ? pathname.slice(decodedBase.length) : pathname, pathname.endsWith("/"));
  };

  return {
    list: async ({ prefix }) => {
      const folderPrefix = normalizeKey(prefix ?? "", true);
      const response = await request(folderPrefix, {
        method: "PROPFIND",
        headers: { depth: "1", "content-type": "application/xml; charset=utf-8" },
        body: "<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop></d:propfind>",
      });
      if (!response.ok && response.status !== 207) throw await storageError("WebDAV", "读取目录", response);
      const xml = await response.text();
      const blocks = xml.match(/<(?:[\w-]+:)?response\b[\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? [];
      const objects: Array<{ key: string; size?: number; uploaded?: string }> = [];
      const delimitedPrefixes: string[] = [];
      for (const block of blocks) {
        const href = xmlValue(block, "href");
        if (!href) continue;
        const key = hrefToRelative(href);
        if (!key || key === folderPrefix.replace(/\/$/, "") || key === folderPrefix) continue;
        const immediate = key.slice(folderPrefix.length).replace(/\/$/, "");
        if (!immediate || immediate.includes("/")) continue;
        const isFolder = /<(?:[\w-]+:)?collection\b/i.test(block);
        if (isFolder) {
          delimitedPrefixes.push(normalizeKey(key, true));
        } else {
          const size = Number(xmlValue(block, "getcontentlength") || NaN);
          const modified = xmlValue(block, "getlastmodified");
          objects.push({
            key: normalizeKey(key),
            size: Number.isFinite(size) ? size : undefined,
            uploaded: modified && Number.isFinite(Date.parse(modified)) ? new Date(modified).toISOString() : undefined,
          });
        }
      }
      return { objects, delimitedPrefixes, truncated: false };
    },
    get: async (key, options) => {
      const headers: Record<string, string> = {};
      if (options?.range) headers.range = `bytes=${options.range.offset}-${options.range.offset + options.range.length - 1}`;
      const response = await request(key, { method: "GET", headers });
      if (response.status === 404) return null;
      if (!response.ok) throw await storageError("WebDAV", "读取文件", response);
      const size = Number(response.headers.get("content-length") ?? NaN);
      return {
        body: response.body,
        size: Number.isFinite(size) ? size : undefined,
        etag: response.headers.get("etag")?.replace(/^\"|\"$/g, ""),
        httpMetadata: response.headers.get("content-type") ? { contentType: response.headers.get("content-type")! } : undefined,
      };
    },
    head: async (key) => {
      const response = await request(key, { method: "HEAD" });
      if (response.status === 404) return null;
      if (!response.ok) throw await storageError("WebDAV", "读取文件信息", response);
      const size = Number(response.headers.get("content-length") ?? NaN);
      return { size: Number.isFinite(size) ? size : undefined, etag: response.headers.get("etag")?.replace(/^\"|\"$/g, "") };
    },
    put: async (key, value, options) => {
      if (String(key).endsWith("/")) {
        const response = await request(key, { method: "MKCOL" });
        if (!response.ok && response.status !== 405) throw await storageError("WebDAV", "新建文件夹", response);
        return {};
      }
      const headers = new Headers();
      const opt = options as { httpMetadata?: { contentType?: string }; ifNoneMatch?: string } | undefined;
      if (opt?.httpMetadata?.contentType) headers.set("content-type", opt.httpMetadata.contentType);
      if (opt?.ifNoneMatch) headers.set("if-none-match", opt.ifNoneMatch);
      await ensureParents(key);
      const response = await request(key, { method: "PUT", headers, body: await toBody(value) });
      if (!response.ok) throw await storageError("WebDAV", "上传文件", response);
      return { etag: response.headers.get("etag")?.replace(/^\"|\"$/g, "") };
    },
    delete: async (keyOrKeys) => {
      for (const key of typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys) {
        const response = await request(key, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw await storageError("WebDAV", "删除文件", response);
      }
    },
  };
};

type OneDriveItem = {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  lastModifiedDateTime?: string;
  folder?: Record<string, unknown>;
  file?: { mimeType?: string };
};

const createOneDriveBucket = (creds: RouteTokenCredentials): R2BucketLike => {
  const request = createBearerFetch(creds, "onedrive");
  const driveBase = creds.driveId
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(creds.driveId)}`
    : "https://graph.microsoft.com/v1.0/me/drive";
  const rootPath = normalizeKey(creds.rootPath ?? "");
  const fullPath = (key: string) => joinPath(rootPath, key);
  const itemUrl = (key: string, suffix = "") => {
    const path = fullPath(key);
    return path ? `${driveBase}/root:/${encodeObjectPath(path)}${suffix}` : `${driveBase}/root${suffix}`;
  };
  const childrenUrl = (key: string) => fullPath(key) ? itemUrl(key, ":/children") : `${driveBase}/root/children`;
  const metadata = async (key: string): Promise<OneDriveItem | null> => {
    const response = await request(itemUrl(key));
    if (response.status === 404) return null;
    if (!response.ok) throw await storageError("OneDrive", "读取文件信息", response);
    return await readJson<OneDriveItem>(response);
  };
  const ensureFolders = async (path: string) => {
    const parts = normalizeKey(path).split("/").filter(Boolean);
    let walked = "";
    for (const part of parts) {
      const parent = walked;
      walked = joinPath(walked, part);
      if (await metadata(walked)) continue;
      const response = await request(childrenUrl(parent), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: part, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      });
      if (!response.ok && response.status !== 409) throw await storageError("OneDrive", "创建上级目录", response);
    }
  };

  return {
    list: async ({ prefix, cursor, limit }) => {
      const url = cursor || `${childrenUrl(normalizeKey(prefix ?? ""))}?$top=${Math.min(999, Math.max(1, limit ?? 200))}`;
      const response = await request(url);
      if (!response.ok) throw await storageError("OneDrive", "读取目录", response);
      const data = await readJson<{ value?: OneDriveItem[]; "@odata.nextLink"?: string }>(response);
      const base = normalizeKey(prefix ?? "", true);
      const objects: Array<{ key: string; size?: number; uploaded?: string }> = [];
      const delimitedPrefixes: string[] = [];
      for (const item of data.value ?? []) {
        if (item.folder) delimitedPrefixes.push(`${base}${item.name}/`);
        else objects.push({ key: `${base}${item.name}`, size: item.size, uploaded: item.lastModifiedDateTime });
      }
      return { objects, delimitedPrefixes, truncated: Boolean(data["@odata.nextLink"]), cursor: data["@odata.nextLink"] };
    },
    get: async (key, options) => {
      const headers: Record<string, string> = {};
      if (options?.range) headers.range = `bytes=${options.range.offset}-${options.range.offset + options.range.length - 1}`;
      const response = await request(itemUrl(key, ":/content"), { headers });
      if (response.status === 404) return null;
      if (!response.ok) throw await storageError("OneDrive", "读取文件", response);
      const size = Number(response.headers.get("content-length") ?? NaN);
      return { body: response.body, size: Number.isFinite(size) ? size : undefined, httpMetadata: response.headers.get("content-type") ? { contentType: response.headers.get("content-type")! } : undefined };
    },
    head: async (key): Promise<R2HeadResultLike | null> => {
      const item = await metadata(key);
      return item ? { size: item.size, etag: item.eTag } : null;
    },
    put: async (key, value, options) => {
      if (String(key).endsWith("/")) {
        const normalized = normalizeKey(key);
        const name = normalized.split("/").pop()!;
        const parent = normalized.split("/").slice(0, -1).join("/");
        const response = await request(childrenUrl(parent), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
        });
        if (!response.ok && response.status !== 409) throw await storageError("OneDrive", "新建文件夹", response);
        return {};
      }
      const opt = options as { httpMetadata?: { contentType?: string }; ifNoneMatch?: string } | undefined;
      const headers = new Headers();
      if (opt?.httpMetadata?.contentType) headers.set("content-type", opt.httpMetadata.contentType);
      if (opt?.ifNoneMatch) headers.set("if-none-match", opt.ifNoneMatch);
      await ensureFolders(normalizeKey(key).split("/").slice(0, -1).join("/"));
      const response = await request(itemUrl(key, ":/content"), { method: "PUT", headers, body: await toBody(value) });
      if (!response.ok) throw await storageError("OneDrive", "上传文件", response);
      const item = await readJson<OneDriveItem>(response);
      return { etag: item.eTag };
    },
    delete: async (keyOrKeys) => {
      for (const key of typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys) {
        const response = await request(itemUrl(key), { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw await storageError("OneDrive", "删除文件", response);
      }
    },
  };
};

type GoogleDriveItem = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; md5Checksum?: string };

const escapeGoogleQuery = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

const createGoogleDriveBucket = (creds: RouteTokenCredentials): R2BucketLike => {
  const request = createBearerFetch(creds, "google_drive");
  const configuredRoot = creds.driveId || "root";
  const pathCache = new Map<string, string>([["", configuredRoot]]);
  const resolvePath = async (path: string, createFolders = false) => {
    const normalized = normalizeKey(joinPath(creds.rootPath, path));
    if (!normalized) return configuredRoot;
    const parts = normalized.split("/");
    let parent = configuredRoot;
    let walked = "";
    for (const part of parts) {
      walked = joinPath(walked, part);
      const cached = pathCache.get(walked);
      if (cached) {
        parent = cached;
        continue;
      }
      const query = `'${escapeGoogleQuery(parent)}' in parents and name = '${escapeGoogleQuery(part)}' and trashed = false`;
      const response = await request(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=2&fields=files(id,name,mimeType,size,modifiedTime,md5Checksum)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
      if (!response.ok) throw await storageError("Google Drive", "读取文件信息", response);
      const data = await readJson<{ files?: GoogleDriveItem[] }>(response);
      let found = data.files?.[0];
      if (!found && createFolders) {
        const createResponse = await request("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: part, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
        });
        if (!createResponse.ok) throw await storageError("Google Drive", "新建文件夹", createResponse);
        found = await readJson<GoogleDriveItem>(createResponse);
      }
      if (!found) return null;
      parent = found.id;
      pathCache.set(walked, parent);
    }
    return parent;
  };
  const getItem = async (key: string) => {
    const id = await resolvePath(key);
    if (!id) return null;
    const response = await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,modifiedTime,md5Checksum&supportsAllDrives=true`);
    if (response.status === 404) return null;
    if (!response.ok) throw await storageError("Google Drive", "读取文件信息", response);
    return await readJson<GoogleDriveItem>(response);
  };

  return {
    list: async ({ prefix, cursor, limit }) => {
      const folderId = await resolvePath(normalizeKey(prefix ?? ""));
      if (!folderId) return { objects: [], delimitedPrefixes: [], truncated: false };
      const query = `'${escapeGoogleQuery(folderId)}' in parents and trashed = false`;
      const params = new URLSearchParams({
        q: query,
        pageSize: String(Math.min(1000, Math.max(1, limit ?? 200))),
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum)",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (cursor) params.set("pageToken", cursor);
      const response = await request(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
      if (!response.ok) throw await storageError("Google Drive", "读取目录", response);
      const data = await readJson<{ files?: GoogleDriveItem[]; nextPageToken?: string }>(response);
      const base = normalizeKey(prefix ?? "", true);
      const objects: Array<{ key: string; size?: number; uploaded?: string }> = [];
      const delimitedPrefixes: string[] = [];
      for (const item of data.files ?? []) {
        if (item.mimeType === "application/vnd.google-apps.folder") delimitedPrefixes.push(`${base}${item.name}/`);
        else objects.push({ key: `${base}${item.name}`, size: Number(item.size ?? NaN), uploaded: item.modifiedTime });
      }
      return { objects, delimitedPrefixes, truncated: Boolean(data.nextPageToken), cursor: data.nextPageToken };
    },
    get: async (key, options): Promise<R2GetResultLike | null> => {
      const id = await resolvePath(key);
      if (!id) return null;
      const headers: Record<string, string> = {};
      if (options?.range) headers.range = `bytes=${options.range.offset}-${options.range.offset + options.range.length - 1}`;
      const response = await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers });
      if (response.status === 404) return null;
      if (!response.ok) throw await storageError("Google Drive", "读取文件", response);
      const size = Number(response.headers.get("content-length") ?? NaN);
      return { body: response.body, size: Number.isFinite(size) ? size : undefined, httpMetadata: response.headers.get("content-type") ? { contentType: response.headers.get("content-type")! } : undefined };
    },
    head: async (key) => {
      const item = await getItem(key);
      return item ? { size: Number.isFinite(Number(item.size)) ? Number(item.size) : undefined, etag: item.md5Checksum } : null;
    },
    put: async (key, value, options) => {
      const normalized = normalizeKey(key);
      if (String(key).endsWith("/")) {
        await resolvePath(normalized, true);
        return {};
      }
      const name = normalized.split("/").pop()!;
      const parentPath = normalized.split("/").slice(0, -1).join("/");
      const parentId = await resolvePath(parentPath, true);
      if (!parentId) throw new Error("Google Drive 目标目录不存在");
      const existingId = await resolvePath(normalized);
      let fileId = existingId;
      if (!fileId) {
        const createResponse = await request("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, parents: [parentId] }),
        });
        if (!createResponse.ok) throw await storageError("Google Drive", "创建文件", createResponse);
        fileId = (await readJson<{ id: string }>(createResponse)).id;
      } else if ((options as { ifNoneMatch?: string } | undefined)?.ifNoneMatch === "*") {
        throw Object.assign(new Error("目标位置已存在同名文件"), { status: 412 });
      }
      const headers = new Headers();
      const contentType = (options as { httpMetadata?: { contentType?: string } } | undefined)?.httpMetadata?.contentType;
      if (contentType) headers.set("content-type", contentType);
      const response = await request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`, {
        method: "PATCH",
        headers,
        body: await toBody(value),
      });
      if (!response.ok) throw await storageError("Google Drive", "上传文件", response);
      return {};
    },
    delete: async (keyOrKeys) => {
      for (const key of typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys) {
        const id = await resolvePath(key);
        if (!id) continue;
        const response = await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw await storageError("Google Drive", "删除文件", response);
      }
    },
  };
};

type DropboxEntry = { ".tag": "file" | "folder"; name: string; size?: number; server_modified?: string; content_hash?: string };

const createDropboxBucket = (creds: RouteTokenCredentials): R2BucketLike => {
  const request = createBearerFetch(creds, "dropbox");
  const fullPath = (key: string) => {
    const path = joinPath(creds.rootPath, key);
    return path ? `/${path}` : "";
  };
  const rpc = async <T>(path: string, body: unknown): Promise<T> => {
    const response = await request(`https://api.dropboxapi.com/2/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await storageError("Dropbox", path, response);
    return await readJson<T>(response);
  };
  const headEntry = async (key: string) => {
    try {
      const meta = await rpc<DropboxEntry>("files/get_metadata", { path: fullPath(key), include_deleted: false });
      return { size: meta.size, etag: meta.content_hash };
    } catch (error) {
      if (Number((error as { status?: unknown }).status) === 409) return null;
      throw error;
    }
  };
  const ensureFolders = async (path: string) => {
    const parts = normalizeKey(path).split("/").filter(Boolean);
    let walked = "";
    for (const part of parts) {
      walked = joinPath(walked, part);
      try {
        await rpc("files/create_folder_v2", { path: fullPath(walked), autorename: false });
      } catch (error) {
        if (Number((error as { status?: unknown }).status) !== 409) throw error;
      }
    }
  };

  return {
    list: async ({ prefix, cursor, limit }) => {
      const data = cursor
        ? await rpc<{ entries?: DropboxEntry[]; has_more?: boolean; cursor?: string }>("files/list_folder/continue", { cursor })
        : await rpc<{ entries?: DropboxEntry[]; has_more?: boolean; cursor?: string }>("files/list_folder", {
            path: fullPath(normalizeKey(prefix ?? "")),
            recursive: false,
            include_deleted: false,
            limit: Math.min(2000, Math.max(1, limit ?? 200)),
          });
      const base = normalizeKey(prefix ?? "", true);
      const objects: Array<{ key: string; size?: number; uploaded?: string }> = [];
      const delimitedPrefixes: string[] = [];
      for (const item of data.entries ?? []) {
        if (item[".tag"] === "folder") delimitedPrefixes.push(`${base}${item.name}/`);
        else objects.push({ key: `${base}${item.name}`, size: item.size, uploaded: item.server_modified });
      }
      return { objects, delimitedPrefixes, truncated: Boolean(data.has_more), cursor: data.cursor };
    },
    get: async (key, options) => {
      const headers = new Headers({ "Dropbox-API-Arg": JSON.stringify({ path: fullPath(key) }) });
      if (options?.range) headers.set("range", `bytes=${options.range.offset}-${options.range.offset + options.range.length - 1}`);
      const response = await request("https://content.dropboxapi.com/2/files/download", { method: "POST", headers });
      if (response.status === 409) return null;
      if (!response.ok) throw await storageError("Dropbox", "读取文件", response);
      const rawMeta = response.headers.get("dropbox-api-result");
      const meta = rawMeta ? JSON.parse(rawMeta) as DropboxEntry : null;
      return { body: response.body, size: meta?.size, etag: meta?.content_hash, httpMetadata: response.headers.get("content-type") ? { contentType: response.headers.get("content-type")! } : undefined };
    },
    head: headEntry,
    put: async (key, value, options) => {
      if (String(key).endsWith("/")) {
        try {
          await rpc("files/create_folder_v2", { path: fullPath(normalizeKey(key)), autorename: false });
        } catch (error) {
          if (Number((error as { status?: unknown }).status) !== 409) throw error;
        }
        return {};
      }
      if ((options as { ifNoneMatch?: string } | undefined)?.ifNoneMatch === "*" && await headEntry(key)) {
        throw Object.assign(new Error("目标位置已存在同名文件"), { status: 412 });
      }
      await ensureFolders(normalizeKey(key).split("/").slice(0, -1).join("/"));
      const response = await request("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({ path: fullPath(key), mode: "overwrite", autorename: false, mute: true }),
        },
        body: await toBody(value),
      });
      if (!response.ok) throw await storageError("Dropbox", "上传文件", response);
      const meta = await readJson<DropboxEntry>(response);
      return { etag: meta.content_hash };
    },
    delete: async (keyOrKeys) => {
      for (const key of typeof keyOrKeys === "string" ? [keyOrKeys] : keyOrKeys) {
        try {
          await rpc("files/delete_v2", { path: fullPath(key) });
        } catch (error) {
          if (Number((error as { status?: unknown }).status) !== 409) throw error;
        }
      }
    },
  };
};

export const isRemoteStorageProvider = (provider: RouteTokenCredentials["provider"]): provider is RemoteProvider =>
  provider === "webdav" || provider === "onedrive" || provider === "google_drive" || provider === "dropbox";

export const createRemoteStorageBucket = (creds: RouteTokenCredentials): R2BucketLike => {
  if (creds.provider === "webdav") return createWebDavBucket(creds);
  if (creds.provider === "onedrive") return createOneDriveBucket(creds);
  if (creds.provider === "google_drive") return createGoogleDriveBucket(creds);
  if (creds.provider === "dropbox") return createDropboxBucket(creds);
  throw new Error("不支持的远程存储平台");
};
