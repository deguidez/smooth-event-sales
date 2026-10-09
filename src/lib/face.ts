// Browser-only face detection + 128d descriptors (loaded lazily).
let loading: Promise<any> | null = null;

export function loadFaceApi() {
  if (!loading) {
    loading = (async () => {
      const faceapi: any = await import("@vladmandic/face-api");
      await faceapi.tf.setBackend("webgl").catch(() => faceapi.tf.setBackend("cpu"));
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri("/face-models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/face-models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/face-models"),
      ]);
      return faceapi;
    })();
  }
  return loading;
}

/** Returns one descriptor per face found (min confidence 0.5). */
export async function faceDescriptors(img: HTMLImageElement | HTMLCanvasElement): Promise<number[][]> {
  const faceapi = await loadFaceApi();
  const res = await faceapi
    .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return res.map((r: any) => Array.from(r.descriptor as Float32Array).map((x) => Number(x.toFixed(5))));
}

/** Selfie: largest face only. */
export async function selfieDescriptor(img: HTMLImageElement | HTMLCanvasElement): Promise<number[] | null> {
  const faceapi = await loadFaceApi();
  const r = await faceapi
    .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return r ? Array.from(r.descriptor as Float32Array).map((x) => Number(x.toFixed(5))) : null;
}

export async function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
  return img;
}

/** Downscaled canvas used for detection and preview. */
export function scaled(img: HTMLImageElement, max: number) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Tiled watermark + preview JPEG blob. */
export async function watermarkedPreview(img: HTMLImageElement, watermarkUrl: string | null, max = 1200): Promise<Blob> {
  const c = scaled(img, max);
  const ctx = c.getContext("2d")!;
  if (watermarkUrl) {
    const wm = await loadImage(watermarkUrl);
    const w = c.width * 0.35;
    const h = (wm.naturalHeight / wm.naturalWidth) * w;
    ctx.globalAlpha = 0.45;
    for (let y = -h / 2; y < c.height; y += h * 1.8) for (let x = ((y / h) % 2) * w * 0.5 - w / 2; x < c.width; x += w * 1.4) ctx.drawImage(wm, x, y, w, h);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = `bold ${Math.round(c.width / 12)}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "center";
    for (let y = c.height / 4; y < c.height; y += c.height / 3) ctx.fillText("PRÉVIA", c.width / 2, y);
  }
  return new Promise((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.72));
}
