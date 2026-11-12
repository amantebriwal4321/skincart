import { GET as getConfig } from "@/app/api/paypal/config/route";
import { POST as captureOrder } from "@/app/api/paypal/orders/[orderId]/capture/route";
import { POST as createOrder } from "@/app/api/paypal/orders/route";
import { POST as quoteCart } from "@/app/api/paypal/quote/route";
import { formatUsdFromCents, inrToUsdCents, parseUsdToCents, PAYPAL_SANDBOX_ORIGIN, quoteProductIds, resetCheckoutService, toErrorResponse } from "@/lib/paypal";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "SUPER_SECRET_VALUE";
const CLIENT = "AbC123client";
const KEY = "123e4567-e89b-42d3-a456-426614174000";

type RemoteOrder = {
  id: string;
  status: string;
  purchase_units: Array<Record<string, unknown> & { payments?: { captures?: Array<Record<string, unknown>> } }>;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function installMock(options?: { declineCapture?: boolean }) {
  const orders = new Map<string, RemoteOrder>();
  let seq = 0;
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(`${PAYPAL_SANDBOX_ORIGIN}/`)) throw new Error(`blocked non-sandbox call ${url}`);
    if (url === `${PAYPAL_SANDBOX_ORIGIN}/v1/oauth2/token`) {
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toBe("grant_type=client_credentials");
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      expect(authorization.startsWith("Basic ")).toBe(true);
      return jsonResponse({ access_token: "tok_test_value", expires_in: 3600 });
    }
    if (url === `${PAYPAL_SANDBOX_ORIGIN}/v2/checkout/orders` && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const id = `ORDER${String(++seq).padStart(10, "0")}`;
      const order: RemoteOrder = { id, status: "CREATED", purchase_units: body.purchase_units };
      orders.set(id, order);
      return jsonResponse(order, 201);
    }
    const capture = url.match(/\/v2\/checkout\/orders\/([A-Z0-9]+)\/capture$/);
    if (capture && init?.method === "POST") {
      if (options?.declineCapture) {
        return jsonResponse({
          name: "UNPROCESSABLE_ENTITY",
          debug_id: "dbg123",
          details: [{ issue: "INSTRUMENT_DECLINED", description: "The instrument was declined." }],
        }, 422);
      }
      const order = orders.get(capture[1]);
      if (!order) return jsonResponse({ message: "missing" }, 404);
      const amount = order.purchase_units[0].amount as { currency_code: string; value: string };
      order.status = "COMPLETED";
      order.purchase_units[0].payments = { captures: [{ id: "CAPTURE123456789", status: "COMPLETED", amount }] };
      return jsonResponse(order, 201);
    }
    const get = url.match(/\/v2\/checkout\/orders\/([A-Z0-9]+)$/);
    if (get && (!init?.method || init.method === "GET")) {
      const order = orders.get(get[1]);
      return order ? jsonResponse(order) : jsonResponse({ message: "missing" }, 404);
    }
    throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { orders, fetchMock };
}

function postJson(url: string, body: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function read(res: Response) {
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = CLIENT;
  process.env.PAYPAL_CLIENT_SECRET = SECRET;
  resetCheckoutService();
});

