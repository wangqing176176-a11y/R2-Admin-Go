import { NextRequest, NextResponse } from "next/server";
import { getEnvString, requireEnvString } from "@/lib/env";
import { requireSupabaseUser } from "@/lib/supabase";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

const toMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
  return msg || fallback;
};

const getSupabaseUrl = () => requireEnvString("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");

const getSupabaseAnonKey = () =>
  requireEnvString(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  );

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSupabaseUser(req);
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
        Authorization: `Bearer ${auth.token}`,
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
    const auth = await requireSupabaseUser(req);
    const serviceRoleKey = getEnvString("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置" }, { status: 500 });
    }

    const url = getSupabaseUrl();
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(auth.user.id)}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
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

