export const MAX_SCREENSHOT_FILES = 6;
export const MAX_SCREENSHOT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SCREENSHOT_TOTAL_BYTES = 20 * 1024 * 1024;
export const ALLOWED_SCREENSHOT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export interface ScreenshotFileLike {
  name?: string;
  size: number;
  type: string;
}

export type ScreenshotValidationCode =
  | "empty"
  | "too_many_files"
  | "unsupported_type"
  | "invalid_size"
  | "file_too_large"
  | "total_too_large";

export interface ScreenshotValidationError {
  code: ScreenshotValidationCode;
  message: string;
  index?: number;
}

export type ScreenshotValidationResult =
  | { valid: true; totalBytes: number }
  | { valid: false; totalBytes: number; errors: ScreenshotValidationError[] };

export function validateScreenshotFiles(
  files: readonly ScreenshotFileLike[],
): ScreenshotValidationResult {
  const errors: ScreenshotValidationError[] = [];
  if (!files.length) {
    errors.push({ code: "empty", message: "スクリーンショットを1枚以上選択してください" });
  }
  if (files.length > MAX_SCREENSHOT_FILES) {
    errors.push({
      code: "too_many_files",
      message: `スクリーンショットは${MAX_SCREENSHOT_FILES}枚まで選択できます`,
    });
  }

  let totalBytes = 0;
  files.forEach((file, index) => {
    const size = Number(file.size);
    if (!Number.isFinite(size) || size <= 0) {
      errors.push({ code: "invalid_size", index, message: "空または不正な画像ファイルです" });
    } else {
      totalBytes += size;
      if (size > MAX_SCREENSHOT_FILE_BYTES) {
        errors.push({
          code: "file_too_large",
          index,
          message: `画像1枚の上限は${MAX_SCREENSHOT_FILE_BYTES / 1024 / 1024}MBです`,
        });
      }
    }

    const mimeType = String(file.type || "").toLocaleLowerCase();
    if (!ALLOWED_SCREENSHOT_MIME_TYPES.includes(mimeType as (typeof ALLOWED_SCREENSHOT_MIME_TYPES)[number])) {
      errors.push({
        code: "unsupported_type",
        index,
        message: "JPEG、PNG、WebP、HEICの画像だけ利用できます",
      });
    }
  });

  if (totalBytes > MAX_SCREENSHOT_TOTAL_BYTES) {
    errors.push({
      code: "total_too_large",
      message: `画像の合計サイズ上限は${MAX_SCREENSHOT_TOTAL_BYTES / 1024 / 1024}MBです`,
    });
  }

  return errors.length ? { valid: false, totalBytes, errors } : { valid: true, totalBytes };
}

