/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";
import { buildCart, delta } from "@/lib/recommend";
import type { SkinOutput } from "@/lib/youcam";

export default function Home() {
  const [preview, setPreview] = useState<string>();
  const [out, setOut] = useState<SkinOutput[]>();
  const [prev, setPrev] = useState<SkinOutput[]>();
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [budget, setBudget] = useState(3000);

  async function scan(f: File) {
    setErr(undefined); setBusy(true); setPreview(URL.createObjectURL(f));
    const fd = new FormData(); fd.append("image", f);
    const r = await fetch("/api/analyze", { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: "Network error. Check your connection and try again." }));
    setBusy(false);
    if (r.error) return setErr(r.error);
    if (out) setPrev(out);
    setOut(r.output); setDemo(r.demo);
  }

  const plan = out ? buildCart(out, budget) : null;
  const d = out && prev ? delta(prev, out) : null;
  const total = plan?.cart.reduce((a, p) => a + p.price, 0) ?? 0;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">SkinCart</h1>
            <p className="text-stone-600">Scan your face. Get a cart that fits your skin and your budget.</p>
          </div>
          {demo && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">demo data, add YOUCAM_API_KEY</span>}
        </header>

        <section className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 aspect-[3/4] overflow-hidden rounded-xl bg-stone-100">
              {preview ? <img src={preview} alt="Your selfie" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm text-stone-400">No photo yet</div>}
            </div>
            <label className="block cursor-pointer rounded-xl bg-rose-600 py-2.5 text-center font-medium text-white hover:bg-rose-700">
              {busy ? "Analysing..." : out ? "Re-scan" : "Upload selfie"}
              <input type="file" accept="image/jpeg,image/png" capture="user" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
            </label>
            <p className="mt-2 text-xs text-stone-500">Tip: close-up, front-facing, good light, no glasses or filters. Your face should fill most of the frame.</p>
            <label className="mt-4 block text-sm text-stone-600">Budget: ₹{budget}
              <input type="range" min={1000} max={6000} step={250} value={budget} onChange={(e) => setBudget(+e.target.value)} className="w-full accent-rose-600" />
            </label>
            {err && <p role="alert" className="mt-3 text-sm text-red-600">{err}</p>}
          </div>

          <div className="space-y-6">
            {plan ? (
              <>
                <div className="rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="mb-3 font-semibold">What your skin needs</h2>
                  <ul className="space-y-2">
                    {(d ?? plan.concerns.map((c) => ({ ...c, change: undefined as number | undefined }))).map((c) => (
                      <li key={c.type} className="flex items-center gap-3">
                        <span className="w-28 text-sm">{c.label}</span>
                        <div className="h-2 flex-1 rounded bg-stone-100"><div className="h-2 rounded bg-rose-500" style={{ width: `${c.score}%` }} /></div>
                        <span className="w-10 text-right text-sm tabular-nums">{c.score}</span>
                        {c.change != null && <span className={`w-10 text-right text-xs ${c.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>{c.change >= 0 ? "+" : ""}{c.change}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="mb-3 flex justify-between"><h2 className="font-semibold">Your cart</h2><span className="font-semibold">₹{total}</span></div>
                  <ul className="divide-y">
                    {plan.cart.map((p) => (
                      <li key={p.id} className="flex justify-between py-2 text-sm">
                        <span><span className="mr-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs uppercase text-stone-500">{p.step}</span>{p.name}<span className="ml-2 text-stone-400">{p.am && "AM"} {p.pm && "PM"}</span></span>
                        <span>₹{p.price}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.warnings.map((w) => <p key={w} className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{w}</p>)}
                </div>
              </>
            ) : (
              <div className="grid h-full place-items-center rounded-2xl border-2 border-dashed border-stone-200 p-10 text-center text-stone-500">Upload a front facing selfie in good light. Results show up here.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
