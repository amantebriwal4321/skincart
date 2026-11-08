import { publicPayPalConfig } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(publicPayPalConfig(), { headers: { "Cache-Control": "no-store" } });
}