afterEach(() => {
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  resetCheckoutService();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("catalog settlement", () => {
  it("converts 399 INR to 4.81 USD at the fixed 83 INR rate", () => {
    expect(inrToUsdCents(399)).toBe(481);
    expect(formatUsdFromCents(481)).toBe("4.81");
    expect(parseUsdToCents("4.81")).toBe(481);
    expect(parseUsdToCents("4.8100")).toBe(481);
    expect(parseUsdToCents("4.811")).toBeNull();
    expect(parseUsdToCents("4.81 ")).toBeNull();
  });

  it("prices only catalog ids and ignores nothing it was not given", () => {
    const quote = quoteProductIds(["c1", "p1"]);
    expect(quote.totalInr).toBe(399 + 599);
    expect(quote.paypalCurrency).toBe("USD");
    expect(quote.items.map((item) => item.unitUsd)).toEqual(["4.81", formatUsdFromCents(inrToUsdCents(599))]);
    expect(quote.totalUsdCents).toBe(quote.items.reduce((sum, item) => sum + item.unitUsdCents, 0));
  });
});

describe("PayPal sandbox routes with a mocked PayPal API", () => {
  it("quotes a cart without calling PayPal", async () => {
    const { fetchMock } = installMock();
    const res = await read(await quoteCart(postJson("http://localhost/api/paypal/quote", { productIds: ["c1"] })));
    expect(res.status).toBe(200);
    expect(res.body.totalInr).toBe(399);
    expect(res.body.totalUsd).toBe("4.81");
    expect(res.body.paypalCurrency).toBe("USD");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it("rejects a client price instead of charging it", async () => {
    const { fetchMock } = installMock();
    const res = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      amount: "0.01",
      expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UNKNOWN_FIELD");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a reviewed total that does not match the catalog", async () => {
    const { fetchMock } = installMock();
    const res = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "0.01", currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("AMOUNT_MISMATCH");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-USD checkout currency", async () => {
    const { fetchMock } = installMock();
    const res = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "4.81", currency: "INR" },
    }, { "Idempotency-Key": KEY })));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CURRENCY_MISMATCH");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call PayPal when sandbox credentials are missing", async () => {
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    resetCheckoutService();
    const { fetchMock } = installMock();
    const created = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    expect(created.status).toBe(503);
    expect(created.body.code).toBe("PAYPAL_NOT_CONFIGURED");
    expect(created.body.error).toContain("PAYPAL_CLIENT_ID");
    expect(created.body.error).toContain("PAYPAL_CLIENT_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();

    const config = await read(await getConfig());
    expect(config.body.credentialsPresent).toBe(false);
    expect(config.body.clientId).toBeNull();
    expect(config.body.requiredEnv).toEqual(["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]);
    expect(JSON.stringify(config.body)).not.toContain(SECRET);
  });

  it("creates a sandbox order for the server total and reuses the idempotency key", async () => {
    const { fetchMock } = installMock();
    const payload = { productIds: ["c1"], expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" } };
    const first = await read(await createOrder(postJson("http://localhost/api/paypal/orders", payload, { "Idempotency-Key": KEY })));
    const second = await read(await createOrder(postJson("http://localhost/api/paypal/orders", payload, { "Idempotency-Key": KEY })));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(first.body.totalUsd).toBe("4.81");
    expect(first.body.currency).toBe("USD");

    const creates = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/v2/checkout/orders") && call[1]?.method === "POST");
    expect(creates).toHaveLength(1);
    const outbound = JSON.parse(String(creates[0][1]?.body));
    const unit = outbound.purchase_units[0];
    expect(outbound.intent).toBe("CAPTURE");
    expect(unit.amount).toMatchObject({ currency_code: "USD", value: "4.81" });
    expect(unit.amount.breakdown.item_total).toMatchObject({ currency_code: "USD", value: "4.81" });
    expect(unit.items[0]).toMatchObject({ sku: "c1", quantity: "1", unit_amount: { currency_code: "USD", value: "4.81" } });
    expect(new Headers(creates[0][1]?.headers).get("paypal-request-id")).toBe(KEY);
    expect(String(creates[0][0])).toBe(`${PAYPAL_SANDBOX_ORIGIN}/v2/checkout/orders`);
    expect(JSON.stringify(first.body)).not.toContain(SECRET);
    expect(JSON.stringify(first.body)).not.toContain("tok_test_value");
    for (const call of fetchMock.mock.calls) {
      if (String(call[0]).endsWith("/v1/oauth2/token")) continue;
      expect(JSON.stringify(call[1]?.headers ?? {})).not.toContain(SECRET);
      expect(String(call[1]?.body ?? "")).not.toContain(SECRET);
    }
  });

  it("rejects reuse of an idempotency key for a different cart", async () => {
    installMock();
    const first = await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" },
    }, { "Idempotency-Key": KEY }));
    expect(first.status).toBe(201);
    const second = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["p1"],
      expected: { totalInr: 599, totalUsd: formatUsdFromCents(inrToUsdCents(599)), currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("does not capture an order the buyer has not approved", async () => {
    const { fetchMock } = installMock();
    const created = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    const captured = await read(await captureOrder(postJson("http://localhost/api/paypal/orders/x/capture", null), { params: Promise.resolve({ orderId: created.body.id }) }));
    expect(captured.status).toBe(409);
    expect(captured.body.code).toBe("NOT_APPROVED");
    expect(captured.body.error).toMatch(/Nothing was captured/);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/capture"))).toBe(false);
  });

  it("refuses to capture when PayPal's amount, currency, or cart id does not match", async () => {
    const { orders, fetchMock } = installMock();
    const created = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    const remote = orders.get(created.body.id)!;
    remote.status = "APPROVED";
    (remote.purchase_units[0].amount as { value: string }).value = "1.00";
    const mismatch = await read(await captureOrder(new Request("http://localhost/capture", { method: "POST" }), { params: Promise.resolve({ orderId: created.body.id }) }));
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.code).toBe("AMOUNT_MISMATCH");

    (remote.purchase_units[0].amount as { value: string }).value = "4.81";
    (remote.purchase_units[0].amount as { currency_code: string }).currency_code = "EUR";
    const currency = await read(await captureOrder(new Request("http://localhost/capture", { method: "POST" }), { params: Promise.resolve({ orderId: created.body.id }) }));
    expect(currency.status).toBe(409);
    expect(currency.body.code).toBe("AMOUNT_MISMATCH");

    (remote.purchase_units[0].amount as { currency_code: string }).currency_code = "USD";
    remote.purchase_units[0].custom_id = "someone-elses-cart";
    const cart = await read(await captureOrder(new Request("http://localhost/capture", { method: "POST" }), { params: Promise.resolve({ orderId: created.body.id }) }));
    expect(cart.status).toBe(409);
    expect(cart.body.code).toBe("CART_MISMATCH");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/capture"))).toBe(false);
  });

  it("captures only an approved sandbox order and does not capture it twice", async () => {
    const { orders, fetchMock } = installMock();
    const created = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    orders.get(created.body.id)!.status = "APPROVED";
    const first = await read(await captureOrder(new Request("http://localhost/capture", { method: "POST" }), { params: Promise.resolve({ orderId: created.body.id }) }));
    const second = await read(await captureOrder(new Request("http://localhost/capture", { method: "POST" }), { params: Promise.resolve({ orderId: created.body.id }) }));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: "COMPLETED", captureStatus: "COMPLETED", currency: "USD", value: "4.81", captureId: "CAPTURE123456789" });
    expect(second.status).toBe(200);
    expect(second.body.captureId).toBe(first.body.captureId);
    const captureCalls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/capture"));
    expect(captureCalls).toHaveLength(1);
    expect(new Headers(captureCalls[0][1]?.headers).get("paypal-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(first.body)).not.toContain(SECRET);
  });

  it("passes INSTRUMENT_DECLINED through for a buyer retry and never captures an unknown order", async () => {
    const { orders } = installMock({ declineCapture: true });
    const created = await read(await createOrder(postJson("http://localhost/api/paypal/orders", {
      productIds: ["c1"],
      expected: { totalInr: 399, totalUsd: "4.81", currency: "USD" },
    }, { "Idempotency-Key": KEY })));
    orders.get(created.body.id)!.status = "APPROVED";
    const declined = await read(await captureOrder(new Request("http://localhost/capture", { method: "POST" }), { params: Promise.resolve({ orderId: created.body.id }) }));
    expect(declined.status).toBe(422);
    expect(declined.body.code).toBe("INSTRUMENT_DECLINED");

    const unknown = await read(await captureOrder(new Request("http://localhost/capture", { method: "POST" }), { params: Promise.resolve({ orderId: "UNKNOWNORDER1" }) }));
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("UNKNOWN_ORDER");

    const invalid = await read(await captureOrder(postJson("http://localhost/capture", { value: "0.01" }), { params: Promise.resolve({ orderId: created.body.id }) }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("UNKNOWN_FIELD");
  });

  it("still maps a checkout error when route bundles duplicate the class", async () => {
    const foreign = Object.assign(new Error("PayPal sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. No order was created."), {
      name: "CheckoutError",
      status: 503,
      code: "PAYPAL_NOT_CONFIGURED",
    });
    const res = toErrorResponse(foreign);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "PAYPAL_NOT_CONFIGURED" });
  });

  it("hides the client id until both sandbox secrets are present and never returns the secret", async () => {
    const config = await read(await getConfig());
    expect(config.body.credentialsPresent).toBe(true);
    expect(config.body.clientId).toBe(CLIENT);
    expect(config.body.apiBase).toBe(PAYPAL_SANDBOX_ORIGIN);
    expect(JSON.stringify(config.body)).not.toContain(SECRET);
    expect(config.body.message).toMatch(/No payment is captured/);
  });
});
