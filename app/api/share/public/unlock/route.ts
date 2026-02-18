import { NextRequest, NextResponse } from "next/server";
import { getPublicShareRow, ensurePublicShareReady, verifySharePasscode } from "@/lib/shares";
import { issueShareAccessToken } from "@/lib/share-token";
import { toChineseErrorMessage } from "@/lib/error-zh";
import { validatePasscode } from "@/lib/share-security";

export const runtime = "edge";

const PASSCODE_MAX_FAILURES = 3;
const PASSCODE_LOCK_MS = 3 * 60 * 60 * 1000;
const PASSCODE_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

type PasscodeAttemptState = {
  failures: number;
  lockedUntil?: number;
  updatedAt: number;
};

const passcodeAttempts = new Map<string, PasscodeAttemptState>();

const json = (status: number, obj: unknown, headers?: HeadersInit) => NextResponse.json(obj, { status, headers });

const getClientIp = (req: NextRequest) => {
  const forwarding = req.headers.get("x-forwarded-for");
  if (forwarding) {
    const first = forwarding.split(",")[0]?.trim();
    if (first) return first;
  }
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  const ua = req.headers.get("user-agent")?.trim();
  return ua ? `ua:${ua.slice(0, 120)}` : "unknown";
};

const getAttemptKey = (shareCode: string, clientIp: string) => `${shareCode}::${clientIp}`;

const getRemainingAttempts = (failures: number) => Math.max(0, PASSCODE_MAX_FAILURES - failures);

const prunePasscodeAttempts = (now: number) => {
  for (const [key, state] of passcodeAttempts.entries()) {
    if (state.lockedUntil && state.lockedUntil <= now) {
      passcodeAttempts.delete(key);
      continue;
    }
    if (now - state.updatedAt > PASSCODE_ATTEMPT_TTL_MS) {
      passcodeAttempts.delete(key);
    }
  }
};

const lockedResponse = (lockedUntilMs: number) => {
  const retryAfterSec = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1000));
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return json(
    429,
    {
      error: `提取码错误次数过多，已锁定，请 ${retryAfterMinutes} 分钟后重试。`,
      remainingAttempts: 0,
      lockUntil: new Date(lockedUntilMs).toISOString(),
      retryAfterSec,
    },
    { "Retry-After": String(retryAfterSec) },
  );
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { code?: string; passcode?: string };
    const code = String(body.code ?? "").trim();
    if (!code) return json(400, { error: "缺少分享码" });

    const row = await getPublicShareRow(code);
    if (!row) return json(404, { error: "分享不存在或已失效" });

    const meta = ensurePublicShareReady(row);

    if (meta.passcodeEnabled) {
      const now = Date.now();
      prunePasscodeAttempts(now);

      const attemptKey = getAttemptKey(row.share_code, getClientIp(req));
      const current = passcodeAttempts.get(attemptKey);
      const currentFailures = current?.failures ?? 0;
      const lockedUntil = current?.lockedUntil ?? 0;

      if (lockedUntil > now) return lockedResponse(lockedUntil);

      const formatCheck = validatePasscode(String(body.passcode ?? ""));
      if (!formatCheck.ok) {
        return json(400, {
          error: formatCheck.message,
          remainingAttempts: getRemainingAttempts(currentFailures),
        });
      }

      const ok = await verifySharePasscode(row, formatCheck.passcode);
      if (!ok) {
        const failures = currentFailures + 1;
        if (failures >= PASSCODE_MAX_FAILURES) {
          const nextLockedUntil = now + PASSCODE_LOCK_MS;
          passcodeAttempts.set(attemptKey, {
            failures: PASSCODE_MAX_FAILURES,
            lockedUntil: nextLockedUntil,
            updatedAt: now,
          });
          return lockedResponse(nextLockedUntil);
        }

        passcodeAttempts.set(attemptKey, { failures, updatedAt: now });
        return json(400, {
          error: `提取码错误，请重试。还可尝试 ${getRemainingAttempts(failures)} 次。`,
          remainingAttempts: getRemainingAttempts(failures),
        });
      }

      passcodeAttempts.delete(attemptKey);
    }

    const accessToken = await issueShareAccessToken(
      {
        shareId: row.id,
        shareCode: row.share_code,
      },
      12 * 3600,
    );

    return json(200, {
      accessToken,
      expiresIn: 12 * 3600,
      meta,
    });
  } catch (error: unknown) {
    const msg = toChineseErrorMessage(error, "校验提取码失败，请稍后重试。");
    return json(400, { error: msg || "校验提取码失败" });
  }
}
