# SkinCart

Scan a selfie with the YouCam AI Skin Analysis API, rank the concerns that matter, and build a budget skincare cart with an AM/PM routine and ingredient clash warnings. Re-scan later to see if the routine is working. Review the server-priced cart, then approve a PayPal **sandbox** checkout yourself. The page cannot pay on its own.

The YouCam planner was built for the YouCam API Skin AI & eCommerce VTO Hackathon. The PayPal sandbox checkout was added afterward for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Submission text, the delta from that YouCam entry, and the demo script are in [HACKATHON.md](HACKATHON.md).

## YouCam API used

AI Skin Analysis v2.0 (`/s2s/v2.0/file` upload, `/s2s/v2.0/task/skin-analysis`, poll task). See `src/lib/youcam.ts`. That client, the sample scores, the catalog, the recommender, and the photo prep are unchanged.

Without `YOUCAM_API_KEY` the scan route returns `src/lib/sample.ts` and the page shows a demo-data badge. Those scores are fixtures, not a live YouCam result.

## PayPal sandbox checkout

Orders are created and captured on the server with the [Orders v2 API](https://developer.paypal.com/docs/api/orders/v2/) against `https://api-m.sandbox.paypal.com` only. The browser loads the [PayPal JavaScript SDK buttons](https://developer.paypal.com/docs/checkout/standard/integrate/) after the shopper confirms the server quote. Capture runs only after PayPal reports the order as `APPROVED`, and only if the currency, total, line items, and cart id still match the quote stored for that order.

Catalog prices are whole Indian rupees. PayPal's documented REST currency list does not include INR, so each line is converted at a fixed sandbox rate of **83 INR = 1 USD**, rounded to the nearest cent. The order total is the sum of those lines. This is not a market rate and not a PayPal conversion. The review card states the rate before the PayPal button can load.

The shopper's browser cannot set the price. A client `amount` is rejected. Create uses an `Idempotency-Key` UUID, forwarded as `PayPal-Request-Id`. The same key and cart returns the original order. The same key and a different cart returns 409. Capture uses its own stored `PayPal-Request-Id` and will not call PayPal again once the order is `COMPLETED` with a matching capture. The in-memory order list is process-local: restarting the server forgets it, and capture of an unknown id returns 404.

**Live sandbox verification was not run in this environment.** `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` were not present. `npm test` mocks the PayPal HTTP API. A green test run is not a completed sandbox payment.

## Run

```bash
npm ci
cp .env.example .env.local
npm test
npm run dev
```

Open http://localhost:3000. Upload a front-facing JPG or PNG. With no YouCam key, expect the demo-data badge, a cart, and a server quote in rupees and USD. Checkout stays disabled until both PayPal variables below are set and the dev server is restarted.

| Variable | Required for | Notes |
| --- | --- | --- |
| `YOUCAM_API_KEY` | Live skin scores | Blank uses labeled sample scores and `demo: true`. |
| `PAYPAL_CLIENT_ID` | Sandbox button and order creation | Sandbox REST app client id from the PayPal developer dashboard. Public in the browser SDK URL. |
| `PAYPAL_CLIENT_SECRET` | Server token, create, and capture | Sandbox secret. Stays on the server. Never commit it. |

Use a sandbox app from https://developer.paypal.com/dashboard/applications/sandbox. Do not paste live PayPal credentials. The buyer step uses a **personal sandbox account** from the same dashboard, not a real PayPal login. After you approve the sandbox window, the page shows the capture id and status returned by this server.

```bash
npm run lint
npm run build
npm start
```

Run the app as one Node process (`next dev` or `next start`). The order memory is not shared across multiple server instances.

## Tests

`npm test` covers the existing sample-score cart, the YouCam demo fallback, quote math, rejected client prices, currency checks, idempotency, refusal to capture an unapproved or altered order, and a mocked approve-then-capture. The mock never contacts PayPal.

## License

MIT. See [LICENSE](LICENSE). The file was already in the repository and is unchanged.
