const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");

// Compile TS in memory with the project's own TypeScript; no test dependencies
// or database credentials are needed. Each loader has isolated mock modules.
function loader(mocks = {}) {
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
}
const load = loader();
const policyLib = load("@/lib/folder-access-policy");
const formLib = load("@/lib/folder-access-form");
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const ctx = { user: { id: userId }, team: { id: "team-1" }, role: "member", status: "active", permissions: new Set(["object.list", "object.read", "object.download", "object.search", "object.upload", "object.delete"]) };
function record(mode = "password", extra = {}) {
  return { id: "policy-1", team_id: "team-1", bucket_id: "bucket-1", prefix: "private/", enabled: true,
    owner_user_id: otherId, updated_at: "2026-09-10T01:00:00Z", passcode_salt: "salt", passcode_hash: "hash",
    access_policy: { ...policyLib.emptyFolderAccessPolicy(), mode, version: "revision-1", ...extra } };
}
function grant(row, overrides = {}) {
  return { userId, teamId: "team-1", bucketId: row.bucket_id, policyId: row.id,
    policyVersion: policyLib.getFolderAccessPolicy(row).version, prefix: row.prefix, expiresAt: Date.now() + 60000, ...overrides };
}

test("editing a legacy combined policy preserves individual grants and exclusions", () => {
  const saved = record("members_password", {
    allowedRoles: ["admin"], allowedUserIds: [userId, otherId], deniedUserIds: ["blocked-member"],
  }).access_policy;
  const snapshot = JSON.stringify(saved);
  const scope = formLib.getFolderGrantScope(saved, [userId]);
  assert.equal(scope, "combined");
  const draft = formLib.buildFolderPolicyDraft(saved, scope, [userId]);
  assert.deepEqual(draft.allowedUserIds, saved.allowedUserIds);
  assert.deepEqual(draft.deniedUserIds, saved.deniedUserIds);
  assert.equal(formLib.hasFolderPolicyChanges(saved, draft, [userId]), false);
  assert.equal(JSON.stringify(saved), snapshot);
});

test("only an explicit scope change replaces the saved authorization range", () => {
  const saved = record("members", { allowedRoles: ["admin"], allowedUserIds: [userId, otherId] }).access_policy;
  const rolesDraft = formLib.buildFolderPolicyDraft(saved, "roles", [userId]);
  assert.deepEqual(rolesDraft.allowedUserIds, [userId]);
  assert.deepEqual(rolesDraft.allowedRoles, ["admin"]);
  assert.equal(formLib.hasFolderPolicyChanges(saved, rolesDraft, [userId]), true);
  const userDraft = formLib.buildFolderPolicyDraft(saved, "users", [userId]);
  assert.deepEqual(userDraft.allowedRoles, []);
  assert.deepEqual(userDraft.allowedUserIds, [userId, otherId]);
  assert.deepEqual(saved.allowedRoles, ["admin"]);
  assert.deepEqual(saved.allowedUserIds, [userId, otherId]);
});

test("default grants and array order do not falsely mark a policy as edited", () => {
  const saved = record("members", { allowedRoles: ["admin", "member"], allowedUserIds: [userId] }).access_policy;
  assert.equal(formLib.getFolderGrantScope(saved, [userId]), "roles");
  const reordered = { ...saved, allowedRoles: ["member", "admin", "admin"], allowedUserIds: [] };
  assert.equal(formLib.hasFolderPolicyChanges(saved, reordered, [userId]), false);
  assert.equal(formLib.hasFolderPolicyChanges(saved, { ...saved, hideUnauthorized: true }, [userId]), true);
  assert.equal(formLib.hasFolderPolicyChanges(saved, { ...saved, mode: "password" }, [userId]), true);
});

test("password, members and AND mode have distinct authorization behavior", () => {
  const password = record();
  assert.equal(policyLib.evaluateFolderAccess(ctx, password), "password_required");
  assert.equal(policyLib.evaluateFolderAccess(ctx, password, [grant(password)]), "allow");
  const members = record("members", { allowedUserIds: [userId] });
  assert.equal(policyLib.evaluateFolderAccess(ctx, members), "allow");
  const both = record("members_password", { allowedRoles: ["member"] });
  assert.equal(policyLib.evaluateFolderAccess(ctx, both), "password_required");
  assert.equal(policyLib.evaluateFolderAccess(ctx, both, [grant(both)]), "allow");
  const notInvited = record("members_password", { allowedUserIds: [otherId] });
  assert.equal(policyLib.evaluateFolderAccess(ctx, notInvited, [grant(notInvited)]), "deny_visible");
});

