# PayPal AI Hackathon — SkinCart

**Not submitted.** This file is paste-ready text and a demo script. No Devpost account, PayPal app, YouTube video, or submission was created from this branch.

**Sandbox payment status: not verified.** This environment did not have `PAYPAL_CLIENT_ID` or `PAYPAL_CLIENT_SECRET`. Nothing here completed a PayPal login, approval, or capture. The automated tests mock `https://api-m.sandbox.paypal.com`. Do not describe those tests, or the sample skin scores, as a live checkout or a live YouCam scan.

Official rules used: https://paypalaihackathon.devpost.com/rules (fetched 8 Nov 2026).

Deadline in those rules: **Thursday 12 Nov 2026, 12:00 pm Pacific Time (PST)**, which is **Friday 13 Nov 2026, 1:30 am IST**.

Code that judges can run is on branch `cursor/paypal-sandbox-checkout-6190`:

https://github.com/amantebriwal4321/skincart/tree/cursor/paypal-sandbox-checkout-6190

The default branch `main` is the earlier YouCam-only app. Merging was intentionally not done.

## What changed after the YouCam entry

The git history starts on 31 Oct 2026, which is inside the PayPal submission window that opened 1 Oct 2026. Those commits are the YouCam entry, not a PayPal project:

- Selfie upload and client-side face crop (`src/lib/prep.ts`)
- YouCam AI Skin Analysis v2.0 server client (`src/lib/youcam.ts`)
- Labeled sample scores when `YOUCAM_API_KEY` is missing (`src/lib/sample.ts`)
- Concern ranking, budget cart, AM/PM placement, ingredient clash warnings (`src/lib/recommend.ts`, `src/lib/catalog.ts`)
- Scan API and the original page (`src/app/api/analyze/route.ts`, `src/app/page.tsx`)

There was no payment step. A shopper could see a cart and could not check out.

This update adds the PayPal half of the same shop:

- The AI cart is what gets reviewed and, only with sandbox credentials, paid
- `POST /api/paypal/quote` prices catalog ids in rupees and in USD
- `POST /api/paypal/orders` creates an Orders v2 sandbox order from that quote
- The PayPal JS SDK button is the only way to approve it
- `POST /api/paypal/orders/:id/capture` captures only after PayPal says `APPROVED` and the amount, currency, lines, and cart id still match
- Duplicate create/capture calls are idempotent
- Client-supplied prices are rejected

YouCam files and the sample fixture were not removed. `npm test` still checks the sample cart (`c1`, `t1`, `t2`, `m1`, `p1`, ₹2895 at a ₹3000 budget) and the demo-score response.

The license was already MIT (`LICENSE`, copyright 2026 amantebriwal4321). GitHub already reports that license on the public repository. It was left as-is. MIT is an open-source license and satisfies the rules' public-repo requirement as long as the repository stays public.

## Paste-ready submission

**Project name:** SkinCart

**Tagline:** An AI skincare routine you review, then approve yourself in the PayPal sandbox.

**What it does:** SkinCart is for someone buying a small skincare routine without guessing which actives fight each other or blowing the budget. A selfie is scored by the YouCam AI Skin Analysis API. If that key is unset, the app says so and uses labeled sample scores instead of pretending a scan happened. The app ranks acne, pores, oil, hydration, and the other YouCam concerns, then picks a cleanser, treatments, moisturiser, and sunscreen that fit a rupee budget and flags risky ingredient pairs. The shopper can remove a line. The server re-prices the remaining catalog ids. PayPal's documented REST currencies do not include INR, so the sandbox charge is USD at a fixed rate of 83 INR = 1 USD, rounded to the cent per line and summed. That rate is shown before checkout. The shopper checks that they reviewed the USD total, clicks the PayPal button, and approves a sandbox account in PayPal's window. The server captures only then. Closing the window captures nothing.

**How we built it:** Next.js. The existing YouCam server client is unchanged. New server routes call PayPal OAuth2 client-credentials and Orders v2 create, get, and capture on `https://api-m.sandbox.paypal.com` only. The browser uses the PayPal JavaScript SDK buttons and never sends a price. Create forwards an `Idempotency-Key` as `PayPal-Request-Id`. Capture stores a second request id. Before capture, the server compares PayPal's currency, value, SKUs, and `custom_id` with the quote it created.

**PayPal + AI:** The AI output is the cart. PayPal is how that cart is approved and captured in the sandbox. The model does not place the order and the server does not capture an order that is still `CREATED`.

