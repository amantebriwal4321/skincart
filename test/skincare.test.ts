import { POST } from "@/app/api/analyze/route";
import { CATALOG } from "@/lib/catalog";
import { buildCart, conflicts, delta } from "@/lib/recommend";
import { SAMPLE } from "@/lib/sample";
import { ACTIONS, analyzeSkin } from "@/lib/youcam";
import { describe, expect, it } from "vitest";

describe("existing skincare AI behavior", () => {
  it("keeps the YouCam action list and sample scores", () => {
    expect(ACTIONS).toContain("acne");
    expect(ACTIONS).toContain("radiance");
    expect(typeof analyzeSkin).toBe("function");
    expect(SAMPLE.map((row) => row.type)).toEqual(expect.arrayContaining(["acne", "oiliness", "skin_type"]));
  });

  it("builds the same budget cart from the labeled sample scores", () => {
    const plan = buildCart(SAMPLE, 3000);
    expect(plan.cart.map((product) => product.id)).toEqual(["c1", "t1", "t2", "m1", "p1"]);
    expect(plan.cart.reduce((sum, product) => sum + product.price, 0)).toBe(2895);
    expect(plan.concerns.map((concern) => concern.type)).toEqual(["oiliness", "acne", "dark_circle_v2", "pore"]);
  });

  it("still warns when a retinoid and an AHA share the night routine", () => {
    const retinal = CATALOG.find((product) => product.id === "t3");
    const glycolic = CATALOG.find((product) => product.id === "t6");
    expect(retinal && glycolic).toBeTruthy();
    expect(conflicts([retinal!, glycolic!])).toEqual(["Retinoid + AHA in one night irritates. Alternate nights."]);
  });

  it("still reports a re-scan score change", () => {
    const change = delta([{ type: "acne", ui_score: 50 }], [{ type: "acne", ui_score: 60 }]);
    expect(change[0]).toMatchObject({ type: "acne", score: 60, change: 10 });
  });

  it("returns labeled demo scores when YOUCAM_API_KEY is absent", async () => {
    delete process.env.YOUCAM_API_KEY;
    const file = new File([Uint8Array.from([0xff, 0xd8, 0xff])], "face.jpg", { type: "image/jpeg" });
    const form = new FormData();
    form.set("image", file);
    const res = await POST(new Request("http://localhost/api/analyze", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.output).toEqual(SAMPLE);
  });

  it("rejects a photo type the scanner does not accept", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const form = new FormData();
    form.set("image", file);
    const res = await POST(new Request("http://localhost/api/analyze", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JPG or PNG/);
  });
});
