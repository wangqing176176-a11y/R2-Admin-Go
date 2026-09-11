const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Run with PGLITE_MODULE_PATH pointing to a temporary installation of
// @electric-sql/pglite. This exercises real PostgreSQL/PLpgSQL without accessing
// Supabase or adding a database runtime to the application dependencies.
const runtimePath = process.env.PGLITE_MODULE_PATH;
const sql = fs.readFileSync(path.resolve(__dirname, "../supabase/folder_access_policies.sql"), "utf8");
const policyId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";

async function database() {
  const { PGlite } = require(runtimePath);
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.user_r2_folder_locks (
      id uuid primary key,
      team_id uuid not null,
      bucket_id uuid not null,
      prefix text not null,
      enabled boolean not null default true,
      passcode_salt text not null,
      passcode_hash text not null
    );
    create table public.user_r2_favorites (id uuid);
    create table public.user_r2_recycle_bin (id uuid);
    create table public.user_r2_shares (id uuid);
    create table public.user_r2_audit_logs (id uuid);
    insert into public.user_r2_folder_locks values (
      '${policyId}', '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001', 'private/', true,
      'existing-salt', 'existing-password-hash'
    );
  `);
  return db;
}

test("migration reproduces the original syntax failure, then runs and reruns successfully", { skip: !runtimePath }, async () => {
  const db = await database();
  try {
    const broken = sql.replace("(case when counter.subject = '*' then 100 else 10 end)", "case when counter.subject = '*' then 100 else 10 end");
    assert.notEqual(broken, sql);
    await assert.rejects(() => db.exec(broken), { code: "42601" });
    await db.exec("rollback;");
    await db.exec(sql);
    await db.exec(sql);
    const result = await db.query("select passcode_salt, passcode_hash, access_policy from public.user_r2_folder_locks");
    assert.deepEqual(result.rows, [{ passcode_salt: "existing-salt", passcode_hash: "existing-password-hash", access_policy: null }]);
  } finally { await db.close(); }
});

test("rate limit functions execute with per-user, per-folder and window reset behavior", { skip: !runtimePath }, async () => {
  const db = await database();
  try {
    await db.exec(sql);
    const consume = async (user = userId) => (await db.query(
      "select public.consume_folder_unlock_attempt($1::uuid, $2::uuid) as result", [policyId, user],
    )).rows[0].result;
    for (let i = 0; i < 10; i++) assert.equal((await consume()).allowed, true);
    const blocked = await consume();
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 300);
    await db.exec("update public.folder_unlock_attempts set started_at = now() - interval '6 minutes';");
    assert.equal((await consume()).allowed, true);
    await db.exec("update public.folder_unlock_attempts set attempts = 100 where subject = '*';");
    assert.equal((await consume("20000000-0000-4000-8000-000000000002")).allowed, false);
    await db.exec("set role authenticated;");
    await assert.rejects(() => consume(), { code: "42501" });
    await db.exec("reset role;");
  } finally { await db.close(); }
});

test("policy trigger accepts members-only policies and rejects nesting and missing passwords", { skip: !runtimePath }, async () => {
  const db = await database();
  try {
    await db.exec(sql);
    const policy = { mode: "members", allowedUserIds: [userId], allowedRoles: [], deniedUserIds: [], hideUnauthorized: true, version: "v1" };
    await db.query("update public.user_r2_folder_locks set access_policy = $1::jsonb, passcode_salt = null, passcode_hash = null where id = $2::uuid", [JSON.stringify(policy), policyId]);
    await assert.rejects(() => db.query("update public.user_r2_folder_locks set access_policy = $1::jsonb", [JSON.stringify({ ...policy, mode: "members_password" })]), /请设置访问密码/);
    await assert.rejects(() => db.exec(`insert into public.user_r2_folder_locks (id, team_id, bucket_id, prefix, passcode_salt, passcode_hash)
      select '10000000-0000-4000-8000-000000000002', team_id, bucket_id, 'private/child/', 'salt', 'hash' from public.user_r2_folder_locks;`), /暂不支持嵌套保护文件夹/);
  } finally { await db.close(); }
});