**Challenges:** INR prices cannot be sent as `currency_code` on the documented PayPal REST currency list, so a disclosed fixed USD settlement is used instead of a fake INR charge. Live sandbox credentials were not available here, so the integration is tested against an explicit HTTP mock. That mock is not a successful sandbox payment.

**What's next:** A sandbox business account that has accepted one of these orders, then a real capture id in the demo video. Optional: a live `YOUCAM_API_KEY` so the video's scores are not the sample fixture.

**Built with:** Next.js, YouCam AI Skin Analysis, PayPal Orders v2 sandbox, PayPal JavaScript SDK.

**Testing instructions for judges:**

1. `git clone` the branch above, or merge it yourself before judging if you only pull `main`.
2. `npm ci`, then `cp .env.example .env.local`.
3. `npm test` should pass. It does not contact PayPal.
4. For a real sandbox payment, create a sandbox REST app and put `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env.local`. Leave `YOUCAM_API_KEY` blank to see the labeled demo badge, or set it for a live scan.
5. `npm run dev`, open http://localhost:3000, upload a JPG or PNG, review the quote, confirm it, and approve with a **personal sandbox account**. The capture line should show the id and `COMPLETED` status from the server. If the credentials are absent, the amber panel must stay up and no PayPal window should appear.

## Demo script

Speak this. No music bed. No PayPal, YouCam, or other logos added on top of the product UI. The recording has to stay under three minutes. Do not splice in a PayPal window, a success toast, or a capture id that this run did not produce.

### Record this if sandbox credentials are not loaded

This is the honest recording of the app as built without secrets.

- **0:00** "SkinCart recommends a skincare routine from a face scan, then asks me to review a PayPal sandbox total. This machine does not have PayPal sandbox keys, so I will not pretend a payment went through."
- **0:15** Upload a front-facing photo. Point at the amber badge: "YouCam key is not set. These scores are the labeled sample fixture, not a live analysis."
- **0:35** Show the concern bars and the cart total under the budget. Move the budget slider so the cart changes. "The recommender is the same one from the YouCam entry. It still warns on ingredient clashes when a pair is in the night routine."
- **1:05** Scroll to "Review PayPal sandbox checkout." Point at the server total in rupees and USD. Read the 83 INR = 1 USD sentence. Remove one product and show the server total change. Add it back.
- **1:35** Point at the amber panel and read the two names: `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. "Checkout is disabled. No PayPal window opened. Nothing was captured."
- **1:55** "The YouCam scan, catalog, and routine picker are still here. PayPal is the new checkout, and it stays off until a sandbox app is configured. Tests mock the Orders API; they are not a live payment."
- **2:15** End on that panel. Stop before three minutes.

### Record this instead only after you have approved a real sandbox payment

Do not read this script unless the PayPal window and the capture id both happened on camera in this take.

- **0:00** One sentence on the problem: a routine that fits the skin and the budget, paid only after a person approves it.
- **0:15** If the YouCam key is unset, say the scores are the sample fixture. If it is set, say the scores are from YouCam for this photo.
- **0:30** Show the cart, then the server USD quote and the 83-to-1 note.
- **0:50** Check the review box. Click the real PayPal button. Log in with the personal **sandbox** account. Approve.
- **1:30** Back on SkinCart, read the capture id, `COMPLETED`, and the USD amount from the server message. Say it is a sandbox capture.
- **1:50** Close the PayPal window on a second attempt, or say what the cancel text already says if you do cancel once: nothing was captured.
- **2:10** "The server created the order, checked the amount and currency, and captured only after approval. The AI did not pay."
- **2:25** Stop.

## What still has to be done by the entrant

1. Confirm you are eligible under the rules (age of majority where you live, not in an excluded place, not a PayPal or Devpost employee, judge, or their household).
2. Create the sandbox REST app yourself and put `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env.local`. Do not commit that file. Do not use live credentials.
3. Complete one sandbox buyer approval and capture locally. The video may show that only if it really happened.
4. Optional: add `YOUCAM_API_KEY` for a live scan. Otherwise keep the demo badge visible in the video.
5. Publish a public YouTube video under three minutes using the matching script above. No copyrighted music.
6. Join the hackathon on Devpost and submit before 12 Nov 2026, 12:00 pm PT. Point the entry at this branch, or merge the pull request yourself so `main` matches what judges clone. This branch was not merged.
7. Paste the submission section above, and keep the sentence that mocked tests are not a live PayPal payment.
