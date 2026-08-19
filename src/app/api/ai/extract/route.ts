import { createExtractHandler } from "@/server/api-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = createExtractHandler();
