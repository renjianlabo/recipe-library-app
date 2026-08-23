import { NextResponse } from "next/server";

import { errorResponse } from "@/server/api-error";
import { demoCookieOptions, DEMO_COOKIE_NAME, startDemoSession } from "@/server/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { sessionId, status } = await startDemoSession(request);
    const response = NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(DEMO_COOKIE_NAME, sessionId, demoCookieOptions());
    return response;
  } catch (error) {
    return errorResponse(error, "demo.start");
  }
}
