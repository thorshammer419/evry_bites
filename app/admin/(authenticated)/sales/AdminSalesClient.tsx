"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "../../../../lib/trpc/react";
import type { GroupBy, Granularity, SalesReportRow } from "../../../../lib/sales-report";

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

type PaymentMethodFilter = "venmo" | "paypal" | "cash" | "check";
type ChannelFilter = "point_of_sale" | "customer_web";

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethodFilter | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
];

const CHANNEL_OPTIONS: { value: ChannelFilter | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "point_of_sale", label: "POS" },
  { value: "customer_web", label: "Customer Web" },
];

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "paymentMethod", label: "Payment Method" },
  { value: "product", label: "Product" },
  { value: "channel", label: "Channel" },
];

// The table's group-by category value is a raw payment method / channel /
// product id — look up the same human label already defined for the
// matching filter (or the product list) rather than duplicating labels.
function groupRowLabel(groupBy: GroupBy, groupKey: string | null, productNameById: Map<string, string>): string {
  if (groupKey === null) return "";
  if (groupBy === "paymentMethod") {
    return PAYMENT_METHOD_OPTIONS.find((o) => o.value === groupKey)?.label ?? groupKey;
  }
  if (groupBy === "channel") {
    return CHANNEL_OPTIONS.find((o) => o.value === groupKey)?.label ?? groupKey;
  }
  if (groupBy === "product") {
    return productNameById.get(groupKey) ?? groupKey;
  }
  return "";
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function pillClass(active: boolean): string {
  return `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
    active ? "bg-blue-900 text-white" : "border border-sky-200 text-blue-700 hover:bg-sky-50"
  }`;
}

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
        <button key={o.value} onClick={() => onChange(o.value)} className={pillClass(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MultiPillGroup<T extends string>({
  options,
  values,
  onToggle,
}: {
  options: { value: T; label: string }[];
  values: Set<T>;
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button key={o.value} onClick={() => onToggle(o.value)} className={pillClass(values.has(o.value))}>
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
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodFilter | "">("");
  const [channel, setChannel] = useState<ChannelFilter | "">("");
  const [productFilter, setProductFilter] = useState<Set<string>>(new Set());
  const [nameInput, setNameInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounce the free-text name search so it doesn't fire a query on every
  // keystroke — filtering happens at the database, unlike the Orders page's
  // client-side search.
  useEffect(() => {
    const timeout = setTimeout(() => setCustomerName(nameInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [nameInput]);

  const { data: products } = trpc.products.listAll.useQuery();
  const productOptions = (products ?? []).map((p) => ({ value: p.id, label: p.name }));
  const productNameById = new Map(productOptions.map((p) => [p.value, p.label]));

  const hasDateRange = Boolean(dateFrom && dateTo);
  const hasAnyFilter =
    Boolean(paymentMethod) ||
    Boolean(channel) ||
    productFilter.size > 0 ||
    Boolean(customerName) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  function clearFilters() {
    setPaymentMethod("");
    setChannel("");
    setProductFilter(new Set());
    setNameInput("");
    setDateFrom("");
    setDateTo("");
  }

  const filterInput = {
    granularity,
    ...(paymentMethod && { paymentMethod }),
    ...(channel && { channel }),
    ...(productFilter.size > 0 && { productIds: Array.from(productFilter) }),
    ...(customerName && { customerName }),
    ...(hasDateRange && { dateFrom, dateTo }),
  };

  const { data: rows, isLoading, isError } = trpc.sales.report.useQuery({ ...filterInput, groupBy });

  // The chart always shows one ungrouped time series regardless of the
  // table's group-by — grouped rows can't be safely summed back into it (a
  // product-grouped row's sales revenue is its own line item's subtotal,
  // which needn't add up to the order total the ungrouped view uses) — so a
  // second, always-ungrouped query feeds the chart whenever grouping is on.
  const { data: ungroupedRows } = trpc.sales.report.useQuery(
    { ...filterInput, groupBy: "none" },
    { enabled: groupBy !== "none" }
  );
  const chartRows = groupBy === "none" ? rows : ungroupedRows;

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

        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide">Filters</p>
            {hasAnyFilter && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-900 underline">
                Clear all filters
              </button>
            )}
          </div>

          <input
            type="search"
            placeholder="Search by customer name…"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="w-full rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <span className="text-sky-400 text-sm shrink-0">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-blue-600 hover:text-blue-900 shrink-0 underline"
              >
                Clear
              </button>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">
              Payment Method
            </p>
            <PillGroup options={PAYMENT_METHOD_OPTIONS} value={paymentMethod} onChange={setPaymentMethod} />
          </div>

          <div>
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">
              Sales Channel
            </p>
            <PillGroup options={CHANNEL_OPTIONS} value={channel} onChange={setChannel} />
          </div>

          {productOptions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">
                Products
              </p>
              <MultiPillGroup
                options={productOptions}
                values={productFilter}
                onToggle={(id) => setProductFilter((prev) => toggleSet(prev, id))}
              />
            </div>
          )}
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">
            Group By
          </p>
          <PillGroup options={GROUP_BY_OPTIONS} value={groupBy} onChange={setGroupBy} />
        </div>

        {chartRows && chartRows.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">
              Chart Metric
            </p>
            <div className="mb-3">
              <PillGroup options={CHART_METRICS} value={chartMetric} onChange={setChartMetric} />
            </div>
            <SalesChart rows={chartRows} metric={chartMetric} />
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
                  {groupBy !== "none" && <th className="px-4 py-3">Group</th>}
                  <th className="px-4 py-3 text-right">Sales</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Refunds</th>
                  <th className="px-4 py-3 text-right">Refunded</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.periodStart}::${row.groupKey ?? ""}`} className="border-b border-sky-50 last:border-b-0 text-blue-900">
                    <td className="px-4 py-3 whitespace-nowrap">{row.periodLabel}</td>
                    {groupBy !== "none" && (
                      <td className="px-4 py-3 whitespace-nowrap">{groupRowLabel(groupBy, row.groupKey, productNameById)}</td>
                    )}
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
