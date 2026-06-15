export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export function validateProductImage(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageValidationError("Only JPEG, PNG, or WebP images are allowed.");
  }
  if (file.size > MAX_BYTES) {
    throw new ImageValidationError("Image must be smaller than 5 MB.");
  }
}
