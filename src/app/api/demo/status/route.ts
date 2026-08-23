import { errorResponse } from "@/server/api-error";
import { getActiveDemoSession, toDemoStatus } from "@/server/demo-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getActiveDemoSession(request);
    return Response.json(session ? toDemoStatus(session) : { active: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "demo.status");
  }
}
