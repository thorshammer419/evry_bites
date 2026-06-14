"use client";

import { useState } from "react";
import Link from "next/link";

interface ProductFormProps {
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    name?: string;
    description?: string;
    price?: string;
    batchSize?: number;
    unitLabel?: string;
    imageUrl?: string | null;
    active?: boolean;
  };
  submitLabel?: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export default function ProductForm({
  action,
  defaultValues = {},
  submitLabel = "Save Product",
}: ProductFormProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultValues.imageUrl ?? null
  );
  const [fileError, setFileError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("Only JPEG, PNG, or WebP images are allowed.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("Image must be smaller than 5 MB.");
      e.target.value = "";
      return;
    }

    setFileError(null);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <form action={action} encType="multipart/form-data" className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-amber-900 mb-1">
          Product Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues.name ?? ""}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          placeholder="e.g. Chocolate Chip Cookies"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-amber-900 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          defaultValue={defaultValues.description ?? ""}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          placeholder="Describe this product..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-amber-900 mb-1">
            Price ($)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={defaultValues.price ?? ""}
            className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="0.00"
          />
        </div>

        <div>
          <label htmlFor="batchSize" className="block text-sm font-medium text-amber-900 mb-1">
            Batch Size
          </label>
          <input
            id="batchSize"
            name="batchSize"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={defaultValues.batchSize ?? ""}
            className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="12"
          />
        </div>
      </div>

      <div>
        <label htmlFor="unitLabel" className="block text-sm font-medium text-amber-900 mb-1">
          Unit Label
        </label>
        <input
          id="unitLabel"
          name="unitLabel"
          type="text"
          required
          defaultValue={defaultValues.unitLabel ?? ""}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          placeholder="e.g. dozen, box, bag"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-amber-900 mb-1">
          Product Image <span className="text-amber-500 font-normal">(optional)</span>
        </label>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Product preview"
            className="mb-3 h-32 w-32 rounded-xl object-cover border border-amber-200"
          />
        )}

        <input
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-amber-800 file:px-3 file:py-1 file:text-sm file:text-white file:cursor-pointer"
        />

        {fileError && (
          <p className="mt-1 text-sm text-red-600">{fileError}</p>
        )}

        <input type="hidden" name="currentImageUrl" value={defaultValues.imageUrl ?? ""} />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="active"
          name="active"
          type="checkbox"
          defaultChecked={defaultValues.active ?? true}
          className="h-5 w-5 rounded border-amber-300 text-amber-800 focus:ring-amber-400"
        />
        <label htmlFor="active" className="text-sm font-medium text-amber-900">
          Active (visible to customers)
        </label>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <button
          type="submit"
          className="w-full bg-amber-800 text-white px-4 py-3 rounded-xl font-semibold hover:bg-amber-700 active:bg-amber-900 transition-colors"
        >
          {submitLabel}
        </button>
        <Link
          href="/admin/products"
          className="w-full text-center border border-amber-200 text-amber-800 px-4 py-3 rounded-xl font-medium hover:bg-amber-50 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
