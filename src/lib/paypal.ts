// PayPal Orders v2 sandbox client and cart quoting.
// Docs: https://developer.paypal.com/docs/checkout/standard/integrate/
//       https://developer.paypal.com/api/orders/v2/orders-create
//       https://developer.paypal.com/api/orders/v2/orders-capture
//       https://developer.paypal.com/api/rest/reference/currency-codes/
//       https://developer.paypal.com/api/rest/reference/idempotency/
//
// The catalog is priced in whole INR rupees. PayPal's REST currency list does
// not include INR, so sandbox orders are created in USD at a fixed disclosed
// rate. The browser never supplies the amount that is charged.

import { createHash, randomUUID } from "crypto";
import { CATALOG } from "./catalog";

export const PAYPAL_SANDBOX_ORIGIN = "https://api-m.sandbox.paypal.com";
export const CART_CURRENCY = "INR";
export const PAYPAL_CURRENCY = "USD";
/** Fixed hackathon settlement rate. Not a market quote and not PayPal's FX. */
export const SANDBOX_INR_PER_USD = 83;

const ORDER_ID = /^[A-Z0-9]{1,36}$/;
const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUOTE_KEYS = new Set(["productIds", "expected"]);
const EXPECTED_KEYS = new Set(["totalInr", "totalUsd", "currency"]);

export class CheckoutError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export type QuoteItem = {
  id: string;
  name: string;
  quantity: 1;
  unitInr: number;
  unitUsdCents: number;
  unitUsd: string;
};

export type CartQuote = {
  items: QuoteItem[];
  cartCurrency: typeof CART_CURRENCY;
  paypalCurrency: typeof PAYPAL_CURRENCY;
  totalInr: number;
  totalUsdCents: number;
  totalUsd: string;
  inrPerUsd: number;
  customId: string;
  settlementNote: string;
};

export const SETTLEMENT_NOTE =
  "Catalog prices are whole Indian rupees. PayPal's documented REST currency codes do not include INR, so this sandbox order is created in USD. Each line is converted at a fixed rate of 83 INR = 1 USD and rounded to the nearest cent. The captured amount is the sum of those lines. This is not a live exchange rate and not a PayPal conversion.";

export function inrToUsdCents(inrRupees: number): number {
  if (!Number.isInteger(inrRupees) || inrRupees < 0) {
    throw new CheckoutError(400, "Catalog prices must be whole rupees.", "INVALID_PRICE");
  }
  return Math.round((inrRupees * 100) / SANDBOX_INR_PER_USD);
}

export function formatUsdFromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new CheckoutError(400, "USD amount is not a whole number of cents.", "INVALID_AMOUNT");
  }
  const major = Math.floor(cents / 100);
  const minor = cents % 100;
  return `${major}.${String(minor).padStart(2, "0")}`;
}

/** Parse a PayPal money value into cents. Extra trailing zeros are accepted. Non-zero extra fraction digits are not. */
export function parseUsdToCents(value: string): number | null {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  if (frac.length > 2 && !/^0+$/.test(frac.slice(2))) return null;
  const minor = Number((frac + "00").slice(0, 2));
  const cents = Number(whole) * 100 + minor;
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

function customIdFor(totalUsd: string, ids: string[]): string {
  const raw = createHash("sha256")
    .update(`${PAYPAL_CURRENCY}|${totalUsd}|${SANDBOX_INR_PER_USD}|${ids.join(",")}`)
    .digest("hex");
  return `sc${raw.slice(0, 32)}`;
}

export function quoteProductIds(productIds: unknown): CartQuote {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new CheckoutError(400, "Choose at least one catalog product.", "EMPTY_CART");
  }
  if (productIds.length > CATALOG.length) {
    throw new CheckoutError(400, "That cart has too many lines.", "CART_TOO_LARGE");
  }
  const seen = new Set<string>();
  const items: QuoteItem[] = [];
  for (const id of productIds) {
    if (typeof id !== "string" || !/^[a-z0-9]+$/i.test(id)) {
      throw new CheckoutError(400, "Each product id must be a catalog id.", "INVALID_PRODUCT");
    }
    if (seen.has(id)) {
      throw new CheckoutError(400, "Each product can appear only once.", "DUPLICATE_PRODUCT");
    }
    seen.add(id);
    const product = CATALOG.find((p) => p.id === id);
    if (!product) {
      throw new CheckoutError(400, `Unknown product ${id}.`, "UNKNOWN_PRODUCT");
    }
    const unitUsdCents = inrToUsdCents(product.price);
    if (unitUsdCents < 1) {
      throw new CheckoutError(400, `${product.name} converts to zero USD cents.`, "ZERO_AMOUNT");
    }
    items.push({
      id: product.id,
      name: product.name,
      quantity: 1,
      unitInr: product.price,
      unitUsdCents,
      unitUsd: formatUsdFromCents(unitUsdCents),
    });
  }
  const totalInr = items.reduce((sum, item) => sum + item.unitInr, 0);
  const totalUsdCents = items.reduce((sum, item) => sum + item.unitUsdCents, 0);
  const totalUsd = formatUsdFromCents(totalUsdCents);
  const ids = items.map((item) => item.id).sort();
  return {
    items,
    cartCurrency: CART_CURRENCY,
    paypalCurrency: PAYPAL_CURRENCY,
    totalInr,
    totalUsdCents,
    totalUsd,
    inrPerUsd: SANDBOX_INR_PER_USD,
    customId: customIdFor(totalUsd, ids),
    settlementNote: SETTLEMENT_NOTE,
  };
}

