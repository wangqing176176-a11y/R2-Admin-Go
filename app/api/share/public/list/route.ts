import { NextRequest, NextResponse } from "next/server";
import { getPublicShareRow, ensurePublicShareReady, normalizeShareFolderPath, resolvePublicShareCredentials } from "@/lib/shares";
import { readShareAccessToken } from "@/lib/share-token";
import { createR2Bucket } from "@/lib/r2-s3";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const json = (status: number, obj: unknown) => NextResponse.json(obj, { status });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") ?? "").trim();
    const accessToken = String(searchParams.get("token") ?? "").trim();
    const cursor = searchParams.get("cursor") ?? undefined;
    const subPath = String(searchParams.get("path") ?? "");

    if (!code) return json(400, { error: "缺少分享码" });
    if (!accessToken) return json(401, { error: "访问凭证已失效，请重新输入提取码。" });

    const row = await getPublicShareRow(code);
    if (!row) return json(404, { error: "分享不存在或已失效" });

    const meta = ensurePublicShareReady(row);
    if (meta.itemType !== "folder") return json(400, { error: "该分享不是文件夹类型" });

    await readShareAccessToken(accessToken, row.id, row.share_code);

    const relativePath = normalizeShareFolderPath(subPath);
    const prefix = `${meta.itemKey}${relativePath}`;

    const creds = await resolvePublicShareCredentials(row);
    const bucket = createR2Bucket(creds);

    const listed = await bucket.list({
      prefix,
      delimiter: "/",
      cursor,
      limit: 1000,
    });

    const folders = (listed.delimitedPrefixes ?? []).map((p: string) => ({
      type: "folder" as const,
      name: p.replace(prefix, "").replace(/\/$/, ""),
      key: p,
      path: `${relativePath}${p.replace(prefix, "")}`,
    }));

    const files = (listed.objects ?? [])
      .filter((o) => !(String(o.key).endsWith("/") && Number(o.size ?? 0) === 0))
      .map((o) => ({
        type: "file" as const,
        name: String(o.key).replace(prefix, ""),
        key: String(o.key),
        size: o.size,
        lastModified: o.uploaded,
      }));

    return json(200, {
      meta,
      path: relativePath,
      items: [...folders, ...files],
      cursor: listed.truncated ? listed.cursor ?? null : null,
    });
  } catch (error: unknown) {
    const msg = toChineseErrorMessage(error, "读取分享目录失败，请稍后重试。");
    return json(400, { error: msg || "读取分享目录失败" });
  }
}
