import type { SkinOutput } from "./youcam";
// Sample response shape used only when YOUCAM_API_KEY is not set. Shown with a "demo data" badge.
export const SAMPLE: SkinOutput[] = [
  { type: "acne", ui_score: 58 }, { type: "pore", ui_score: 62 }, { type: "redness", ui_score: 71 },
  { type: "oiliness", ui_score: 49 }, { type: "moisture", ui_score: 66 }, { type: "texture", ui_score: 64 },
  { type: "wrinkle", ui_score: 88 }, { type: "dark_circle_v2", ui_score: 60 }, { type: "age_spot", ui_score: 82 },
  { type: "radiance", ui_score: 70 }, { type: "skin_type", ui_score: 0, region: "whole" },
];
