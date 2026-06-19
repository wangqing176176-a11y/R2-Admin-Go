import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest } from "@/lib/access-control";
import { listAuditLogs } from "@/lib/audit-logs";
import { toChineseErrorMessage } from "@/lib/error-zh";

export const runtime = "edge";

const toStatus = (error: unknown) => {
  const status = Number((error as { status?: unknown })?.status ?? NaN);
  return Number.isFinite(status) && status >= 100 ? status : 500;
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const { searchParams } = new URL(req.url);
    const logs = await listAuditLogs(ctx, {
      bucketId: searchParams.get("bucket") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      itemType: searchParams.get("itemType") ?? undefined,
      actor: searchParams.get("actor") ?? undefined,
      keyword: searchParams.get("keyword") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      objectKey: searchParams.get("objectKey") ?? undefined,
      limit: Number(searchParams.get("limit") ?? 200),
    });
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "读取操作记录失败") }, { status: toStatus(error) });
  }
}
