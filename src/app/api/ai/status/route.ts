import { createAiStatusHandler } from "@/server/api-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createAiStatusHandler();

