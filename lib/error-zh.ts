const containsChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);

export const toChineseErrorMessage = (error: unknown, fallback = "操作失败，请重试。") => {
  const raw = String(error instanceof Error ? error.message : error ?? "").trim();
  if (!raw) return fallback;
  if (containsChinese(raw)) return raw;

  const lower = raw.toLowerCase();

  if (lower.includes("invalid login credentials")) return "账号或密码错误，请重试。";
  if (lower.includes("email not confirmed")) return "邮箱尚未验证，请先前往邮箱完成验证。";
  if (
    lower.includes("user already registered") ||
    lower.includes("email address already in use") ||
    lower.includes("already been registered")
  ) {
    return "该邮箱已注册，请直接登录。";
  }
  if (lower.includes("relation") && lower.includes("does not exist")) {
    return "数据库缺少 RBAC 相关表，请在 Supabase SQL Editor 执行 app_rbac.sql。";
  }
  if (lower.includes("invalid api key") || lower.includes("apikey is invalid")) {
    return "SUPABASE_SERVICE_ROLE_KEY 配置错误，请检查服务端环境变量。";
  }
  if (lower.includes("not_admin") || lower.includes("user not allowed")) {
    return "服务端管理权限不足，请检查 SUPABASE_SERVICE_ROLE_KEY 是否为 service_role。";
  }
  if (lower.includes("permission denied")) {
    return "数据库权限不足，请检查 Supabase 权限或 SQL 初始化是否完整。";
  }
  if (lower.includes("unauthorized")) return "登录状态已失效，请重新登录。";
  if (lower.includes("missing params")) return "请求参数不完整，请刷新后重试。";
  if (lower.includes("bucket required")) return "缺少存储桶参数。";
  if (lower.includes("bucket id required")) return "缺少存储桶 ID。";
  if (lower.includes("bucket not found")) return "未找到存储桶，请刷新后重试。";
  if (lower.includes("source not found")) return "源文件不存在或已被删除。";
  if (lower.includes("unknown bucket binding") || lower.includes("bucket binding not configured")) {
    return "存储桶绑定未配置或不可用，请检查配置。";
  }
  if (lower.includes("token expired")) return "操作令牌已过期，请重试。";
  if (lower.includes("invalid token")) return "操作令牌无效，请重试。";
  if (lower.includes("missing environment variable")) return "服务端缺少必要环境变量，请联系管理员。";
  if (
    lower.includes("decryption failed") ||
    lower.includes("ciphertext authentication failure") ||
    lower.includes("bad padding") ||
    lower.includes("aes-gcm")
  ) {
    return "密钥解密失败：请检查 CREDENTIALS_ENCRYPTION_KEY 是否与历史配置一致。";
  }
  if (lower.includes("failed to load buckets")) return "读取存储桶列表失败，请稍后重试。";
  if (lower.includes("failed to load bucket")) return "读取存储桶信息失败，请稍后重试。";
  if (lower.includes("failed to create bucket")) return "新增存储桶失败，请检查配置后重试。";
  if (lower.includes("failed to update bucket")) return "更新存储桶失败，请稍后重试。";
  if (lower.includes("failed to delete bucket")) return "删除存储桶失败，请稍后重试。";
  if (lower.includes("failed to check existing bucket")) return "校验存储桶是否存在时失败，请稍后重试。";
  if (lower.includes("failed to set default bucket")) return "设置默认存储桶失败，请稍后重试。";
  if (lower.includes("duplicate key value violates unique constraint")) {
    if (lower.includes("app_team_members_user_unique")) {
      return "该账号已加入其他团队，当前系统一个账号仅能属于一个团队。";
    }
    if (lower.includes("app_member_permissions_unique")) {
      return "权限记录冲突，请刷新团队管理后重试。";
    }
    return "该账号下已存在同名存储桶（同 Account ID + 桶名），请修改后重试。";
  }
  if (lower.includes("failed to fetch")) return "网络请求失败，请检查网络后重试。";

  return fallback;
};