test("explicit exclusions override role, individual and password grants", () => {
  for (const mode of ["password", "members", "members_password"]) {
    const row = record(mode, { allowedRoles: ["member"], allowedUserIds: [userId], deniedUserIds: [userId], hideUnauthorized: true });
    assert.equal(policyLib.evaluateFolderAccess(ctx, row, [grant(row)]), "deny_hidden");
  }
  const row = record("members", { allowedRoles: ["member"] });
  assert.equal(policyLib.evaluateFolderAccess({ ...ctx, role: "admin" }, row), "deny_visible");
});

test("grants cannot cross users, teams, policies, paths or revisions, or outlive expiry", () => {
  const row = record();
  for (const overrides of [{ userId: otherId }, { teamId: "team-2" }, { bucketId: "bucket-2" }, { policyId: "policy-2" },
    { prefix: "private/child/" }, { policyVersion: "old" }, { expiresAt: Date.now() - 1 }]) {
    assert.equal(policyLib.evaluateFolderAccess(ctx, row, [grant(row, overrides)]), "password_required");
  }
  assert.equal(policyLib.evaluateFolderAccess({ ...ctx, status: "disabled" }, row, [grant(row)]), "deny_hidden");
  assert.equal(policyLib.evaluateFolderAccess({ ...ctx, team: { id: "elsewhere" } }, row), "deny_hidden");
});

test("visibility separates discoverability from access, including password-only hiding", () => {
  const row = record("members");
  const decision = policyLib.evaluateFolderAccess(ctx, row);
  assert.equal(policyLib.canDiscoverFolderPath("private/", row, decision), true);
  assert.equal(policyLib.canDiscoverFolderPath("private/file.txt", row, decision), false);
  const hidden = record("members", { hideUnauthorized: true });
  assert.equal(policyLib.canDiscoverFolderPath("private/", hidden, policyLib.evaluateFolderAccess(ctx, hidden)), false);
  const password = record("password", { hideUnauthorized: true });
  assert.equal(policyLib.canDiscoverFolderPath("private/", password, policyLib.evaluateFolderAccess(ctx, password)), true);
});

test("legacy policies require their old password; malformed policies fail closed", () => {
  const row = { ...record(), access_policy: undefined };
  assert.equal(policyLib.getFolderAccessPolicy(row).mode, "password");
  assert.equal(policyLib.evaluateFolderAccess(ctx, row), "password_required");
  assert.throws(() => policyLib.evaluateFolderAccess(ctx, { ...row, access_policy: { mode: "unknown" } }));
  assert.equal(policyLib.findEffectiveFolderLockFromRows([record()], "private-other/a.txt"), null);
  assert.ok(policyLib.findEffectiveFolderLockFromRows([record()], "private/a.txt"));
});

function serverFixture(rows, objects = []) {
  const calls = [];
  let current = ctx;
  let schemaAvailable = true;
  const buckets = {
    list: async ({ prefix = "", delimiter }) => {
      calls.push("r2.list");
      const matched = objects.filter((obj) => obj.key.startsWith(prefix));
      if (!delimiter) return { objects: matched, truncated: false };
      const folders = new Set();
      const files = [];
      for (const obj of matched) {
        const slash = obj.key.indexOf("/", prefix.length);
        if (slash >= 0) folders.add(obj.key.slice(0, slash + 1));
        else files.push(obj);
      }
      // Include marker objects as some S3-compatible backends do.
      files.push(...matched.filter((obj) => obj.key.endsWith("/") && obj.size === 0));
      return { objects: files, delimitedPrefixes: [...folders], truncated: false };
    },
    get: async () => { calls.push("r2.get"); return { body: "ok", size: 2 }; },
  };
  const mocks = {
    "@/lib/access-control": {
      getAppAccessContextFromRequest: async () => current,
      requirePermission: (subject, permission) => { if (!subject.permissions.has(permission)) throw Object.assign(new Error("denied"), { status: 403 }); },
      listTeamMembersByTeamId: async () => [{ user_id: userId }, { user_id: otherId }],
    },
    "@/lib/supabase": {
      supabaseAdminRestFetch: async (url, options) => {
        calls.push({ url, options });
        if (!schemaAvailable) return new Response(JSON.stringify({ code: "42P01", message: "user_r2_folder_locks does not exist" }), { status: 404 });
        return new Response(JSON.stringify(rows), { status: 200 });
      },
      readSupabaseRestArray: async (res) => { if (!res.ok) throw new Error("database unavailable"); return res.json(); },
    },
    "@/lib/user-buckets": { resolveBucketCredentials: async () => ({ creds: {} }) },
    "@/lib/r2-s3": { createR2Bucket: () => buckets, getPresignedObjectUrl: async () => { calls.push("presigned"); return "https://storage.example/file"; } },
    "@/lib/audit-logs": { writeAuditLog: async () => {}, writeAuditLogs: async () => {} },
    "@/lib/file-marks": { isRecycleHiddenKey: (key) => key.startsWith(".r2-admin-go/"), listFavoriteKeySet: async () => new Set(),
      listActiveRecycleRows: async () => [], isKeyInActiveRecycle: () => false, listFavorites: async () => objects.map((item) => ({ ...item, type: item.key.endsWith("/") ? "folder" : "file", name: item.key })),
      listRecycleItems: async () => objects.map((item, i) => ({ ...item, trashId: "trash-" + i, type: item.key.endsWith("/") ? "folder" : "file", name: item.key })),
      restoreRecycleItem: async () => { calls.push("restore"); return "private/file.txt"; },
    },
  };
  return { load: loader(mocks), calls, setContext: (value) => { current = value; }, breakSchema: () => { schemaAvailable = false; } };
}
const request = (url, init) => new NextRequest("http://localhost" + url, init);

