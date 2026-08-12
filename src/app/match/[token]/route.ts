import { createPublicCompatibilityShareHandler } from "@/server/public-compatibility-share-route";

export const runtime = "nodejs";
export const GET = createPublicCompatibilityShareHandler();
