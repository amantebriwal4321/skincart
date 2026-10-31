import { analyzeSkin } from "@/lib/youcam";
import { SAMPLE } from "@/lib/sample";
export const runtime = "nodejs";
export const maxDuration = 60;
const OK = ["image/jpeg", "image/png"];
const CLOSEUP = "We couldn't read your face clearly. Try a close-up, well-lit, front-facing photo with your face filling most of the frame.";
function friendly(m: string) {
  if (/error_src_face_too_small|error_src_face_out_of_bound|error_no_face|face_not_found|error_src_face/i.test(m)) return CLOSEUP;
  if (/error_below_min_image_size/i.test(m)) return "That photo is too low resolution. Use one at least 480px on the short side.";
  if (/error_exceed_max_image_size/i.test(m)) return "That photo is too large. Try a smaller one.";
  if (/timed out/i.test(m)) return "The scan took too long. Please try again in a moment.";
  return `Skin scan failed (${m}). Please try again.`;
}

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("image");
  if (!(file instanceof Blob)) return Response.json({ error: "image required" }, { status: 400 });
  if (!OK.includes(file.type)) return Response.json({ error: "Please upload a JPG or PNG photo (HEIC is not supported here)." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: "max 8 MB" }, { status: 413 });
  const key = process.env.YOUCAM_API_KEY;
  if (!key) return Response.json({ demo: true, output: SAMPLE });
  try {
    return Response.json({ demo: false, output: await analyzeSkin(file, file.type, key) });
  } catch (e) {
    console.error("youcam", (e as Error).message);
    return Response.json({ error: friendly((e as Error).message) }, { status: 422 });
  }
}
