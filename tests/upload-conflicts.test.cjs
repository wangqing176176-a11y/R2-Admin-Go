const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, "..", relativePath);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
};

const {
  countUploadKeyConflicts,
  createAvailableUploadKey,
  planUploadKeys,
} = loadTypeScriptModule("lib/upload-conflicts.ts");
const { getPresignedObjectUrl } = loadTypeScriptModule("lib/r2-s3.ts");

test("keep-both assigns extension-aware names without colliding with the batch", () => {
  const existing = new Set(["docs/report.docx", "docs/report (1).docx"]);
  assert.equal(countUploadKeyConflicts(["docs/report.docx", "docs/report.docx"], existing), 2);
  assert.deepEqual(planUploadKeys(["docs/report.docx", "docs/report.docx"], existing, "keep-both"), [
    { key: "docs/report (2).docx", conflictPolicy: "reject" },
    { key: "docs/report (3).docx", conflictPolicy: "reject" },
  ]);
  assert.equal(createAvailableUploadKey("README", new Set(["README"])), "README (1)");
});

test("replace is granted only once per existing key and duplicate selections stay separate", () => {
  assert.deepEqual(planUploadKeys(
    ["docs/report.docx", "docs/report.docx", "docs/new.docx"],
    ["docs/report.docx"],
    "replace",
  ), [
    { key: "docs/report.docx", conflictPolicy: "replace" },
    { key: "docs/report (1).docx", conflictPolicy: "reject" },
    { key: "docs/new.docx", conflictPolicy: "reject" },
  ]);
});

test("presigned conditional uploads include If-None-Match in the signed headers", async () => {
  const url = await getPresignedObjectUrl({
    creds: {
      accountId: "example-account",
      accessKeyId: "example-access-key",
      secretAccessKey: "example-secret-key",
      bucketName: "example-bucket",
    },
    key: "docs/report.docx",
    method: "PUT",
    headers: { "If-None-Match": "*" },
  });
  const signedHeaders = new URL(url).searchParams.get("X-Amz-SignedHeaders");
  assert.equal(signedHeaders, "host;if-none-match");
});
