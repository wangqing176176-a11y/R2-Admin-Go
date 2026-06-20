import { NextRequest, NextResponse } from "next/server";
import { getEnvString, requireEnvString } from "@/lib/env";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

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

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

const isUserExistsByEmail = async (url: string, serviceRoleKey: string, email: string) => {
  let page = 1;
  while (page <= 20) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=500`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    const data = await readJsonSafe(res);
    if (!res.ok) throw new Error(pickSupabaseError(data, "读取用户列表失败"));

    const users = Array.isArray(data.users) ? data.users : [];
    if (
      users.some((u) => normalizeEmail((u as { email?: unknown }).email) === email)
    ) {
      return true;
    }
    if (users.length < 500) return false;
    page += 1;
  }
  return false;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "设置登录密码至少六个字符" }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    const serviceRoleKey = getServiceRoleKey();

    if (!serviceRoleKey) {
      return NextResponse.json({ error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置" }, { status: 500 });
    }

    const exists = await isUserExistsByEmail(url, serviceRoleKey, email);
    if (exists) {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    }

    const signupRes = await fetch(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const signupData = await readJsonSafe(signupRes);
    if (!signupRes.ok) {
      return NextResponse.json(
        { error: pickSupabaseError(signupData, "发送注册验证码失败，请重试。") },
        { status: signupRes.status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = toChineseErrorMessage(error, "发送注册验证码失败，请重试。");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

