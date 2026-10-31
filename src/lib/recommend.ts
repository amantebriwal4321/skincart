import { CATALOG, CONFLICTS, type Product } from "./catalog";
import type { SkinOutput } from "./youcam";

export const LABEL: Record<string, string> = { acne: "Acne", pore: "Pores", redness: "Redness", oiliness: "Oiliness", moisture: "Hydration", texture: "Texture", wrinkle: "Fine lines", dark_circle_v2: "Dark circles", age_spot: "Spots", radiance: "Radiance" };

// YouCam ui_score: higher = healthier. Concern weight = 100 - score.
export function concerns(out: SkinOutput[]) {
  return out.filter((o) => LABEL[o.type] && typeof o.ui_score === "number")
    .map((o) => ({ type: o.type, label: LABEL[o.type], score: o.ui_score as number, weight: 100 - (o.ui_score as number) }))
    .sort((a, b) => b.weight - a.weight);
}

export function buildCart(out: SkinOutput[], budget = 3000) {
  const cs = concerns(out).filter((c) => c.score < 75).slice(0, 4);
  const w = Object.fromEntries(cs.map((c) => [c.type, c.weight]));
  const scored = CATALOG.map((p) => ({ p, s: p.targets.reduce((a, t) => a + (w[t] || 0), 0) })).filter((x) => x.s > 0 || x.p.step === "protect");
  const pick: Product[] = [];
  for (const step of ["cleanse", "treat", "moisturise", "protect"] as const) {
    const opts = scored.filter((x) => x.p.step === step).sort((a, b) => b.s - a.s);
    const n = step === "treat" ? 2 : 1;
    for (const o of opts.slice(0, n)) if (pick.reduce((a, p) => a + p.price, 0) + o.p.price <= budget) pick.push(o.p);
  }
  return { concerns: cs, cart: pick, warnings: conflicts(pick) };
}

export function conflicts(ps: Product[]) {
  const acts = new Set(ps.filter((p) => p.pm).flatMap((p) => p.actives));
  return CONFLICTS.filter(([a, b]) => acts.has(a) && acts.has(b)).map((c) => c[2]);
}

// Re-scan delta: is the routine working?
export function delta(before: SkinOutput[], after: SkinOutput[]) {
  const b = Object.fromEntries(concerns(before).map((c) => [c.type, c.score]));
  return concerns(after).map((c) => ({ ...c, change: b[c.type] != null ? c.score - b[c.type] : 0 }));
}
