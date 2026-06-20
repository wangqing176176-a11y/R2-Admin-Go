import { NextRequest, NextResponse } from "next/server";
import { getAppAccessContextFromRequest } from "@/lib/access-control";
import { clearAuditLogs, listAuditLogs } from "@/lib/audit-logs";
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
    const actions = searchParams.getAll("action").map((value) => value.trim()).filter(Boolean);
    const actors = searchParams.getAll("actor").map((value) => value.trim()).filter(Boolean);
    const logs = await listAuditLogs(ctx, {
      bucketId: searchParams.get("bucket") ?? undefined,
      actions,
      itemType: searchParams.get("itemType") ?? undefined,
      actors,
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

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAppAccessContextFromRequest(req);
    const body = await req.json().catch(() => null) as { ids?: unknown } | null;
    if (body && Object.prototype.hasOwnProperty.call(body, "ids") && (!Array.isArray(body.ids) || body.ids.length === 0)) {
      const err = new Error("请选择需要清除的操作记录") as Error & { status?: number };
      err.status = 400;
      throw err;
    }
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    await clearAuditLogs(ctx, ids);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: toChineseErrorMessage(error, "清除操作记录失败") }, { status: toStatus(error) });
  }
}
