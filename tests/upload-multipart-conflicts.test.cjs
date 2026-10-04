const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

const loader = (mocks) => {
  const cache = new Map();
  const load = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    const filename = path.resolve(__dirname, "..", name.slice(2) + ".ts");
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module);
    cache.set(filename, mod);
    mod.filename = filename;
    mod.paths = module.paths;
    mod.require = load;
    mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, filename);
    return mod.exports;
  };
  return load;
};

const request = (body) => new NextRequest("http://localhost/api/multipart", {
  method: "POST",
  body: JSON.stringify(body),
});

const createFixture = () => {
  const calls = [];
  const ctx = {
    user: { id: "user-1" },
    team: { id: "team-1" },
    displayName: "Uploader",
    permissions: new Set(["object.upload", "object.delete"]),
  };
  const bucket = {
    head: async (key) => key === "docs/report.bin" ? { size: 128, etag: "old" } : null,
    createMultipartUpload: async (key) => { calls.push(["create", key]); return { uploadId: "upload-1" }; },
    resumeMultipartUpload: (key, uploadId) => ({
      complete: async (parts) => { calls.push(["complete", key, uploadId, parts]); },
      abort: async () => { calls.push(["abort", key, uploadId]); },
      uploadPart: async () => ({ etag: "part-etag" }),
    }),
    delete: async (key) => { calls.push(["delete", key]); },
  };
  const mocks = {
    "@/lib/access-control": {
      getAppAccessContextFromRequest: async () => ctx,
      requirePermission: (subject, permission) => {
        if (!subject.permissions.has(permission)) throw Object.assign(new Error("denied"), { status: 403 });
      },
    },
    "@/lib/r2-s3": {
      createR2Bucket: () => bucket,
      copyObjectInBucket: async (...args) => { calls.push(["copy", ...args]); },
      getPresignedObjectUrl: async () => "https://storage.example/part",
    },
    "@/lib/route-token": {
      issueRouteToken: async () => "token",
      readRouteToken: async () => { throw new Error("not used"); },
    },
    "@/lib/user-buckets": { resolveBucketCredentials: async () => ({ creds: { bucketName: "bucket" } }) },
    "@/lib/error-zh": { toChineseErrorMessage: (error, fallback) => error instanceof Error ? error.message : String(error || fallback) },
    "@/lib/folder-locks": { assertFolderUnlockedForPath: async () => null },
    "@/lib/audit-logs": { writeAuditLog: async (entry) => { calls.push(["audit", entry.action]); } },
    "@/lib/file-marks": {
      INTERNAL_STORAGE_ROOT: ".r2-admin-go/",
      moveItemsToRecycle: async (_ctx, _bucketId, items) => {
        calls.push(["recycle", items[0].key]);
        return [{ ...items[0], name: "report.bin" }];
      },
    },
    "@/lib/folder-route-access": {
      assertFolderRouteAccess: async () => {},
      folderRouteAccessFor: () => ({}),
      setFolderRouteSession: async (response) => response,
    },
  };
  return { route: loader(mocks)("@/lib/api-routes/multipart/route"), calls };
};

test("multipart uploads reject an existing final key before allocating parts", async () => {
  const fixture = createFixture();
  const response = await fixture.route.POST(request({
    action: "create",
    bucket: "bucket-1",
    key: "docs/report.bin",
    conflictPolicy: "reject",
  }));
  assert.equal(response.status, 409);
  assert.equal(fixture.calls.some(([name]) => name === "create"), false);
});

test("multipart replacement stages the full upload before recycling and conditionally publishing", async () => {
  const fixture = createFixture();
  const created = await fixture.route.POST(request({
    action: "create",
    bucket: "bucket-1",
    key: "docs/report.bin",
    conflictPolicy: "replace",
  }));
  assert.equal(created.status, 200);
  const createData = await created.json();
  assert.match(createData.uploadKey, /^\.r2-admin-go\/uploads\/team-1\/user-1\//);
  assert.equal(fixture.calls.some(([name]) => name === "recycle"), false);

  const completed = await fixture.route.POST(request({
    action: "complete",
    bucket: "bucket-1",
    key: "docs/report.bin",
    uploadKey: createData.uploadKey,
    uploadId: createData.uploadId,
    conflictPolicy: "replace",
    parts: [{ partNumber: 1, etag: "part-etag" }],
  }));
  assert.equal(completed.status, 200);
  assert.ok(fixture.calls.some(([name, key]) => name === "complete" && key === createData.uploadKey));
  assert.ok(fixture.calls.some(([name, key]) => name === "recycle" && key === "docs/report.bin"));
  const copy = fixture.calls.find(([name]) => name === "copy");
  assert.deepEqual(copy.slice(2), [createData.uploadKey, "docs/report.bin", { destinationIfNoneMatch: "*" }]);
  assert.ok(fixture.calls.some(([name, key]) => name === "delete" && key === createData.uploadKey));
});
