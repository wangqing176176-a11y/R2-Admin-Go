export const FILE_LIST_CACHE_FRESH_MS = 30_000;

type CacheEntry<T> = { bucketId: string; value: T; updatedAt: number };
type CacheRequest = { key: string; bucketId: string; revision: number; bucketRevision: number; id: number };

// Session-only cache. Requests carry a revision so responses started before a
// file operation (or logout) cannot restore an invalidated directory snapshot.
export class FileListCache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  private requests = new Map<string, CacheRequest>();
  private bucketRevisions = new Map<string, number>();
  private revision = 0;
  private nextRequestId = 0;

  constructor(private maxEntries = 100) {}

  private key(bucketId: string, path: string[]) {
    return JSON.stringify([bucketId, path]);
  }

  read(bucketId: string, path: string[]) {
    const key = this.key(bucketId, path);
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  isFresh(entry: CacheEntry<T>, now = Date.now()) {
    return now - entry.updatedAt < FILE_LIST_CACHE_FRESH_MS;
  }

  beginRequest(bucketId: string, path: string[]) {
    const request: CacheRequest = {
      key: this.key(bucketId, path), bucketId,
      revision: this.revision,
      bucketRevision: this.bucketRevisions.get(bucketId) ?? 0,
      id: ++this.nextRequestId,
    };
    this.requests.set(request.key, request);
    return request;
  }

  isCurrent(request: CacheRequest) {
    return request.revision === this.revision
      && request.bucketRevision === (this.bucketRevisions.get(request.bucketId) ?? 0)
      && this.requests.get(request.key)?.id === request.id;
  }

  write(request: CacheRequest, value: T, now = Date.now()) {
    if (!this.isCurrent(request)) return false;
    this.entries.delete(request.key);
    this.entries.set(request.key, { bucketId: request.bucketId, value, updatedAt: now });
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
      this.requests.delete(oldestKey);
    }
    return true;
  }

  remove(bucketId: string, path: string[]) {
    const key = this.key(bucketId, path);
    this.entries.delete(key);
  }

  invalidate(bucketId?: string) {
    if (!bucketId) {
      this.revision += 1;
      this.entries.clear();
      this.requests.clear();
      this.bucketRevisions.clear();
      return;
    }
    this.bucketRevisions.set(bucketId, (this.bucketRevisions.get(bucketId) ?? 0) + 1);
    for (const [key, entry] of this.entries) {
      if (entry.bucketId === bucketId) this.entries.delete(key);
    }
    for (const [key, request] of this.requests) {
      if (request.bucketId === bucketId) this.requests.delete(key);
    }
  }
}