test("hidden folders and their marker entries never appear in list/search/favorites/recycle", async () => {
  const hidden = record("members", { hideUnauthorized: true });
  const fixture = serverFixture([hidden], [{ key: "private/", size: 0 }, { key: "private/secret.txt", size: 900 }, { key: "public.txt", size: 10 }]);
  for (const [route, query] of [["files", ""], ["search", "&q=txt"], ["favorites", ""], ["recycle", ""]]) {
    const res = await fixture.load("@/lib/api-routes/" + route + "/route").GET(request("/api/" + route + "?bucket=bucket-1" + query));
    assert.equal(res.status, 200, route);
    const data = await res.json();
    assert.deepEqual(data.items.map((item) => item.key), ["public.txt"], route);
    assert.equal(JSON.stringify(data).includes("secret"), false);
  }
});

test("direct hidden path is 404 and rejected before touching object storage", async () => {
  const fixture = serverFixture([record("members", { hideUnauthorized: true })]);
  const files = fixture.load("@/lib/api-routes/files/route");
  const res = await files.GET(request("/api/files?bucket=bucket-1&prefix=private/"));
  assert.equal(res.status, 404);
  assert.equal(fixture.calls.includes("r2.list"), false);
  const download = await fixture.load("@/lib/api-routes/download/route").GET(request("/api/download?bucket=bucket-1&key=private/a.txt"));
  assert.equal(download.status, 404);
  assert.equal(fixture.calls.includes("presigned"), false);
});

test("members-only access does not grant missing global download permissions", async () => {
  const fixture = serverFixture([record("members", { allowedUserIds: [userId] })]);
  fixture.setContext({ ...ctx, permissions: new Set(["object.list"]) });
  const res = await fixture.load("@/lib/api-routes/download/route").GET(request("/api/download?bucket=bucket-1&key=private/a.txt&download=1"));
  assert.equal(res.status, 403);
});

test("parent operations must satisfy child policies and missing DB fails closed", async () => {
  const hidden = { ...record("members", { hideUnauthorized: true }), prefix: "parent/private/" };
  const fixture = serverFixture([hidden]);
  const api = fixture.load("@/lib/folder-locks");
  const reader = await api.createFolderAccessReader(request("/"), ctx, "bucket-1");
  assert.doesNotThrow(() => reader.assert("parent/"));
  assert.throws(() => reader.assert("parent/", true), { status: 404 });
  fixture.breakSchema();
  await assert.rejects(() => api.createFolderAccessReader(request("/"), ctx, "bucket-1"), { status: 503 });
});

test("recycle recovery cannot bypass a denied folder policy", async () => {
  const fixture = serverFixture([record("members", { hideUnauthorized: true })], [{ key: "private/", size: 0 }]);
  const res = await fixture.load("@/lib/api-routes/recycle/route").PATCH(request("/api/recycle", { method: "PATCH", body: JSON.stringify({ bucket: "bucket-1", id: "trash-0", action: "restore" }) }));
  assert.equal(res.status, 404);
  assert.equal(fixture.calls.includes("restore"), false);
});

