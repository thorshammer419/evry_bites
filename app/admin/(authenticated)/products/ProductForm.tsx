"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { validateProductImage, ImageValidationError } from "../../../../lib/product-image";

type ActionState = { error?: string } | null;

interface ProductFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  defaultValues?: {
    name?: string;
    description?: string;
    price?: string;
    batchSize?: number;
    unitLabel?: string;
    imageUrl?: string | null;
    active?: boolean;
    ingredients?: string | null;
    supplyCostPerBatch?: string | null;
    unitsAvailable?: number | null;
  };
  submitLabel?: string;
}

export default function ProductForm({
  action,
  defaultValues = {},
  submitLabel = "Save Product",
}: ProductFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultValues.imageUrl ?? null
  );
  const [fileError, setFileError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validateProductImage(file);
    } catch (err) {
      if (err instanceof ImageValidationError) {
        setFileError(err.message);
        e.target.value = "";
        return;
      }
      throw err;
    }

    setFileError(null);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-blue-900 mb-1">
          Product Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues.name ?? ""}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder="e.g. Chocolate Chip Cookies"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-blue-900 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          defaultValue={defaultValues.description ?? ""}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          placeholder="Describe this product..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-blue-900 mb-1">
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
            className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="0.00"
          />
        </div>

        <div>
          <label htmlFor="batchSize" className="block text-sm font-medium text-blue-900 mb-1">
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
            className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="12"
          />
        </div>
      </div>

      <div>
        <label htmlFor="unitLabel" className="block text-sm font-medium text-blue-900 mb-1">
          Unit Label
        </label>
        <input
          id="unitLabel"
          name="unitLabel"
          type="text"
          required
          defaultValue={defaultValues.unitLabel ?? ""}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder="e.g. dozen, box, bag"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-blue-900 mb-1">
          Product Image <span className="text-sky-500 font-normal">(optional)</span>
        </label>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Product preview"
            className="mb-3 h-32 w-32 rounded-xl object-cover border border-sky-200"
          />
        )}

        <input
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-blue-900 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-900 file:px-3 file:py-1 file:text-sm file:text-white file:cursor-pointer"
        />

        {fileError && (
          <p className="mt-1 text-sm text-red-600">{fileError}</p>
        )}

        <input type="hidden" name="currentImageUrl" value={defaultValues.imageUrl ?? ""} />
      </div>

      <div>
        <label htmlFor="ingredients" className="block text-sm font-medium text-blue-900 mb-1">
          Ingredients <span className="text-sky-500 font-normal">(optional)</span>
        </label>
        <textarea
          id="ingredients"
          name="ingredients"
          rows={3}
          defaultValue={defaultValues.ingredients ?? ""}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          placeholder="e.g. flour, sugar, butter, eggs, vanilla extract (contains gluten, dairy, eggs)"
        />
      </div>

      <div>
        <label htmlFor="supplyCostPerBatch" className="block text-sm font-medium text-blue-900 mb-1">
          Supply Cost per Batch ($) <span className="text-sky-500 font-normal">(optional)</span>
        </label>
        <input
          id="supplyCostPerBatch"
          name="supplyCostPerBatch"
          type="number"
          step="0.01"
          min="0"
          defaultValue={defaultValues.supplyCostPerBatch ?? ""}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder="0.00"
        />
      </div>

      <div>
        <label htmlFor="unitsAvailable" className="block text-sm font-medium text-blue-900 mb-1">
          Units Available <span className="text-sky-500 font-normal">(leave blank for unlimited)</span>
        </label>
        <input
          id="unitsAvailable"
          name="unitsAvailable"
          type="number"
          min="0"
          step="1"
          defaultValue={defaultValues.unitsAvailable != null ? String(defaultValues.unitsAvailable) : ""}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          placeholder="Unlimited"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="active"
          name="active"
          type="checkbox"
          defaultChecked={defaultValues.active ?? true}
          className="h-5 w-5 rounded border-sky-300 text-blue-800 focus:ring-sky-400"
        />
        <label htmlFor="active" className="text-sm font-medium text-blue-900">
          Active (visible to customers)
        </label>
      </div>

      {state?.error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-900 text-white px-4 py-3 rounded-xl font-semibold hover:bg-blue-800 active:bg-blue-950 transition-colors disabled:opacity-60"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
        <Link
          href="/admin/products"
          className="w-full text-center border border-sky-200 text-blue-800 px-4 py-3 rounded-xl font-medium hover:bg-sky-50 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
