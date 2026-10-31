// Placeholder catalog: generic products by active ingredient. Swap for a real store feed.
export type Product = { id: string; name: string; step: "cleanse" | "treat" | "moisturise" | "protect"; actives: string[]; targets: string[]; price: number; am: boolean; pm: boolean };
export const CATALOG: Product[] = [
  { id: "c1", name: "Salicylic 2% Gel Cleanser", step: "cleanse", actives: ["salicylic acid"], targets: ["acne", "oiliness", "pore"], price: 399, am: true, pm: true },
  { id: "c2", name: "Ceramide Cream Cleanser", step: "cleanse", actives: ["ceramides"], targets: ["moisture", "redness"], price: 449, am: true, pm: true },
  { id: "t1", name: "Niacinamide 10% Serum", step: "treat", actives: ["niacinamide"], targets: ["pore", "oiliness", "redness", "radiance"], price: 599, am: true, pm: true },
  { id: "t2", name: "Azelaic Acid 10% Gel", step: "treat", actives: ["azelaic acid"], targets: ["acne", "redness", "age_spot"], price: 749, am: false, pm: true },
  { id: "t3", name: "Retinal 0.05% Night Serum", step: "treat", actives: ["retinoid"], targets: ["wrinkle", "texture", "acne"], price: 999, am: false, pm: true },
  { id: "t4", name: "Vitamin C 15% Serum", step: "treat", actives: ["ascorbic acid"], targets: ["radiance", "age_spot", "dark_circle_v2"], price: 899, am: true, pm: false },
  { id: "t5", name: "Caffeine Eye Gel", step: "treat", actives: ["caffeine"], targets: ["dark_circle_v2"], price: 499, am: true, pm: true },
  { id: "t6", name: "Glycolic 8% Toner", step: "treat", actives: ["aha"], targets: ["texture", "age_spot", "radiance"], price: 649, am: false, pm: true },
  { id: "m1", name: "Oil Free Gel Moisturiser", step: "moisturise", actives: ["hyaluronic acid"], targets: ["moisture", "oiliness"], price: 549, am: true, pm: true },
  { id: "m2", name: "Barrier Repair Cream", step: "moisturise", actives: ["ceramides", "panthenol"], targets: ["moisture", "redness", "texture"], price: 699, am: true, pm: true },
  { id: "p1", name: "SPF 50 Fluid Sunscreen", step: "protect", actives: ["uv filters"], targets: ["age_spot", "wrinkle", "redness"], price: 599, am: true, pm: false },
];
// Pairs that shouldn't share the same routine slot.
export const CONFLICTS: [string, string, string][] = [
  ["retinoid", "aha", "Retinoid + AHA in one night irritates. Alternate nights."],
  ["retinoid", "salicylic acid", "Retinoid + BHA can over-dry. Keep BHA to the AM cleanse."],
  ["ascorbic acid", "aha", "Vitamin C + AHA stings for most people. Split AM/PM."],
];
