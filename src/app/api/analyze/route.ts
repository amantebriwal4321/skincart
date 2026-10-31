import { analyzeSkin } from "@/lib/youcam";
import { SAMPLE } from "@/lib/sample";
export const runtime = "nodejs";
export const maxDuration = 60;
const OK = ["image/jpeg", "image/png"];

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("image");
  if (!(file instanceof Blob)) return Response.json({ error: "image required" }, { status: 400 });
  if (!OK.includes(file.type)) return Response.json({ error: "jpg or png only" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: "max 8 MB" }, { status: 413 });
  const key = process.env.YOUCAM_API_KEY;
  if (!key) return Response.json({ demo: true, output: SAMPLE });
  try {
    return Response.json({ demo: false, output: await analyzeSkin(file, file.type, key) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