test("new passwords preserve whitespace and symbols and old password hashes still verify", async () => {
  process.env.ROUTE_TOKEN_SECRET = "folder-test-secret-with-enough-length";
  const passwords = load("@/lib/folder-password");
  const legacy = load("@/lib/share-security");
  const salt = legacy.createPasscodeSalt();
  const value = " 密码 with symbols! ";
  const hash = await passwords.hashFolderPassword(value, salt);
  assert.equal(await passwords.verifyFolderPassword(value, salt, hash), true);
  assert.equal(await passwords.verifyFolderPassword(value.trim(), salt, hash), false);
  const old = await legacy.hashPasscode("1234", salt);
  assert.equal(await passwords.verifyFolderPassword("1234", salt, old), true);
});

test("v2 cookie rejects legacy grants, binds identities and preserves individual expiration", async () => {
  process.env.ROUTE_TOKEN_SECRET = "folder-test-secret-with-enough-length";
  const cookies = load("@/lib/folder-lock-access");
  const cryptoLib = load("@/lib/crypto");
  const old = await cryptoLib.issueSealedPayload({ grants: [{ bucketId: "bucket-1", prefix: "private/" }] });
  assert.deepEqual(await cookies.readFolderUnlockGrants(request("/", { headers: { cookie: cookies.FOLDER_UNLOCK_COOKIE_NAME + "=" + old } })), []);
  const first = record();
  const response = NextResponse.json({});
  await cookies.grantFolderUnlock(request("/"), response, ctx, first);
  const cookie = response.cookies.get(cookies.FOLDER_UNLOCK_COOKIE_NAME).value;
  const req = request("/", { headers: { cookie: cookies.FOLDER_UNLOCK_COOKIE_NAME + "=" + cookie } });
  const before = await cookies.readFolderUnlockGrants(req);
  const secondResponse = NextResponse.json({});
  await cookies.grantFolderUnlock(req, secondResponse, ctx, { ...first, id: "second", prefix: "second/" });
  const secondCookie = secondResponse.cookies.get(cookies.FOLDER_UNLOCK_COOKIE_NAME).value;
  const after = await cookies.readFolderUnlockGrants(request("/", { headers: { cookie: cookies.FOLDER_UNLOCK_COOKIE_NAME + "=" + secondCookie } }));
  assert.equal(after.find((g) => g.policyId === first.id).expiresAt, before[0].expiresAt);
  assert.equal(policyLib.evaluateFolderAccess({ ...ctx, user: { id: otherId } }, first, after), "password_required");
});

test("protected download links require the same session and recheck revocations", async () => {
  process.env.ROUTE_TOKEN_SECRET = "folder-test-secret-with-enough-length";
  const row = record("members", { allowedUserIds: [userId], hideUnauthorized: true });
  const fixture = serverFixture([row]);
  fixture.setContext({ ...ctx, token: "test-session" });
  const res = await fixture.load("@/lib/api-routes/download/route").GET(request("/api/download?bucket=bucket-1&key=private/a.txt"));
  assert.equal(res.status, 200);
  assert.equal(fixture.calls.includes("presigned"), false);
  const data = await res.json();
  assert.equal(new URL(data.url).pathname, "/api/object");
  const objects = fixture.load("@/lib/api-routes/object/route");
  assert.equal((await objects.GET(new NextRequest(data.url))).status, 401);
  const session = res.cookies.get("r2_folder_session_v1").value;
  const authenticatedRequest = () => new NextRequest(data.url, { headers: { cookie: "r2_folder_session_v1=" + session } });
  assert.equal((await objects.GET(authenticatedRequest())).status, 200);
  fixture.setContext({ ...ctx, user: { id: otherId }, token: "different-session" });
  assert.equal((await objects.GET(authenticatedRequest())).status, 404);
  fixture.setContext({ ...ctx, token: "test-session" });
  row.access_policy.deniedUserIds = [userId];
  assert.equal((await objects.GET(authenticatedRequest())).status, 404);
});

test("updating identity rules can retain existing passwords but cannot exclude the creator", async () => {
  const row = record("members_password", { allowedUserIds: [userId] });
  const fixture = serverFixture([row]);
  const manager = { ...ctx, role: "admin" };
  const locks = fixture.load("@/lib/folder-locks");
  await locks.upsertFolderLock(manager, { bucketId: "bucket-1", prefix: "private/", passcode: "", policy: {
    ...row.access_policy, allowedRoles: ["admin"], hideUnauthorized: true,
  } });
  const update = fixture.calls.find((call) => call.options?.method === "PATCH");
  assert.equal(update.options.body.passcode_hash, row.passcode_hash);
  assert.notEqual(update.options.body.access_policy.version, row.access_policy.version);
  await assert.rejects(() => locks.upsertFolderLock(manager, { bucketId: "bucket-1", prefix: "private/", passcode: "",
    policy: { ...row.access_policy, deniedUserIds: [otherId] } }), { status: 400 });
});
