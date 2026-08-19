import {
  MAX_SCREENSHOT_FILES,
  MAX_SCREENSHOT_FILE_BYTES,
  MAX_SCREENSHOT_TOTAL_BYTES,
  validateScreenshotFiles,
} from "@/domain/screenshot-validation";

export const IMAGE_LIMITS = {
  maxFiles: MAX_SCREENSHOT_FILES,
  maxFileBytes: MAX_SCREENSHOT_FILE_BYTES,
  maxRawBytes: MAX_SCREENSHOT_TOTAL_BYTES,
  maxProcessedBytes: 2 * 1024 * 1024,
  maxLongEdge: 1600,
} as const;

export type PreparedImage = {
  name: string;
  mimeType: "image/webp" | "image/png" | "image/jpeg";
  dataUrl: string;
  byteLength: number;
  width: number;
  height: number;
};

export class ImagePreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePreparationError";
  }
}

export function validateImageFiles(files: readonly File[]): void {
  const result = validateScreenshotFiles(files);
  if (!result.valid) throw new ImagePreparationError(result.errors[0]?.message ?? "画像を確認してください。");
}

export function calculateProcessedImageBudget(
  preparedBytes: number,
  remainingFiles: number,
): number {
  const remainingBytes = Math.max(0, IMAGE_LIMITS.maxProcessedBytes - preparedBytes);
  return remainingFiles > 0 ? Math.floor(remainingBytes / remainingFiles) : 0;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function bitmapDimensions(bitmap: ImageBitmap | HTMLImageElement) {
  return "naturalWidth" in bitmap
    ? { width: bitmap.naturalWidth, height: bitmap.naturalHeight }
    : { width: bitmap.width, height: bitmap.height };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new ImagePreparationError("画像を変換できませんでした。")),
      "image/webp",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ImagePreparationError("画像を読み込めませんでした。"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function prepareOne(file: File, byteBudget: number): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  try {
    const source = bitmapDimensions(bitmap);
    const initialScale = Math.min(1, IMAGE_LIMITS.maxLongEdge / Math.max(source.width, source.height));
    let width = Math.max(1, Math.round(source.width * initialScale));
    let height = Math.max(1, Math.round(source.height * initialScale));
    let quality = 0.86;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new ImagePreparationError("このブラウザーでは画像を変換できません。");
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= byteBudget) break;
      quality = Math.max(0.58, quality - 0.07);
      const scale = Math.max(0.76, Math.sqrt(byteBudget / blob.size) * 0.96);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    if (!blob || blob.size > byteBudget) {
      throw new ImagePreparationError("画像を送信可能なサイズまで縮小できませんでした。");
    }
    if (blob.type !== "image/webp" && blob.type !== "image/png" && blob.type !== "image/jpeg") {
      throw new ImagePreparationError("このブラウザーでは画像を対応形式へ変換できませんでした。");
    }
    return {
      name: file.name,
      mimeType: blob.type,
      dataUrl: await blobToDataUrl(blob),
      byteLength: blob.size,
      width,
      height,
    };
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

export async function prepareImages(files: readonly File[]): Promise<PreparedImage[]> {
  validateImageFiles(files);
  const prepared: PreparedImage[] = [];
  let preparedBytes = 0;
  for (const [index, file] of files.entries()) {
    try {
      const byteBudget = calculateProcessedImageBudget(preparedBytes, files.length - index);
      const image = await prepareOne(file, byteBudget);
      prepared.push(image);
      preparedBytes += image.byteLength;
    } catch (cause) {
      if (cause instanceof ImagePreparationError) throw cause;
      throw new ImagePreparationError(`「${file.name}」を読み込めませんでした。別の画像をお試しください。`);
    }
  }
  if (preparedBytes > IMAGE_LIMITS.maxProcessedBytes) {
    throw new ImagePreparationError("変換後の画像サイズが上限を超えました。枚数を減らしてください。");
  }
  return prepared;
}

export async function prepareRecipeImage(file: File): Promise<PreparedImage> {
  validateImageFiles([file]);
  try {
    return await prepareOne(file, 300 * 1024);
  } catch (cause) {
    if (cause instanceof ImagePreparationError) throw cause;
    throw new ImagePreparationError("料理画像を読み込めませんでした。別の画像をお試しください。");
  }
}
