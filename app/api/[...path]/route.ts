import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import * as account from "@/lib/api-routes/account/route";
import * as auditLogs from "@/lib/api-routes/audit-logs/route";
import * as registerCode from "@/lib/api-routes/auth/register-code/route";
import * as bucketCheck from "@/lib/api-routes/bucket-check/route";
import * as buckets from "@/lib/api-routes/buckets/route";
import * as download from "@/lib/api-routes/download/route";
import * as favorites from "@/lib/api-routes/favorites/route";
import * as files from "@/lib/api-routes/files/route";
import * as folderLocks from "@/lib/api-routes/folder-locks/route";
import * as me from "@/lib/api-routes/me/route";
import * as messages from "@/lib/api-routes/messages/route";
import * as multipart from "@/lib/api-routes/multipart/route";
import * as object from "@/lib/api-routes/object/route";
import * as operate from "@/lib/api-routes/operate/route";
import * as platformSummary from "@/lib/api-routes/platform/summary/route";
import * as recycle from "@/lib/api-routes/recycle/route";
import * as search from "@/lib/api-routes/search/route";
import * as publicShareDownload from "@/lib/api-routes/share/public/download/route";
import * as publicShareList from "@/lib/api-routes/share/public/list/route";
import * as publicShareMeta from "@/lib/api-routes/share/public/meta/route";
import * as publicShareUnlock from "@/lib/api-routes/share/public/unlock/route";
import * as shareById from "@/lib/api-routes/shares/[id]/route";
import * as shares from "@/lib/api-routes/shares/route";
import * as teamMembers from "@/lib/api-routes/team/members/route";
import * as teamPermissions from "@/lib/api-routes/team/permissions/route";
import * as teamRequests from "@/lib/api-routes/team/requests/route";
import * as teamSettings from "@/lib/api-routes/team/settings/route";
import * as usage from "@/lib/api-routes/usage/route";

export const runtime = "edge";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];
type RouteModule = Partial<Record<Method, (request: NextRequest, context: unknown) => Promise<Response>>>;

const routes: Record<string, RouteModule> = {
  account,
  "audit-logs": auditLogs,
  "auth/register-code": registerCode,
  "bucket-check": bucketCheck,
  buckets,
  download,
  favorites,
  files,
  "folder-locks": folderLocks,
  me,
  messages,
  multipart,
  object,
  operate,
  "platform/summary": platformSummary,
  recycle,
  search,
  "share/public/download": publicShareDownload,
  "share/public/list": publicShareList,
  "share/public/meta": publicShareMeta,
  "share/public/unlock": publicShareUnlock,
  shares,
  "team/members": teamMembers,
  "team/permissions": teamPermissions,
  "team/requests": teamRequests,
  "team/settings": teamSettings,
  usage,
};

type Context = { params: Promise<{ path: string[] }> };

async function dispatch(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const routePath = path.join("/");
  const method = request.method.toUpperCase() as Method;

  if (path.length === 2 && path[0] === "shares") {
    if (method !== "PATCH") {
      return NextResponse.json(
        { error: "Method Not Allowed" },
        { status: 405, headers: { Allow: "PATCH" } },
      );
    }
    return shareById.PATCH(request, { params: Promise.resolve({ id: path[1] }) });
  }

  const route = routes[routePath];
  if (!route) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  const handler = route[method];
  if (!handler) {
    const allow = METHODS.filter((key) => route[key]).join(", ");
    return NextResponse.json(
      { error: "Method Not Allowed" },
      { status: 405, headers: { Allow: allow } },
    );
  }
  return handler(request, context);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
