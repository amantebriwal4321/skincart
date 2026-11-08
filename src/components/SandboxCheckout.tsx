"use client";

import { useEffect, useRef, useState } from "react";

type Line = { id: string; name: string };

type QuoteItem = { id: string; name: string; quantity: number; unitInr: number; unitUsd: string };

type Quote = {
  items: QuoteItem[];
  totalInr: number;
  totalUsd: string;
  paypalCurrency: string;
  inrPerUsd: number;
  settlementNote: string;
};

type PayPalConfig = {
  credentialsPresent: boolean;
  clientId: string | null;
  message: string;
  requiredEnv: string[];
};

type CaptureResult = {
  status?: string;
  captureId?: string | null;
  captureStatus?: string | null;
  currency?: string;
  value?: string;
};

const SDK_ID = "paypal-js-sdk";

function loadPayPalSdk(clientId: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the PayPal sandbox script.")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SDK_ID;
    script.async = true;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the PayPal sandbox script."));
    document.body.appendChild(script);
  });
}

function PayPalButtons({
  clientId,
  onCreate,
  onApprove,
  onCancel,
  onError,
}: {
  clientId: string;
  onCreate: () => Promise<string>;
  onApprove: (orderID: string, restart: () => Promise<void> | void) => Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCreate, onApprove, onCancel, onError });
  handlers.current = { onCreate, onApprove, onCancel, onError };

  useEffect(() => {
    let cancelled = false;
    let buttons: { render: (element: HTMLElement) => Promise<void>; close: () => Promise<void> | void } | undefined;
    loadPayPalSdk(clientId)
      .then(() => {
        if (cancelled || !host.current || !window.paypal) {
          if (!cancelled && !window.paypal) handlers.current.onError(new Error("PayPal sandbox script loaded without a checkout button."));
          return;
        }
        buttons = window.paypal.Buttons({
          style: { layout: "vertical", label: "paypal", shape: "rect", color: "gold" },
          createOrder: () => handlers.current.onCreate(),
          onApprove: (data, actions) => handlers.current.onApprove(data.orderID, () => actions.restart()),
          onCancel: () => handlers.current.onCancel(),
          onError: (error) => handlers.current.onError(error),
        });
        return buttons.render(host.current);
      })
      .catch((error) => {
        if (!cancelled) handlers.current.onError(error);
      });
    return () => {
      cancelled = true;
      void buttons?.close();
    };
  }, [clientId]);

  return <div ref={host} className="min-h-12" />;
}

