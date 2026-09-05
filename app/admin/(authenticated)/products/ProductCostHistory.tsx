"use client";

import { useState } from "react";
import { trpc } from "../../../../lib/trpc/react";

function formatCurrency(amount: unknown): string {
  return `$${Number(amount).toFixed(2)}`;
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ProductCostHistory({ productId }: { productId: string }) {
  const utils = trpc.useUtils();
  const { data: records, isLoading } = trpc.products.listCostHistory.useQuery({ productId });
  const [costPerBatch, setCostPerBatch] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");

  const addCostRecord = trpc.products.addCostRecord.useMutation({
    onSuccess: () => {
      setCostPerBatch("");
      setEffectiveFrom("");
      utils.products.listCostHistory.invalidate({ productId });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addCostRecord.mutate({ productId, costPerBatch, effectiveFrom });
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-blue-900 mb-1">Cost History</h2>
      <p className="text-sm text-blue-600 mb-4">
        What this product costs to make per batch, over time. Past records never change —
        add a new one to reflect a cost change.
      </p>

      {isLoading && <p className="text-sm text-sky-500 mb-4">Loading…</p>}

      {records && records.length === 0 && (
        <p className="text-sm text-sky-500 mb-4">No cost records yet.</p>
      )}

      {records && records.length > 0 && (
        <ul className="mb-4 divide-y divide-sky-50">
          {records.map((record) => (
            <li key={record.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-blue-900">{formatCurrency(record.costPerBatch)}</span>
              <span className="text-sky-500">effective {formatDate(record.effectiveFrom)}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="newCostPerBatch" className="block text-xs font-medium text-blue-900 mb-1">
            Cost per Batch ($)
          </label>
          <input
            id="newCostPerBatch"
            type="number"
            step="0.01"
            min="0"
            required
            value={costPerBatch}
            onChange={(e) => setCostPerBatch(e.target.value)}
            className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="0.00"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="newEffectiveFrom" className="block text-xs font-medium text-blue-900 mb-1">
            Effective From
          </label>
          <input
            id="newEffectiveFrom"
            type="date"
            required
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <button
          type="submit"
          disabled={addCostRecord.isPending}
          className="px-4 py-2 rounded-xl bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 active:bg-blue-950 transition-colors disabled:opacity-60"
        >
          {addCostRecord.isPending ? "Adding…" : "Add"}
        </button>
      </form>

      {addCostRecord.isError && (
        <p className="mt-2 text-sm text-red-600">{addCostRecord.error.message}</p>
      )}
    </div>
  );
}
