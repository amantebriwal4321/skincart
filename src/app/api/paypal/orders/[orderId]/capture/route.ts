import { getCheckoutService, toErrorResponse } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ orderId: string }> };

export async function POST(req: Request, context: Context) {
  try {
    const { orderId } = await context.params;
    const body = await req.json().catch(() => null);
    const result = await getCheckoutService().capture(orderId, body);
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
