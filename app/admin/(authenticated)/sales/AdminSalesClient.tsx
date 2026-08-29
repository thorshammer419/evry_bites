"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "../../../../lib/trpc/react";
import type { Granularity, SalesReportRow } from "../../../../lib/sales-report";

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

type ChartMetric = "salesCount" | "salesRevenue" | "refundsCount" | "refundsTotal";

// Net revenue can go negative (a bucket with refunds but no sales) — unlike
// every other money value in this codebase, which is always non-negative.
function formatCurrency(amount: number): string {
  return amount < 0 ? `-$${(-amount).toFixed(2)}` : `$${amount.toFixed(2)}`;
}

const CHART_METRICS: { value: ChartMetric; label: string; format: (n: number) => string }[] = [
  { value: "salesCount", label: "Sales Count", format: String },
  { value: "salesRevenue", label: "Sales Revenue", format: formatCurrency },
  { value: "refundsCount", label: "Refunds Count", format: String },
  { value: "refundsTotal", label: "Refunds Total", format: formatCurrency },
];

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === o.value
              ? "bg-blue-900 text-white"
              : "border border-sky-200 text-blue-700 hover:bg-sky-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SalesChart({ rows, metric }: { rows: SalesReportRow[]; metric: ChartMetric }) {
  const { label, format } = CHART_METRICS.find((m) => m.value === metric)!;

  return (
    <div className="rounded-2xl border border-sky-100 bg-white shadow-sm p-4 mb-4">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0f2fe" />
          <XAxis
            dataKey="periodLabel"
            tick={{ fontSize: 11, fill: "#7dd3fc" }}
            axisLine={{ stroke: "#e0f2fe" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#7dd3fc" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={format}
            width={64}
          />
          <Tooltip
            formatter={(value) => [format(Number(value)), label]}
            labelStyle={{ color: "#1e3a8a" }}
            contentStyle={{ borderRadius: 12, borderColor: "#e0f2fe", fontSize: 12 }}
          />
          <Bar dataKey={metric} name={label} fill="#1e3a8a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdminSalesClient() {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("salesRevenue");
  const { data: rows, isLoading, isError } = trpc.sales.report.useQuery({ granularity });

  return (
    <div className="px-4 py-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-blue-900 mb-4">Sales</h1>

        <div className="mb-4">
          <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">
            Granularity
          </p>
          <PillGroup options={GRANULARITIES} value={granularity} onChange={setGranularity} />
        </div>

        {rows && rows.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">
              Chart Metric
            </p>
            <div className="mb-3">
              <PillGroup options={CHART_METRICS} value={chartMetric} onChange={setChartMetric} />
            </div>
            <SalesChart rows={rows} metric={chartMetric} />
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16 text-sky-500">
            <p className="text-3xl mb-3">⏳</p>
            <p className="text-sm">Loading sales report…</p>
          </div>
        )}
        {isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">
            Failed to load sales report. Please refresh.
          </div>
        )}
        {rows && rows.length === 0 && (
          <div className="text-center py-16 text-sky-500">
            <p className="text-sm">No sales yet.</p>
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-sky-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sky-100 text-left text-xs font-semibold text-sky-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Sales</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Refunds</th>
                  <th className="px-4 py-3 text-right">Refunded</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.periodStart} className="border-b border-sky-50 last:border-b-0 text-blue-900">
                    <td className="px-4 py-3 whitespace-nowrap">{row.periodLabel}</td>
                    <td className="px-4 py-3 text-right">{row.salesCount}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.salesRevenue)}</td>
                    <td className="px-4 py-3 text-right">{row.refundsCount}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.refundsTotal)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.netRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
