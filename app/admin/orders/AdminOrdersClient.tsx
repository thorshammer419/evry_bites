"use client";

import { useState } from "react";
import type { FulfillmentType, OrderStatus, PaymentMethod } from "@prisma/client";
import Link from "next/link";
import { trpc } from "../../../lib/trpc/react";

type OrderWithItems = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  address: string | null;
  paymentMethod: PaymentMethod;
  notes: string | null;
  status: OrderStatus;
  totalAmount: unknown;
  createdAt: Date;
  orderItems: {
    id: string;
    quantity: number;
    unitPrice: unknown;
    subtotal: unknown;
    product: { name: string; unitLabel: string };
  }[];
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: "Received",
  confirmed: "Confirmed",
  ready: "Ready",
  shipped: "Shipped",
  delivered: "Delivered",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  received: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  ready: "bg-purple-100 text-purple-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  venmo: "Venmo",
  paypal: "PayPal",
  cash: "Cash on Delivery",
  check: "Check on Delivery",
};

function nextActions(
  status: OrderStatus,
  fulfillmentType: FulfillmentType
): { label: string; next: "confirmed" | "ready" | "shipped" | "delivered" }[] {
  if (status === "received") return [{ label: "Mark as Confirmed", next: "confirmed" }];
  if (status === "confirmed") return [{ label: "Mark as Ready", next: "ready" }];
  if (status === "ready") {
    return fulfillmentType === "local_delivery"
      ? [{ label: "Mark as Delivered", next: "delivered" }]
      : [{ label: "Mark as Shipped", next: "shipped" }];
  }
  return [];
}

function OrderRow({ order }: { order: OrderWithItems }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: () => utils.orders.listAll.invalidate(),
  });

  const actions = nextActions(order.status, order.fulfillmentType);
  const ref = order.id.slice(0, 8).toUpperCase();
  const date = new Date(order.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
      <button
        className="w-full text-left px-4 py-4 flex items-start gap-3"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-amber-900">#{ref}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status]}`}
            >
              {STATUS_LABELS[order.status]}
            </span>
          </div>
          <p className="text-sm text-amber-700 mt-0.5">{order.customerName}</p>
          <p className="text-xs text-amber-500 mt-0.5">
            {order.fulfillmentType === "local_delivery" ? "Local Delivery" : "Shipping"} · {date}
          </p>
        </div>
        <span className="text-amber-400 text-sm mt-1">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-amber-100 px-4 pb-4 space-y-4">
          {/* Contact */}
          <div className="pt-3">
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-2">
              Customer
            </p>
            <p className="text-sm text-amber-900">{order.customerName}</p>
            <p className="text-sm text-amber-700">{order.customerEmail}</p>
            <p className="text-sm text-amber-700">{order.customerPhone}</p>
            {order.address && (
              <p className="text-sm text-amber-700 mt-1">{order.address}</p>
            )}
          </div>

          {/* Order items */}
          <div>
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-2">
              Items
            </p>
            <div className="space-y-1">
              {order.orderItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-amber-800">
                    {item.product.name}{" "}
                    <span className="text-amber-500">
                      × {item.quantity} {item.product.unitLabel}
                    </span>
                  </span>
                  <span className="font-medium text-amber-900">
                    ${Number(item.subtotal).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-semibold text-amber-900 border-t border-amber-100 mt-2 pt-2">
              <span>Total</span>
              <span>${Number(order.totalAmount).toFixed(2)}</span>
            </div>
          </div>

          {/* Payment + notes */}
          <div className="text-sm text-amber-700 space-y-1">
            <p>
              <span className="font-medium text-amber-900">Payment:</span>{" "}
              {PAYMENT_LABELS[order.paymentMethod]}
            </p>
            {order.notes && (
              <p>
                <span className="font-medium text-amber-900">Notes:</span>{" "}
                {order.notes}
              </p>
            )}
          </div>

          {/* Actions */}
          {actions.length > 0 && (
            <div className="space-y-2 pt-1">
              {actions.map((action) => (
                <button
                  key={action.next}
                  onClick={() =>
                    updateStatus.mutate({ id: order.id, status: action.next })
                  }
                  disabled={updateStatus.isPending}
                  className="w-full bg-amber-800 text-white px-4 py-3 rounded-xl font-semibold text-sm hover:bg-amber-700 active:bg-amber-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {updateStatus.isPending ? "Updating..." : action.label}
                </button>
              ))}
            </div>
          )}

          {updateStatus.isError && (
            <p className="text-sm text-red-600">
              {updateStatus.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminOrdersClient() {
  const { data: orders, isLoading, isError } = trpc.orders.listAll.useQuery();

  return (
    <div className="min-h-screen bg-amber-50 px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-amber-900">Orders</h1>
            {orders && (
              <p className="text-sm text-amber-600 mt-0.5">
                {orders.length} total
              </p>
            )}
          </div>
          <Link
            href="/admin/products"
            className="border border-amber-200 text-amber-800 px-3 py-2 rounded-xl text-sm font-medium hover:bg-amber-50 transition-colors"
          >
            Products →
          </Link>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-amber-500">
            <p className="text-3xl mb-3">⏳</p>
            <p className="text-sm">Loading orders…</p>
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">
            Failed to load orders. Please refresh.
          </div>
        )}

        {orders && orders.length === 0 && (
          <div className="text-center py-16 text-amber-500">
            <p className="text-3xl mb-3">🧾</p>
            <p className="font-medium">No orders yet</p>
            <p className="text-sm mt-1">New orders will appear here</p>
          </div>
        )}

        {orders && orders.length > 0 && (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
