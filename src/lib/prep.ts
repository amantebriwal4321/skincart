// Client-side photo prep for YouCam: apply EXIF orientation, crop around the face so
// it fills more than 60% of the image width (YouCam rule), keep short side >= 480, output JPEG.
/* eslint-disable @typescript-eslint/no-explicit-any */
const MP = "1.2.0";
let detector: Promise<any> | null = null;

function getDetector() {
  if (!detector) {
    detector = (async () => {
      const v = await import("@mediapipe/tasks-vision");
      const files = await v.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP}/wasm`);
      return v.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    })().catch((e) => { detector = null; throw e; });
  }
  return detector;
}

type Box = { x: number; y: number; w: number; h: number };

async function findFace(c: HTMLCanvasElement): Promise<Box | null> {
  try {
    const d = await getDetector();
    const r = d.detect(c);
    const b = (r.detections || []).sort((a: any, z: any) => z.boundingBox.width - a.boundingBox.width)[0]?.boundingBox;
    return b ? { x: b.originX, y: b.originY, w: b.width, h: b.height } : null;
  } catch {
    return null;
  }
}

export async function prepPhoto(file: Blob): Promise<{ blob: Blob; faceFound: boolean }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const W = bmp.width, H = bmp.height;
  // detect on a downscaled copy (fast, enough for a box)
  const ds = Math.min(1, 1024 / Math.max(W, H));
  const dc = document.createElement("canvas");
  dc.width = Math.round(W * ds); dc.height = Math.round(H * ds);
  dc.getContext("2d")!.drawImage(bmp, 0, 0, dc.width, dc.height);
  const f = await findFace(dc);
  let sx = 0, sy = 0, sw = W, sh = H;
  if (f) {
    const face = { x: f.x / ds, y: f.y / ds, w: f.w / ds, h: f.h / ds };
    // blaze box is tight, so face ends up ~85% of crop width (needs > 60%)
    sw = Math.min(W, face.w / 0.8);
    sh = Math.min(H, sw * 4 / 3);
    const cx = face.x + face.w / 2, cy = face.y + face.h * 0.5;
    sx = Math.max(0, Math.min(W - sw, cx - sw / 2));
    sy = Math.max(0, Math.min(H - sh, cy - sh / 2));
  }
  // short side at least 600 (YouCam min 480), long side at most 1440
  let scale = Math.min(1, 1440 / Math.max(sw, sh));
  if (Math.min(sw, sh) * scale < 600) scale = 600 / Math.min(sw, sh);
  const ow = Math.round(sw * scale), oh = Math.round(sh * scale);
  const c = document.createElement("canvas");
  c.width = ow; c.height = oh;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, ow, oh);
  bmp.close();
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.9));
  return { blob, faceFound: !!f };
}