export function SandboxCheckout({ lines, demo }: { lines: Line[]; demo: boolean }) {
  const lineKey = lines.map((line) => line.id).join(",");
  const [seenKey, setSeenKey] = useState(lineKey);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  if (seenKey !== lineKey) {
    setSeenKey(lineKey);
    setExcluded([]);
    setReviewed(false);
    setResult(null);
    setPayError(null);
  }

  const selected = lines.filter((line) => !excluded.includes(line.id));
  const selectedKey = selected.map((line) => line.id).join(",");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/paypal/config", { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => {
        if (!controller.signal.aborted) setConfig(body);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setConfigError("Could not read PayPal sandbox status.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
    const controller = new AbortController();
    setQuote(null);
    setQuoteError(null);
    setReviewed(false);
    setResult(null);
    if (selectedKey.length === 0) return () => controller.abort();
    fetch("/api/paypal/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: selectedKey.split(",") }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not validate this cart.");
        return body as Quote;
      })
      .then((body) => {
        if (!controller.signal.aborted) setQuote(body);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setQuoteError(error instanceof Error ? error.message : "Could not validate this cart.");
      });
    return () => controller.abort();
  }, [selectedKey]);

  function toggle(id: string) {
    setExcluded((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setReviewed(false);
    setResult(null);
    setPayError(null);
  }

  async function createOrder() {
    if (!quote) throw new Error("Wait for the server quote before opening PayPal.");
    const res = await fetch("/api/paypal/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
      body: JSON.stringify({
        productIds: quote.items.map((item) => item.id),
        expected: { totalInr: quote.totalInr, totalUsd: quote.totalUsd, currency: "USD" },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.id !== "string") {
      throw new Error(typeof body.error === "string" ? body.error : "Could not create the sandbox order.");
    }
    return body.id as string;
  }

  const credentialsPresent = config?.credentialsPresent === true && typeof config.clientId === "string" && config.clientId.length > 0;

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="sandbox-checkout-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="sandbox-checkout-heading" className="font-semibold">Review PayPal sandbox checkout</h2>
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">No auto-pay</span>
      </div>
      <p className="text-sm text-stone-600">
        {demo
          ? "This routine uses labeled sample skin scores because YOUCAM_API_KEY is not set."
          : "This routine uses the YouCam scan from this session."}{" "}
        The server prices every line from the catalog. PayPal opens only after you review that quote and press the PayPal button. Nothing is captured unless you approve it there.
      </p>

      <ul className="mt-4 divide-y">
        {lines.map((line) => {
          const off = excluded.includes(line.id);
          const priced = quote?.items.find((item) => item.id === line.id);
          return (
            <li key={line.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className={off ? "text-stone-400 line-through" : ""}>{line.name}</span>
              <span className="flex items-center gap-3">
                {priced ? <span className="tabular-nums text-stone-600">₹{priced.unitInr} · USD {priced.unitUsd}</span> : null}
                <button type="button" className="text-xs font-medium text-rose-700 underline" onClick={() => toggle(line.id)}>
                  {off ? "Add back" : "Remove"}
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {selected.length === 0 ? <p className="mt-3 text-sm text-stone-600">Add at least one product to price a sandbox order.</p> : null}
      {quoteError ? <p role="alert" className="mt-3 text-sm text-red-700">{quoteError}</p> : null}
      {quote ? (
        <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">
          <p className="flex justify-between font-semibold"><span>Server total</span><span>₹{quote.totalInr} · USD {quote.totalUsd}</span></p>
          <p className="mt-2 text-stone-600">{quote.settlementNote}</p>
        </div>
      ) : selected.length > 0 && !quoteError ? <p className="mt-3 text-sm text-stone-500">Checking this cart with the server…</p> : null}

      {configError ? <p role="alert" className="mt-3 text-sm text-red-700">{configError}</p> : null}
      {config && !credentialsPresent ? (
        <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">PayPal sandbox checkout is not live on this machine.</p>
          <p className="mt-1">{config.message}</p>
          <p className="mt-2">Set both values in <code>.env.local</code>, then restart <code>npm run dev</code>:</p>
          <ul className="mt-1 list-disc pl-5">
            {config.requiredEnv.map((name) => <li key={name}><code>{name}</code></li>)}
          </ul>
          <p className="mt-2">Use a sandbox REST app only. This server calls <code>api-m.sandbox.paypal.com</code> and will not create a live order.</p>
        </div>
      ) : null}

      {credentialsPresent && quote ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-stone-600">{config?.message}</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-rose-600"
              checked={reviewed}
              onChange={(event) => {
                setReviewed(event.target.checked);
                setResult(null);
                setPayError(null);
              }}
            />
            <span>I reviewed USD {quote.totalUsd} for this cart. I still have to approve the PayPal sandbox window. This page will not pay by itself.</span>
          </label>
          {reviewed && config?.clientId ? (
            <PayPalButtons
              clientId={config.clientId}
              onCreate={createOrder}
              onApprove={async (orderID, restart) => {
                const res = await fetch(`/api/paypal/orders/${encodeURIComponent(orderID)}/capture`, { method: "POST" });
                const body = await res.json().catch(() => ({}));
                if (body.code === "INSTRUMENT_DECLINED") {
                  setPayError("PayPal declined that funding source. Choose another one in the sandbox window.");
                  await restart();
                  return;
                }
                if (!res.ok) {
                  setPayError(typeof body.error === "string" ? body.error : "Capture did not complete. Nothing was recorded as paid.");
                  return;
                }
                setPayError(null);
                setResult(body);
              }}
              onCancel={() => {
                setResult(null);
                setPayError("You closed PayPal before approving. Nothing was captured.");
              }}
              onError={(error) => {
                setResult(null);
                setPayError(error instanceof Error ? error.message : "PayPal checkout hit an error. Nothing was captured.");
              }}
            />
          ) : (
            <p className="text-sm text-stone-500">Confirm the quote to load the PayPal button.</p>
          )}
        </div>
      ) : null}

      {payError ? <p role="alert" className="mt-3 text-sm text-red-700">{payError}</p> : null}
      {result ? (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Sandbox order {result.status}. Capture {result.captureStatus ?? "unknown"} {result.captureId ?? ""}. Amount {result.currency} {result.value}. This text is the server capture response for a PayPal sandbox order.
        </p>
      ) : null}
    </section>
  );
}
