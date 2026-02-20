import { NextRequest, NextResponse } from "next/server";
import { getEnvString, requireEnvString } from "@/lib/env";
import { getAppAccessContextFromRequest, requirePermission } from "@/lib/access-control";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => toChineseErrorMessage(error, "账号操作失败，请稍后重试。");

const readJsonSafe = async (res: Response): Promise<Record<string, unknown>> => {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
};

const pickSupabaseError = (obj: Record<string, unknown>, fallback: string) => {
  const msg = String(obj.msg ?? obj.error_description ?? obj.error ?? obj.message ?? "").trim();
  return toChineseErrorMessage(msg || fallback, fallback);
};

const getSupabaseUrl = () => requireEnvString("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");

const getSupabaseAnonKey = () =>
  requireEnvString(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  );

const getServiceRoleKey = () => getEnvString("SUPABASE_SERVICE_ROLE_KEY");

const adminHeaders = (serviceRoleKey: string, withJson = false) => {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
};

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "account.self.manage", "你没有修改账号信息的权限");

    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    const password = String(body.password ?? "").trim();
    if (password.length < 6) {
      return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    const res = await fetch(`${url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${ctx.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      return NextResponse.json({ error: pickSupabaseError(data, "修改密码失败") }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    requirePermission(ctx, "account.self.delete", "你没有注销账号的权限");

    const serviceRoleKey = getServiceRoleKey();
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置" }, { status: 500 });
    }

    const url = getSupabaseUrl();
    const encodedUserId = encodeURIComponent(ctx.user.id);

    const cleanupTargets = [
      `${url}/rest/v1/user_r2_shares?user_id=eq.${encodedUserId}`,
      `${url}/rest/v1/user_r2_buckets?user_id=eq.${encodedUserId}`,
      `${url}/rest/v1/app_member_permissions?user_id=eq.${encodedUserId}`,
      `${url}/rest/v1/app_permission_requests?user_id=eq.${encodedUserId}`,
      `${url}/rest/v1/app_team_members?user_id=eq.${encodedUserId}`,
      `${url}/rest/v1/app_user_profiles?user_id=eq.${encodedUserId}`,
    ];
    for (const target of cleanupTargets) {
      try {
        await fetch(target, {
          method: "DELETE",
          headers: {
            ...adminHeaders(serviceRoleKey),
            Prefer: "return=minimal",
          },
        });
      } catch {
        // Best effort only.
      }
    }

    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(ctx.user.id)}`, {
      method: "DELETE",
      headers: adminHeaders(serviceRoleKey),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      return NextResponse.json({ error: pickSupabaseError(data, "注销账号失败") }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toMessage(error) }, { status: toStatus(error) });
  }
}