function assertExpected(body: Record<string, unknown>, quote: CartQuote) {
  const expected = body.expected;
  if (expected == null || typeof expected !== "object" || Array.isArray(expected)) {
    throw new CheckoutError(400, "Send the reviewed totalInr and totalUsd from the server quote.", "EXPECTED_REQUIRED");
  }
  for (const key of Object.keys(expected)) {
    if (!EXPECTED_KEYS.has(key)) {
      throw new CheckoutError(400, `Unexpected review field ${key}.`, "UNKNOWN_FIELD");
    }
  }
  const exp = expected as Record<string, unknown>;
  if (exp.currency != null && exp.currency !== PAYPAL_CURRENCY) {
    throw new CheckoutError(400, "Sandbox checkout currency must be USD.", "CURRENCY_MISMATCH");
  }
  if (exp.totalInr !== quote.totalInr || exp.totalUsd !== quote.totalUsd) {
    throw new CheckoutError(
      400,
      `Reviewed total does not match the server quote of ₹${quote.totalInr} / USD ${quote.totalUsd}.`,
      "AMOUNT_MISMATCH",
    );
  }
}

export function presentQuote(quote: CartQuote) {
  return {
    items: quote.items.map(({ id, name, quantity, unitInr, unitUsd }) => ({ id, name, quantity, unitInr, unitUsd })),
    cartCurrency: quote.cartCurrency,
    paypalCurrency: quote.paypalCurrency,
    totalInr: quote.totalInr,
    totalUsd: quote.totalUsd,
    inrPerUsd: quote.inrPerUsd,
    settlementNote: quote.settlementNote,
  };
}

