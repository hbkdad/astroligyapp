import { getSystemHealth } from "@/application/system-health";

export function GET() {
  return Response.json(getSystemHealth(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
