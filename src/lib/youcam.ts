// YouCam AI Skin Analysis v2.0 client (server only).
// Docs: https://docs.perfectcorp.com/reference/ai_skin_analysis
const BASE = process.env.YOUCAM_API_BASE || "https://yce-api-01.makeupar.com";

export type SkinOutput = { type: string; region?: string; ui_score?: number; raw_score?: number; score?: number; mask_urls?: string[] };

// SD actions only (HD and SD cannot be mixed in one task).
export const ACTIONS = ["acne", "pore", "redness", "oiliness", "moisture", "texture", "wrinkle", "dark_circle_v2", "age_spot", "radiance", "skin_type"];

function headers(key: string) {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function analyzeSkin(img: Blob, contentType: string, key: string): Promise<SkinOutput[]> {
  // 1. register file, get presigned PUT
  const meta = await fetch(`${BASE}/s2s/v2.0/file/skin-analysis`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ files: [{ content_type: contentType, file_name: `face.${contentType.split("/")[1] || "jpg"}`, file_size: img.size }] }),
  }).then((r) => r.json());
  const f = meta?.data?.files?.[0];
  if (!f?.file_id) throw new Error(`file api failed: ${meta?.error || meta?.status}`);
  const put = f.requests[0];
  // 2. upload bytes
  const up = await fetch(put.url, { method: put.method || "PUT", headers: put.headers, body: img });
  if (!up.ok) throw new Error(`upload failed: ${up.status}`);
  // 3. create task
  const task = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ src_file_id: f.file_id, dst_actions: ACTIONS, miniserver_args: { enable_mask_overlay: true }, format: "json" }),
  }).then((r) => r.json());
  const taskId = task?.data?.task_id;
  if (!taskId) throw new Error(`task create failed: ${task?.error || task?.status}`);
  // 4. poll
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetch(`${BASE}/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`, { headers: headers(key) }).then((r) => r.json());
    const st = s?.data?.task_status;
    if (st === "success") return s.data.results.output as SkinOutput[];
    if (st === "error") throw new Error(s.data.error || "task error");
  }
  throw new Error("timed out waiting for skin analysis");
}