function isCheckoutError(error: unknown): error is CheckoutError {
  if (error instanceof CheckoutError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  // Route bundles can each load this module, so a thrown error may fail `instanceof`.
  return candidate.name === "CheckoutError" && typeof candidate.status === "number" && typeof candidate.code === "string" && typeof candidate.message === "string";
}

export function toErrorResponse(error: unknown): Response {
  if (isCheckoutError(error)) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("paypal", error instanceof Error ? error.message : "error");
  return Response.json(
    { error: "Sandbox checkout failed.", code: "SERVER_ERROR" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function publicPayPalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  const credentialsPresent = clientId.length > 0 && clientSecret.length > 0;
  return {
    sandbox: true as const,
    apiBase: PAYPAL_SANDBOX_ORIGIN,
    credentialsPresent,
    clientId: credentialsPresent ? clientId : null,
    cartCurrency: CART_CURRENCY,
    paypalCurrency: PAYPAL_CURRENCY,
    inrPerUsd: SANDBOX_INR_PER_USD,
    requiredEnv: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] as const,
    settlementNote: SETTLEMENT_NOTE,
    message: credentialsPresent
      ? "Sandbox credentials are loaded in this server process. No payment is captured until you approve the PayPal window and this server accepts the order amount."
      : "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set. Checkout is disabled. This process has not verified a PayPal sandbox payment.",
  };
}

type PayPalMoney = { currency_code?: unknown; value?: unknown };
type PayPalItem = { sku?: unknown; quantity?: unknown; unit_amount?: PayPalMoney };
type PayPalCapture = { id?: unknown; status?: unknown; amount?: PayPalMoney };
type PayPalOrder = {
  id?: unknown;
  status?: unknown;
  purchase_units?: Array<{
    custom_id?: unknown;
    amount?: PayPalMoney;
    items?: PayPalItem[];
    payments?: { captures?: PayPalCapture[] };
  }>;
  details?: Array<{ issue?: unknown; description?: unknown }>;
  debug_id?: unknown;
};

function asOrder(json: unknown): PayPalOrder {
  return json && typeof json === "object" ? (json as PayPalOrder) : {};
}

function paypalFailure(json: unknown, fallback: string): { message: string; issue?: string } {
  const order = asOrder(json);
  const detail = order.details?.[0];
  const issue = typeof detail?.issue === "string" ? detail.issue : undefined;
  const description = typeof detail?.description === "string" ? detail.description : undefined;
  const debug = typeof order.debug_id === "string" ? order.debug_id : undefined;
  const summary = [issue, description].filter(Boolean).join(" — ");
  const message = summary ? `PayPal sandbox: ${summary}` : fallback;
  return { message: debug ? `${message} (debug_id ${debug})` : message, issue };
}

function sandboxUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new CheckoutError(500, "Refusing to call a non-sandbox PayPal host.", "LIVE_PAYPAL_BLOCKED");
  }
  const url = new URL(path, PAYPAL_SANDBOX_ORIGIN);
  if (url.origin !== PAYPAL_SANDBOX_ORIGIN) {
    throw new CheckoutError(500, "Refusing to call a non-sandbox PayPal host.", "LIVE_PAYPAL_BLOCKED");
  }
  return url.toString();
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type StoredOrder = {
  idempotencyKey: string;
  orderId: string;
  quote: CartQuote;
  captureRequestId: string;
};

export class CheckoutService {
  private token: { value: string; exp: number } | null = null;
  private byKey = new Map<string, StoredOrder>();
  private byOrder = new Map<string, StoredOrder>();
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly credentials: { clientId: string; clientSecret: string },
    private readonly now: () => number = Date.now,
  ) {}

  private credentialsReady() {
    return this.credentials.clientId.length > 0 && this.credentials.clientSecret.length > 0;
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => gate);
    this.locks.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  private async accessToken(): Promise<string> {
    if (!this.credentialsReady()) {
      throw new CheckoutError(
        503,
        "PayPal sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
        "PAYPAL_NOT_CONFIGURED",
      );
    }
    if (this.token && this.token.exp > this.now()) return this.token.value;
    const auth = Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString("base64");
    let res: Response;
    try {
      res = await this.fetchImpl(sandboxUrl("/v1/oauth2/token"), {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
      });
    } catch {
      throw new CheckoutError(502, "PayPal sandbox did not respond to the token request.", "PAYPAL_UNAVAILABLE");
    }
    const json = (await readBody(res)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!res.ok || !json || typeof json.access_token !== "string" || json.access_token.length === 0) {
      const failure = paypalFailure(json, "PayPal sandbox refused the client-credentials token request.");
      throw new CheckoutError(502, failure.message, "PAYPAL_AUTH_FAILED");
    }
    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 300;
    this.token = { value: json.access_token, exp: this.now() + Math.max(0, expiresIn - 30) * 1000 };
    return json.access_token;
  }

  private orderBody(quote: CartQuote) {
    return {
      intent: "CAPTURE",
      application_context: {
        brand_name: "SkinCart",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
      purchase_units: [
        {
          reference_id: "skincart",
          custom_id: quote.customId,
          description: "SkinCart AI skincare routine (sandbox)",
          amount: {
            currency_code: PAYPAL_CURRENCY,
            value: quote.totalUsd,
            breakdown: {
              item_total: { currency_code: PAYPAL_CURRENCY, value: quote.totalUsd },
            },
          },
          items: quote.items.map((item) => ({
            name: item.name,
            sku: item.id,
            quantity: "1",
            category: "PHYSICAL_GOODS",
            unit_amount: { currency_code: PAYPAL_CURRENCY, value: item.unitUsd },
          })),
        },
      ],
    };
  }

  private assertRemoteMatches(order: PayPalOrder, quote: CartQuote) {
    const unit = order.purchase_units?.[0];
    const currency = unit?.amount?.currency_code;
    const value = unit?.amount?.value;
    const cents = typeof value === "string" ? parseUsdToCents(value) : null;
    if (currency !== PAYPAL_CURRENCY || cents == null || cents !== quote.totalUsdCents) {
      throw new CheckoutError(409, "PayPal order amount or currency does not match the reviewed cart. Nothing was captured.", "AMOUNT_MISMATCH");
    }
    if (unit?.custom_id !== quote.customId) {
      throw new CheckoutError(409, "PayPal order is not the cart this server priced. Nothing was captured.", "CART_MISMATCH");
    }
    const remoteItems = unit?.items ?? [];
    if (remoteItems.length !== quote.items.length) {
      throw new CheckoutError(409, "PayPal order lines do not match the reviewed cart. Nothing was captured.", "CART_MISMATCH");
    }
    const expected = new Map(quote.items.map((item) => [item.id, item.unitUsdCents]));
    for (const item of remoteItems) {
      const sku = typeof item.sku === "string" ? item.sku : "";
      const want = expected.get(sku);
      const itemCents = typeof item.unit_amount?.value === "string" ? parseUsdToCents(item.unit_amount.value) : null;
      if (want == null || item.quantity !== "1" || item.unit_amount?.currency_code !== PAYPAL_CURRENCY || itemCents !== want) {
        throw new CheckoutError(409, "A PayPal line does not match the catalog price. Nothing was captured.", "CART_MISMATCH");
      }
      expected.delete(sku);
    }
  }

  quote(body: unknown): CartQuote {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      throw new CheckoutError(400, "Send a JSON object with productIds.", "INVALID_BODY");
    }
    const record = body as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== "productIds") throw new CheckoutError(400, `Unexpected field ${key}.`, "UNKNOWN_FIELD");
    }
    return quoteProductIds(record.productIds);
  }

  async create(body: unknown, idempotencyKey: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      throw new CheckoutError(400, "Send a JSON object with productIds and the reviewed expected total.", "INVALID_BODY");
    }
    const record = body as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!QUOTE_KEYS.has(key)) throw new CheckoutError(400, `Unexpected field ${key}. Prices are taken from the catalog.`, "UNKNOWN_FIELD");
    }
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new CheckoutError(400, "Send an Idempotency-Key header set to a UUID.", "IDEMPOTENCY_KEY");
    }
    const quote = quoteProductIds(record.productIds);
    assertExpected(record, quote);
    if (!this.credentialsReady()) {
      throw new CheckoutError(
        503,
        "PayPal sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. No order was created.",
        "PAYPAL_NOT_CONFIGURED",
      );
    }
    return this.withLock(`create:${idempotencyKey}`, async () => {
      const existing = this.byKey.get(idempotencyKey);
      if (existing) {
        if (existing.quote.customId !== quote.customId) {
          throw new CheckoutError(409, "This Idempotency-Key was already used for a different cart.", "IDEMPOTENCY_CONFLICT");
        }
        return { status: 200, body: this.createdBody(existing) };
      }
      const token = await this.accessToken();
      let res: Response;
      try {
        res = await this.fetchImpl(sandboxUrl("/v2/checkout/orders"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            Prefer: "return=representation",
            "PayPal-Request-Id": idempotencyKey,
          },
          body: JSON.stringify(this.orderBody(quote)),
        });
      } catch {
        throw new CheckoutError(502, "PayPal sandbox did not respond while creating the order.", "PAYPAL_UNAVAILABLE");
      }
      const json = await readBody(res);
      if (res.status !== 200 && res.status !== 201) {
        const failure = paypalFailure(json, "PayPal sandbox rejected the order.");
        throw new CheckoutError(502, failure.message, failure.issue ?? "PAYPAL_CREATE_FAILED");
      }
      const order = asOrder(json);
      if (typeof order.id !== "string" || !ORDER_ID.test(order.id)) {
        throw new CheckoutError(502, "PayPal sandbox returned an unexpected order id. Nothing was stored for capture.", "PAYPAL_CREATE_FAILED");
      }
      this.assertRemoteMatches(order, quote);
      const stored: StoredOrder = { idempotencyKey, orderId: order.id, quote, captureRequestId: randomUUID() };
      this.byKey.set(idempotencyKey, stored);
      this.byOrder.set(order.id, stored);
      return { status: res.status, body: this.createdBody(stored, typeof order.status === "string" ? order.status : "CREATED") };
    });
  }

  private createdBody(stored: StoredOrder, status = "CREATED") {
    return {
      id: stored.orderId,
      status,
      cartCurrency: CART_CURRENCY,
      currency: PAYPAL_CURRENCY,
      totalInr: stored.quote.totalInr,
      totalUsd: stored.quote.totalUsd,
      inrPerUsd: SANDBOX_INR_PER_USD,
    };
  }

  async capture(orderId: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    if (Array.isArray(body) || (body != null && typeof body === "object" && Object.keys(body).length > 0)) {
      throw new CheckoutError(400, "Capture does not accept an amount. The server uses the reviewed order.", "UNKNOWN_FIELD");
    }
    if (!ORDER_ID.test(orderId)) {
      throw new CheckoutError(400, "That PayPal order id is not valid.", "INVALID_ORDER");
    }
    const stored = this.byOrder.get(orderId);
    if (!stored) {
      throw new CheckoutError(404, "This server process did not create that order. Nothing was captured.", "UNKNOWN_ORDER");
    }
    return this.withLock(`capture:${orderId}`, async () => this.captureStored(stored));
  }

  private async captureStored(stored: StoredOrder): Promise<{ status: number; body: Record<string, unknown> }> {
    const current = await this.getRemoteOrder(stored.orderId);
    this.assertRemoteMatches(current, stored.quote);
    const status = typeof current.status === "string" ? current.status : "";
    if (status === "COMPLETED") {
      this.assertCapture(current, stored.quote);
      return { status: 200, body: this.captureBody(stored, current) };
    }
    if (status !== "APPROVED") {
      throw new CheckoutError(
        409,
        status === "CREATED"
          ? "The buyer has not approved this sandbox order. Nothing was captured."
          : `Sandbox order is ${status || "not approved"}. Nothing was captured.`,
        "NOT_APPROVED",
      );
    }
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await this.fetchImpl(sandboxUrl(`/v2/checkout/orders/${stored.orderId}/capture`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation",
          "PayPal-Request-Id": stored.captureRequestId,
        },
      });
    } catch {
      throw new CheckoutError(502, "PayPal sandbox did not respond while capturing the order.", "PAYPAL_UNAVAILABLE");
    }
    const json = await readBody(res);
    if (res.status !== 200 && res.status !== 201) {
      const failure = paypalFailure(json, "PayPal sandbox rejected the capture.");
      throw new CheckoutError(failure.issue === "INSTRUMENT_DECLINED" ? 422 : 502, failure.message, failure.issue ?? "PAYPAL_CAPTURE_FAILED");
    }
    const captured = asOrder(json);
    this.assertRemoteMatches(captured, stored.quote);
    if (captured.status !== "COMPLETED") {
      throw new CheckoutError(409, `PayPal returned status ${String(captured.status)}. This was not recorded as a completed capture.`, "CAPTURE_INCOMPLETE");
    }
    this.assertCapture(captured, stored.quote);
    return { status: 200, body: this.captureBody(stored, captured) };
  }

  private assertCapture(order: PayPalOrder, quote: CartQuote) {
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    const captureCents = typeof capture?.amount?.value === "string" ? parseUsdToCents(capture.amount.value) : null;
    if (capture?.amount?.currency_code !== PAYPAL_CURRENCY || captureCents !== quote.totalUsdCents || capture?.status !== "COMPLETED") {
      throw new CheckoutError(409, "Capture amount, currency, or status does not match the reviewed cart.", "AMOUNT_MISMATCH");
    }
  }

  private captureBody(stored: StoredOrder, order: PayPalOrder) {
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      id: stored.orderId,
      status: typeof order.status === "string" ? order.status : "COMPLETED",
      captureId: typeof capture?.id === "string" ? capture.id : null,
      captureStatus: typeof capture?.status === "string" ? capture.status : null,
      currency: PAYPAL_CURRENCY,
      value: stored.quote.totalUsd,
      totalInr: stored.quote.totalInr,
    };
  }

  private async getRemoteOrder(orderId: string): Promise<PayPalOrder> {
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await this.fetchImpl(sandboxUrl(`/v2/checkout/orders/${orderId}`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    } catch {
      throw new CheckoutError(502, "PayPal sandbox did not respond while reading the order.", "PAYPAL_UNAVAILABLE");
    }
    const json = await readBody(res);
    if (!res.ok) {
      const failure = paypalFailure(json, "PayPal sandbox could not show that order.");
      throw new CheckoutError(502, failure.message, "PAYPAL_GET_FAILED");
    }
    return asOrder(json);
  }
}

// Process-local on purpose: one `next dev` / `next start` process remembers the
// orders it created so capture cannot target an unknown PayPal order. This is
// not shared across instances and is not used by React Server Components.
const GLOBAL_KEY = "__skincartCheckoutService";

type GlobalCheckout = typeof globalThis & { [GLOBAL_KEY]?: CheckoutService };

export function getCheckoutService(): CheckoutService {
  const g = globalThis as GlobalCheckout;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new CheckoutService(globalThis.fetch.bind(globalThis), {
      clientId: process.env.PAYPAL_CLIENT_ID?.trim() ?? "",
      clientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim() ?? "",
    });
  }
  return g[GLOBAL_KEY];
}

export function resetCheckoutService() {
  const g = globalThis as GlobalCheckout;
  delete g[GLOBAL_KEY];
}
