const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function compile(source, filename) {
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}
const cacheFile = path.resolve(__dirname, "../lib/file-list-cache.ts");
const { FileListCache, FILE_LIST_CACHE_FRESH_MS } = compile(fs.readFileSync(cacheFile, "utf8"), cacheFile);
const pageFile = path.resolve(__dirname, "../app/page.tsx");
const pageSource = ts.createSourceFile(pageFile, fs.readFileSync(pageFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Execute the actual page callbacks with mock state/network rather than a
// duplicate implementation. No browser, login, or remote file operations.
function pageFunction(name, dependencies) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(pageSource) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(pageSource);
  assert.ok(initializer, `Missing page callback: ${name}`);
  const source = `export const create = (dependencies: any) => {
    const { ${Object.keys(dependencies).join(", ")} } = dependencies;
    return ${initializer.getText(pageSource)};
  };`;
  return compile(source, `${pageFile}.${name}.test.cjs`).create(dependencies);
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const file = (key) => ({ key, name: key.split("/").at(-1), type: "file", size: 12 });
const response = (items, status = 200, extra = {}) => ({ ok: status === 200, status, body: { items, ...extra } });

function fixture() {
  const cache = new FileListCache();
  const state = { files: [], searchResults: [], loading: false, fileListLoading: false, fileListError: null };
  const events = [];
  const calls = [];
  const dependencies = {
    fileListCacheRef: { current: cache },
    fileListBlockingRequestRef: { current: null },
    fileListRequestSeqRef: { current: 1 },
    authRef: { current: { userId: "user-1" } },
    selectedBucketRef: { current: "bucket-1" },
    pathRef: { current: [] },
    fileSpaceRef: { current: "files" },
    searchTermRef: { current: "" },
    toPrefixFromPath: (currentPath) => currentPath.length ? currentPath.join("/") + "/" : "",
    fetchWithAuth: async (url) => { calls.push(url); return response([]); },
    readJsonSafe: async (res) => res.body,
    toChineseErrorMessage: (error, fallback) => String(error || fallback),
    console: { warn() {}, error() {} },
  };
  for (const key of ["Files", "SearchResults", "Loading", "FileListLoading", "FileListError", "CurrentFolderLockContext", "ConnectionStatus", "ConnectionDetail", "BucketUsageError", "FolderUnlockTarget", "FolderUnlockPasscode", "ShowFolderUnlockPasscode", "FolderUnlockOpen"]) {
    const field = key[0].toLowerCase() + key.slice(1);
    dependencies[`set${key}`] = (value) => {
      state[field] = typeof value === "function" ? value(state[field]) : value;
      events.push([field, state[field]]);
    };
  }
  return {
    cache, state, events, calls, dependencies,
    fetch: (options) => pageFunction("fetchFiles", dependencies)("bucket-1", dependencies.pathRef.current, options),
    seed(items, age = 0, currentPath = dependencies.pathRef.current) {
      cache.write(cache.beginRequest("bucket-1", currentPath), { items }, Date.now() - age);
    },
  };
}

test("fresh and stale entries remain available, including empty folders", () => {
  const cache = new FileListCache();
  cache.write(cache.beginRequest("bucket-1", []), { items: [] }, 1000);
  const entry = cache.read("bucket-1", []);
  assert.deepEqual(entry.value.items, []);
  assert.equal(cache.isFresh(entry, 1000 + FILE_LIST_CACHE_FRESH_MS - 1), true);
  assert.equal(cache.isFresh(entry, 1000 + FILE_LIST_CACHE_FRESH_MS), false);
  assert.equal(cache.read("bucket-1", []).value, entry.value);
});

test("bucket invalidation removes root and children synchronously without prefix collisions", () => {
  const cache = new FileListCache();
  for (const [bucket, currentPath] of [["bucket-1", []], ["bucket-1", ["docs"]], ["bucket-10", []]]) {
    cache.write(cache.beginRequest(bucket, currentPath), { items: [file("old.txt")] });
  }
  cache.invalidate("bucket-1");
  assert.equal(cache.read("bucket-1", []), undefined);
  assert.equal(cache.read("bucket-1", ["docs"]), undefined);
  assert.ok(cache.read("bucket-10", []));
});

test("operation invalidation and session clearing reject old responses", () => {
  const cache = new FileListCache();
  const beforeDelete = cache.beginRequest("bucket-1", []);
  cache.invalidate("bucket-1");
  assert.equal(cache.write(beforeDelete, { items: [file("deleted.txt")] }), false);
  const beforeLogout = cache.beginRequest("bucket-1", []);
  cache.invalidate();
  assert.equal(cache.write(beforeLogout, { items: [file("private.txt")] }), false);
  assert.equal(cache.read("bucket-1", []), undefined);
});

test("newer same-directory requests win and the cache has an LRU bound", () => {
  const cache = new FileListCache(2);
  const older = cache.beginRequest("bucket-1", []);
  const newer = cache.beginRequest("bucket-1", []);
  assert.equal(cache.write(newer, { items: [file("new.txt")] }), true);
  assert.equal(cache.write(older, { items: [file("old.txt")] }), false);
  cache.write(cache.beginRequest("bucket-1", ["a"]), { items: [] });
  cache.read("bucket-1", []);
  cache.write(cache.beginRequest("bucket-1", ["b"]), { items: [] });
  assert.equal(cache.read("bucket-1", ["a"]), undefined);
  assert.equal(cache.read("bucket-1", []).value.items[0].key, "new.txt");
});

test("reopening a fresh directory displays it immediately without a request or loader", async () => {
  const f = fixture();
  f.seed([file("cached.txt")]);
  await f.fetch({ requestSeq: 1 });
  assert.equal(f.state.files[0].key, "cached.txt");
  assert.equal(f.calls.length, 0);
  assert.equal(f.events.some(([key, value]) => ["loading", "fileListLoading"].includes(key) && value === true), false);
});

test("stale directory content stays visible during background revalidation", async () => {
  const f = fixture();
  const network = deferred();
  f.seed([file("cached.txt")], FILE_LIST_CACHE_FRESH_MS + 1);
  f.dependencies.fetchWithAuth = () => network.promise;
  const pending = f.fetch({ requestSeq: 1 });
  assert.equal(f.state.files[0].key, "cached.txt");
  assert.equal(f.state.loading, false);
  assert.equal(f.state.fileListLoading, false);
  network.resolve(response([file("latest.txt")]));
  await pending;
  assert.equal(f.state.files[0].key, "latest.txt");
  assert.equal(f.cache.read("bucket-1", []).value.items[0].key, "latest.txt");
});

test("forced refresh bypasses fresh cache and reports failure instead of displaying incorrect contents", async () => {
  const f = fixture();
  f.seed([file("deleted.txt")]);
  f.state.files = [file("deleted.txt")];
  f.dependencies.fetchWithAuth = async () => response([], 500, { error: "refresh failed" });
  await f.fetch({ force: true, silent: true });
  assert.deepEqual(f.state.files, []);
  assert.equal(f.state.fileListError, "refresh failed");
  assert.equal(f.cache.read("bucket-1", []), undefined);
});

test("temporary background failure retains cache, but denied access clears it", async () => {
  for (const status of [500, 403, 423]) {
    const f = fixture();
    f.seed([file("cached.txt")], FILE_LIST_CACHE_FRESH_MS + 1);
    f.dependencies.fetchWithAuth = async () => response([], status, { error: "failed", lock: { prefix: "private/" } });
    await f.fetch();
    if (status === 500) {
      assert.equal(f.state.files[0].key, "cached.txt");
      assert.ok(f.cache.read("bucket-1", []));
    } else {
      assert.deepEqual(f.state.files, []);
      assert.equal(f.cache.read("bucket-1", []), undefined);
      assert.equal(f.state.fileListError, "failed");
      if (status === 423) assert.equal(f.state.folderUnlockOpen, true);
    }
  }
});

test("a response started before deletion cannot restore deleted files or stale cache", async () => {
  const f = fixture();
  const oldNetwork = deferred();
  f.dependencies.fetchWithAuth = () => oldNetwork.promise;
  const pending = f.fetch({ requestSeq: 1 });
  f.cache.invalidate("bucket-1");
  f.state.files = [];
  oldNetwork.resolve(response([file("deleted.txt")]));
  await pending;
  assert.deepEqual(f.state.files, []);
  assert.equal(f.cache.read("bucket-1", []), undefined);
  assert.equal(f.state.loading, false);
});

test("silent upload refresh takes ownership of an initial loader without allowing the old response to win", async () => {
  const f = fixture();
  const initial = deferred();
  const uploaded = deferred();
  f.dependencies.fetchWithAuth = () => initial.promise;
  const first = f.fetch({ requestSeq: 1 });
  f.cache.invalidate("bucket-1");
  f.dependencies.fileListRequestSeqRef.current = 2;
  f.dependencies.fetchWithAuth = () => uploaded.promise;
  const second = f.fetch({ force: true, silent: true, requestSeq: 2 });
  initial.resolve(response([file("old.txt")]));
  await first;
  assert.equal(f.state.loading, true);
  uploaded.resolve(response([file("uploaded.txt")]));
  await second;
  assert.equal(f.state.files[0].key, "uploaded.txt");
  assert.equal(f.state.loading, false);
  assert.equal(f.state.fileListLoading, false);
});

test("late directory responses cannot replace a different path or user", async () => {
  for (const change of ["path", "user"]) {
    const f = fixture();
    const network = deferred();
    f.dependencies.fetchWithAuth = () => network.promise;
    const pending = f.fetch();
    if (change === "path") f.dependencies.pathRef.current = ["other"];
    else f.dependencies.authRef.current = { userId: "user-2" };
    f.state.files = [file("current.txt")];
    network.resolve(response([file("wrong.txt")]));
    await pending;
    assert.equal(f.state.files[0].key, "current.txt");
    assert.equal(f.cache.read("bucket-1", []), undefined);
  }
});

test("confirmed deletion immediately removes items and folder descendants while waiting for canonical refresh", async () => {
  const f = fixture();
  const target = { key: "docs/", name: "docs", type: "folder" };
  const other = file("keep.txt");
  f.seed([target, other]);
  f.state.files = [target, other];
  f.state.searchResults = [file("docs/deleted.txt"), file("docs-other/keep.txt")];
  const refresh = deferred();
  const dependencies = {
    ...f.dependencies, selectedBucket: "bucket-1", selectedKeys: new Set([target.key]), filteredFiles: [target, other], selectedItem: null,
    invalidateFileListCache: (bucket) => f.cache.invalidate(bucket),
    refreshCurrentView: () => refresh.promise,
  };
  for (const name of ["setDeleteSubmitting", "setDeleteOpen", "setSelectedItem", "setSelectedKeys", "setObjectPropertiesTarget", "setToast"]) dependencies[name] = () => {};
  const pending = pageFunction("executeDelete", dependencies)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.cache.read("bucket-1", []), undefined);
  assert.deepEqual(f.state.files, [other]);
  assert.deepEqual(f.state.searchResults.map((item) => item.key), ["docs-other/keep.txt"]);
  refresh.resolve();
  await pending;
});

test("confirmed rename invalidates cache and updates the name before background refresh completes", async () => {
  const f = fixture();
  const item = file("old.txt");
  f.seed([item]);
  f.state.files = [item];
  f.state.searchResults = [item];
  const refresh = deferred();
  const dependencies = {
    ...f.dependencies, selectedBucket: "bucket-1", canRenameObject: true, inlineRenameValue: "new.txt", fileSpace: "files",
    invalidateFileListCache: (bucket) => f.cache.invalidate(bucket),
    refreshCurrentView: () => refresh.promise,
  };
  for (const name of ["cancelInlineRename", "setInlineRenameSavingKey", "setSelectedItem", "setSelectedKeys", "setObjectPropertiesTarget", "setToast"]) dependencies[name] = () => {};
  await pageFunction("executeInlineRename", dependencies)(item);
  assert.equal(f.cache.read("bucket-1", []), undefined);
  assert.equal(f.state.files[0].key, "new.txt");
  assert.equal(f.state.searchResults[0].name, "new.txt");
  refresh.resolve();
});

test("continuous uploads share an 800ms refresh timer instead of postponing it indefinitely", async () => {
  const f = fixture();
  const timers = [];
  const refreshes = [];
  const dependencies = {
    ...f.dependencies,
    uploadRefreshTimerRef: { current: null },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    refreshCurrentView: async (options) => refreshes.push([f.dependencies.pathRef.current, options]),
  };
  const schedule = pageFunction("scheduleUploadListRefresh", dependencies);
  for (let n = 0; n < 5; n += 1) schedule("bucket-1");
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 800);
  f.dependencies.pathRef.current = ["latest"];
  timers[0].callback();
  assert.deepEqual(refreshes, [[["latest"], { silent: true }]]);
  assert.equal(dependencies.uploadRefreshTimerRef.current, null);
  schedule("bucket-1");
  assert.equal(timers.length, 2);
});

