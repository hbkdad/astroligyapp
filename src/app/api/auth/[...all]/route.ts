import { createProductionBetterAuthHttpHandler } from "@/server/better-auth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createProductionBetterAuthHttpHandler();

export const GET = handler;
export const POST = handler;
export const HEAD = handler;
export const OPTIONS = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