test("a rename finishing after a bucket switch cannot rename a same-key file in the new bucket", async () => {
  const f = fixture();
  const item = file("old.txt");
  f.state.files = [item];
  const network = deferred();
  const dependencies = {
    ...f.dependencies, selectedBucket: "bucket-1", canRenameObject: true, inlineRenameValue: "new.txt", fileSpace: "files",
    fetchWithAuth: () => network.promise,
    invalidateFileListCache: (bucket) => f.cache.invalidate(bucket),
    refreshCurrentView: async () => {},
  };
  for (const name of ["cancelInlineRename", "setInlineRenameSavingKey", "setSelectedItem", "setSelectedKeys", "setObjectPropertiesTarget", "setToast"]) dependencies[name] = () => {};
  const pending = pageFunction("executeInlineRename", dependencies)(item);
  f.dependencies.selectedBucketRef.current = "bucket-2";
  network.resolve(response([]));
  await pending;
  assert.equal(f.state.files[0].key, "old.txt");
});

test("refresh chooses the latest directory or search rather than the route captured before an operation", async () => {
  const f = fixture();
  const calls = [];
  const dependencies = {
    ...f.dependencies, searchRequestSeqRef: { current: 0 }, searchMorePendingRef: { current: true },
    setSearchMoreLoading() {}, setSearchCursor() {},
    runGlobalSearch: async (...args) => calls.push(["search", ...args]),
    fetchCurrentFileSpace: async (...args) => calls.push(["directory", ...args]),
  };
  const refresh = pageFunction("refreshCurrentView", dependencies);
  f.dependencies.pathRef.current = ["latest"];
  await refresh({ silent: true });
  assert.deepEqual(calls[0], ["directory", "bucket-1", ["latest"], { force: true, silent: true, space: "files" }]);
  f.dependencies.searchTermRef.current = " uploaded ";
  await refresh({ silent: true });
  assert.deepEqual(calls[1], ["search", "bucket-1", "uploaded", 1]);
});
