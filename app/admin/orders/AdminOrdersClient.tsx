"use client";

import { useState } from "react";
import type { FulfillmentType, OrderStatus, PaymentMethod, PaymentLinkChannel, Prisma } from "@prisma/client";
import { trpc } from "../../../lib/trpc/react";
import { nextStatus, previousStatus, isTerminal, isCancelledOrRefunded, REFUND_STATUSES } from "../../../lib/order-lifecycle";
import { balanceDue } from "../../../lib/payments";

type OrderWithItems = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  paymentMethod: PaymentMethod;
  notes: string | null;
  status: OrderStatus;
  totalAmount: Prisma.Decimal;
  cashCollected: Prisma.Decimal | null;
  paypalCaptureId: string | null;
  createdAt: Date;
  orderItems: {
    id: string;
    quantity: number;
    unitPrice: unknown;
    subtotal: unknown;
    product: { name: string; unitLabel: string };
  }[];
  customPaymentRequests: {
    id: string;
    amount: Prisma.Decimal;
    channel: PaymentLinkChannel;
    paypalCaptureId: string | null;
    paid: boolean;
    createdAt: Date;
  }[];
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Pending Payment",
  received: "Received",
  processing: "Processing",
  ready: "Ready",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending_payment: "bg-gray-100 text-gray-600",
  received: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  ready: "bg-purple-100 text-purple-800",
  shipped: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-orange-100 text-orange-700",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  venmo: "Venmo",
  paypal: "PayPal",
  cash: "Cash or Check on Delivery",
  check: "Cash or Check on Delivery",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as OrderStatus[];

function getStatusLabel(order: OrderWithItems): string {
  if (order.status === "shipped" && order.fulfillmentType === "local_delivery") {
    return "Out for Delivery";
  }
  return STATUS_LABELS[order.status];
}

function getForwardLabel(order: OrderWithItems, next: OrderStatus): string {
  if (next === "shipped" && order.fulfillmentType === "local_delivery") return "Mark as Out for Delivery";
  if (next === "delivered") return "Mark as Delivered";
  if (next === "shipped") return "Mark as Shipped";
  if (next === "ready") return "Mark as Ready";
  if (next === "processing") return "Mark as Processing";
  if (next === "received") return "Mark as Received";
  return `Mark as ${STATUS_LABELS[next]}`;
}

function getBackwardLabel(order: OrderWithItems, prev: OrderStatus): string {
  if (prev === "ready") return "Back to Ready";
  if (prev === "shipped") return order.fulfillmentType === "local_delivery" ? "Back to Out for Delivery" : "Back to Shipped";
  if (prev === "processing") return "Back to Processing";
  if (prev === "received") return "Back to Received";
  return `Back to ${STATUS_LABELS[prev]}`;
}

function matchesSearch(order: OrderWithItems, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = [order.firstName, order.lastName].filter(Boolean).join(" ").toLowerCase();
  return (
    name.includes(q) ||
    order.customerEmail.toLowerCase().includes(q) ||
    order.id.toLowerCase().includes(q) ||
    order.id.slice(0, 8).toUpperCase().includes(query.toUpperCase())
  );
}

// ── Modals ─────────────────────────────────────────────────────────────────

function CancelRefundModal({
  isRefund,
  onConfirm,
  onClose,
  isPending,
}: {
  isRefund: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  const title = isRefund ? "Refund Order?" : "Cancel Order?";
  const confirmLabel = isRefund ? "Refund Order" : "Cancel Order";
  const pendingLabel = isRefund ? "Refunding..." : "Cancelling...";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-1">{title}</h2>
        <p className="text-sm text-blue-700 mb-4">The customer will be notified. This cannot be undone.</p>
        <label className="block text-sm font-medium text-blue-800 mb-1">
          Reason <span className="text-sky-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={isRefund ? "e.g. Customer returned order" : "e.g. Item no longer available"}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} disabled={isPending}
            className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors disabled:opacity-60">
            Keep Order
          </button>
          <button onClick={() => onConfirm(reason)} disabled={isPending}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60">
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type AutoRefundedItem = { channel: "paypal"; amount: number };
type ManualReturnItem = { channel: "cash" | "venmo" | "paypal"; amount: number; detail?: string };

function CancellationSummaryModal({ isRefund, autoRefunded, manualReturn, onClose }: {
  isRefund: boolean;
  autoRefunded: AutoRefundedItem[];
  manualReturn: ManualReturnItem[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-3">Order {isRefund ? "Refunded" : "Cancelled"}</h2>
        {autoRefunded.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Refunded automatically</p>
            <div className="bg-emerald-50 rounded-xl p-3 space-y-1">
              {autoRefunded.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-emerald-800">
                  <span>PayPal</span>
                  <span className="font-semibold">${item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {manualReturn.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Return manually</p>
            <div className="bg-amber-50 rounded-xl p-3 space-y-1">
              {manualReturn.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-amber-800">
                  <span>{PAYMENT_LABELS[item.channel]}{item.detail ? ` (${item.detail})` : ""}</span>
                  <span className="font-semibold">${item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={onClose}
          className="w-full bg-blue-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors">
          Got it
        </button>
      </div>
    </div>
  );
}

function ConfirmDeliveryModal({ onConfirm, onClose, isPending }: {
  onConfirm: () => void; onClose: () => void; isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-1">Mark as Delivered</h2>
        <p className="text-sm text-blue-700 mb-4">Confirm this order has been delivered to the customer?</p>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={isPending}
            className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors disabled:opacity-60">
            Go Back
          </button>
          <button onClick={onConfirm} disabled={isPending}
            className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60">
            {isPending ? "Updating..." : "Mark as Delivered"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CashDeliveryModal({ total, priorCollected, onConfirm, onClose, isPending }: {
  total: number; priorCollected: number | null;
  onConfirm: (amount: string) => void; onClose: () => void; isPending: boolean;
}) {
  const [input, setInput] = useState(priorCollected !== null ? priorCollected.toFixed(2) : "");
  const parsed = parseFloat(input);
  const isValid = !isNaN(parsed) && parsed >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-1">Mark as Delivered</h2>
        <p className="text-sm text-blue-700 mb-1">
          Order total: <span className="font-semibold">${total.toFixed(2)}</span>
        </p>
        <p className="text-sm text-blue-700 mb-3">How much cash did you collect?</p>
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-700 font-medium">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={total.toFixed(2)}
            className="w-full rounded-xl border border-sky-200 bg-sky-50 pl-7 pr-3 py-2.5 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={isPending}
            className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors disabled:opacity-60">
            Go Back
          </button>
          <button onClick={() => onConfirm(parsed.toFixed(2))} disabled={!isValid || isPending}
            className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {isPending ? "Updating..." : "Mark as Delivered"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogCashModal({ total, current, onConfirm, onClose, isPending }: {
  total: number; current: number | null;
  onConfirm: (amount: string) => void; onClose: () => void; isPending: boolean;
}) {
  const [input, setInput] = useState(current !== null ? current.toFixed(2) : "");
  const parsed = parseFloat(input);
  const isValid = !isNaN(parsed) && parsed >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-1">Log Cash Received</h2>
        <p className="text-sm text-blue-700 mb-1">
          Order total: <span className="font-semibold">${total.toFixed(2)}</span>
        </p>
        {current !== null && (
          <p className="text-sm text-sky-500 mb-3">Previously logged: ${current.toFixed(2)}</p>
        )}
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-700 font-medium">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={total.toFixed(2)}
            className="w-full rounded-xl border border-sky-200 bg-sky-50 pl-7 pr-3 py-2.5 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={isPending}
            className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors disabled:opacity-60">
            Cancel
          </button>
          <button onClick={() => onConfirm(parsed.toFixed(2))} disabled={!isValid || isPending}
            className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualStatusModal({ currentStatus, onConfirm, onClose, isPending }: {
  currentStatus: OrderStatus;
  onConfirm: (status: OrderStatus) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const options = ALL_STATUSES.filter((s) => s !== currentStatus);
  const [selected, setSelected] = useState<OrderStatus>(options[0]);
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
          <h2 className="text-lg font-bold text-blue-900 mb-1">Are you sure?</h2>
          <p className="text-sm text-blue-700 mb-4">
            Manually set this order to{" "}
            <span className="font-semibold">{STATUS_LABELS[selected]}</span>?
            This bypasses the normal order progression and does not trigger payment actions.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmed(false)} disabled={isPending}
              className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors disabled:opacity-60">
              Go Back
            </button>
            <button onClick={() => onConfirm(selected)} disabled={isPending}
              className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60">
              {isPending ? "Updating..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-1">Manual Status Override</h2>
        <p className="text-sm text-blue-700 mb-3">
          Current: <span className="font-semibold">{STATUS_LABELS[currentStatus]}</span>
        </p>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as OrderStatus)}
          className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400 mb-4"
        >
          {options.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => setConfirmed(true)}
            className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePaymentModal({ currentMethod, onConfirm, onClose, isPending }: {
  currentMethod: PaymentMethod;
  onConfirm: (method: PaymentMethod) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const normalizedCurrent = currentMethod === "check" ? "cash" : currentMethod;
  const options = (["venmo", "paypal", "cash"] as PaymentMethod[]).filter((m) => m !== normalizedCurrent);
  const [selected, setSelected] = useState<PaymentMethod>(options[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-1">Change Payment Method</h2>
        <p className="text-sm text-blue-700 mb-4">
          The order will reset to <span className="font-semibold">Pending Payment</span> so the customer can pay via the new method.
        </p>
        <div className="space-y-2 mb-4">
          {options.map((m) => (
            <label key={m}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                selected === m ? "border-blue-900 bg-sky-50" : "border-sky-200 hover:bg-sky-50"
              }`}>
              <input type="radio" name="paymentMethod" value={m} checked={selected === m}
                onChange={() => setSelected(m)} className="accent-blue-900" />
              <span className="text-sm font-medium text-blue-900">{PAYMENT_LABELS[m]}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} disabled={isPending}
            className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors disabled:opacity-60">
            Cancel
          </button>
          <button onClick={() => onConfirm(selected)} disabled={isPending}
            className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60">
            {isPending ? "Updating..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestRemainingBalanceModal({ amountOwed, onConfirm, onClose, isPending }: {
  amountOwed: number;
  onConfirm: (channel: "paypal" | "venmo", amount: number) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [channel, setChannel] = useState<"paypal" | "venmo">("paypal");
  const [rawAmount, setRawAmount] = useState(amountOwed.toFixed(2));
  const parsed = parseFloat(rawAmount);
  const valid = !isNaN(parsed) && parsed > 0;
  const isVenmo = channel === "venmo";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-blue-900 mb-1">Request Remaining Balance</h2>
        <p className="text-sm text-blue-700 mb-4">
          Choose how to collect the rest of what&apos;s owed. The customer will receive an email with a {isVenmo ? "Venmo payment link" : "link to pay via PayPal"}.{" "}
          {isVenmo
            ? "Venmo payments are not tracked automatically — mark the request received once payment comes in."
            : <>The order will advance to <span className="font-semibold">Received</span> automatically once the full amount is collected.</>}
        </p>
        <div className="flex gap-2 mb-4">
          {(["paypal", "venmo"] as const).map((c) => (
            <label key={c}
              className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                channel === c ? "border-blue-900 bg-sky-50" : "border-sky-200 hover:bg-sky-50"
              }`}>
              <input type="radio" name="requestChannel" value={c} checked={channel === c}
                onChange={() => setChannel(c)} className="accent-blue-900" />
              <span className="text-sm font-medium text-blue-900">{c === "paypal" ? "PayPal" : "Venmo"}</span>
            </label>
          ))}
        </div>
        <label className="block text-sm font-medium text-blue-900 mb-1">Amount ($)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={rawAmount}
          onChange={(e) => setRawAmount(e.target.value)}
          className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm text-blue-900 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <div className="flex gap-2">
          <button onClick={onClose} disabled={isPending}
            className="flex-1 border border-sky-200 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-50 transition-colors disabled:opacity-60">
            Cancel
          </button>
          <button onClick={() => valid && onConfirm(channel, parsed)} disabled={isPending || !valid}
            className="flex-1 bg-blue-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60">
            {isPending ? "Sending..." : "Send Link"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order Row ───────────────────────────────────────────────────────────────

function OrderRow({ order }: { order: OrderWithItems }) {
  const [expanded, setExpanded] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showLogCashModal, setShowLogCashModal] = useState(false);
  const [showCustomPaymentModal, setShowCustomPaymentModal] = useState(false);
  const [customPaymentSent, setCustomPaymentSent] = useState(false);
  const [cancellationSummary, setCancellationSummary] = useState<{
    isRefund: boolean;
    autoRefunded: AutoRefundedItem[];
    manualReturn: ManualReturnItem[];
  } | null>(null);
  const utils = trpc.useUtils();

  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); setShowDeliveryModal(false); },
  });

  const cancelOrder = trpc.orders.cancelOrder.useMutation({
    onSuccess: (data) => {
      utils.orders.listAll.invalidate();
      setShowCancelModal(false);
      if (data.autoRefunded.length > 0 || data.manualReturn.length > 0) {
        setCancellationSummary({ isRefund: data.isRefund, autoRefunded: data.autoRefunded, manualReturn: data.manualReturn });
      }
    },
  });

  const changePayment = trpc.orders.changePaymentMethod.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); setShowPaymentModal(false); },
  });

  const adminSetStatus = trpc.orders.adminSetStatus.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); setShowManualModal(false); },
  });

  const logCash = trpc.orders.logCashCollected.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); setShowLogCashModal(false); },
  });

  const clearCash = trpc.orders.clearCashCollected.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); },
  });

  const requestRemainingBalance = trpc.orders.requestRemainingBalance.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); setShowCustomPaymentModal(false); setCustomPaymentSent(true); },
  });

  const markReceived = trpc.orders.markCustomPaymentReceived.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); },
  });

  const unmarkReceived = trpc.orders.unmarkCustomPaymentReceived.useMutation({
    onSuccess: () => { utils.orders.listAll.invalidate(); },
  });

  const total = Number(order.totalAmount);
  const collected = order.cashCollected !== null && order.cashCollected !== undefined
    ? Number(order.cashCollected)
    : null;
  const isCashOrCheck = order.paymentMethod === "cash" || order.paymentMethod === "check";
  const isFullyCollected = isCashOrCheck && collected !== null && collected >= total;
  const paidCustomPayments = order.customPaymentRequests.filter((r) => r.paid);
  const customPaidTotal = paidCustomPayments.reduce((sum, r) => sum + Number(r.amount), 0);
  const owedBalance = balanceDue(order);
  const canRequestBalance = owedBalance > 0 && !isCancelledOrRefunded(order.status);
  const isRefundAction = REFUND_STATUSES.includes(order.status);
  const canCancelRefund = !isCancelledOrRefunded(order.status);
  const hasCollectedPayment = (collected !== null && collected > 0) || paidCustomPayments.length > 0;
  const canChangePayment = order.status !== "delivered" && !isCancelledOrRefunded(order.status) && !hasCollectedPayment;
  const next = nextStatus(order);
  const prev = previousStatus(order);
  const ref = order.id.slice(0, 8).toUpperCase();
  const isMutating = updateStatus.isPending || cancelOrder.isPending || changePayment.isPending || adminSetStatus.isPending || logCash.isPending || clearCash.isPending || requestRemainingBalance.isPending || markReceived.isPending || unmarkReceived.isPending;

  const date = new Date(order.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-sky-100 overflow-hidden">
      <button
        className="w-full text-left px-4 py-4 flex items-start gap-3"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-blue-900">#{ref}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status]}`}>
              {getStatusLabel(order)}
            </span>
            {canRequestBalance && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                Balance Due: ${owedBalance.toFixed(2)}
              </span>
            )}
          </div>
          <p className="text-sm text-blue-700 mt-0.5">
            {[order.firstName, order.lastName].filter(Boolean).join(" ") || order.customerEmail}
          </p>
          <p className="text-xs text-sky-500 mt-0.5">
            {order.fulfillmentType === "local_delivery" ? "Local Delivery" : "Shipping"} · {date}
          </p>
        </div>
        <span className="text-sky-400 text-sm mt-1">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-sky-100 px-4 pb-4 space-y-4">
          {/* Contact */}
          <div className="pt-3">
            <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide mb-2">Customer</p>
            <p className="text-sm text-blue-900">{[order.firstName, order.lastName].filter(Boolean).join(" ") || "—"}</p>
            <p className="text-sm text-blue-700">{order.customerEmail}</p>
            <p className="text-sm text-blue-700">{order.customerPhone}</p>
            {order.addressLine1 && (
              <p className="text-sm text-blue-700 mt-1">
                {order.addressLine1}{order.city ? `, ${order.city}` : ""}{order.state ? `, ${order.state}` : ""}{order.zip ? ` ${order.zip}` : ""}
              </p>
            )}
          </div>

          {/* Order items */}
          <div>
            <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide mb-2">Items</p>
            <div className="space-y-1">
              {order.orderItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-blue-800">
                    {item.product.name}{" "}
                    <span className="text-sky-500">× {item.quantity} {item.product.unitLabel}</span>
                  </span>
                  <span className="font-medium text-blue-900">${Number(item.subtotal).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-semibold text-blue-900 border-t border-sky-100 mt-2 pt-2">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            {collected !== null && (
              <div className="flex items-center justify-between text-sm text-sky-600 mt-1">
                <span>Cash collected</span>
                <span className="flex items-center gap-2">
                  <span>${collected.toFixed(2)}</span>
                  {!isCancelledOrRefunded(order.status) && (
                    <button
                      onClick={() => clearCash.mutate({ id: order.id })}
                      disabled={isMutating}
                      className="text-xs px-2 py-1 rounded-lg border border-sky-200 text-sky-600 font-medium hover:bg-sky-50 transition-colors disabled:opacity-60"
                    >
                      {clearCash.isPending ? "Clearing..." : "Clear"}
                    </button>
                  )}
                </span>
              </div>
            )}
            {order.customPaymentRequests.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide">Payment Requests</p>
                {order.customPaymentRequests.map((r) => (
                  <div key={r.id} className={`flex items-center justify-between text-sm ${r.paid ? "text-emerald-700" : "text-sky-500"}`}>
                    <span>{r.channel === "venmo" ? "Venmo" : "PayPal"} · {r.paid ? "Paid" : "Pending"}</span>
                    <span className="flex items-center gap-2">
                      <span className={r.paid ? "font-medium" : ""}>${Number(r.amount).toFixed(2)}</span>
                      {!r.paid && !isCancelledOrRefunded(order.status) && (
                        <button
                          onClick={() => markReceived.mutate({ requestId: r.id })}
                          disabled={isMutating}
                          className="text-xs px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 font-medium hover:bg-emerald-50 transition-colors disabled:opacity-60"
                        >
                          {markReceived.isPending ? "Marking..." : "Mark Received"}
                        </button>
                      )}
                      {r.paid && !r.paypalCaptureId && !isCancelledOrRefunded(order.status) && (
                        <button
                          onClick={() => unmarkReceived.mutate({ requestId: r.id })}
                          disabled={isMutating}
                          className="text-xs px-2 py-1 rounded-lg border border-sky-200 text-sky-600 font-medium hover:bg-sky-50 transition-colors disabled:opacity-60"
                        >
                          {unmarkReceived.isPending ? "Undoing..." : "Undo"}
                        </button>
                      )}
                    </span>
                  </div>
                ))}
                {paidCustomPayments.length > 1 && (
                  <div className="flex justify-between text-sm font-semibold text-emerald-800 border-t border-sky-100 pt-1">
                    <span>Total paid</span>
                    <span>${customPaidTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment + notes */}
          <div className="text-sm text-blue-700 space-y-1">
            <p>
              <span className="font-medium text-blue-900">Payment:</span>{" "}
              {PAYMENT_LABELS[order.paymentMethod]}
            </p>
            {order.notes && (
              <p><span className="font-medium text-blue-900">Notes:</span> {order.notes}</p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            {next && (
              <button
                onClick={() => {
                  if (order.status === "shipped" && next === "delivered") {
                    setShowDeliveryModal(true);
                  } else {
                    updateStatus.mutate({ id: order.id, status: next });
                  }
                }}
                disabled={isMutating}
                className="w-full bg-blue-900 text-white px-4 py-3 rounded-xl font-semibold text-sm hover:bg-blue-800 active:bg-blue-950 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {updateStatus.isPending ? "Updating..." : getForwardLabel(order, next)}
              </button>
            )}
            {prev && (
              <button
                onClick={() => updateStatus.mutate({ id: order.id, status: prev })}
                disabled={isMutating}
                className="w-full border border-sky-200 text-blue-700 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-sky-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {updateStatus.isPending ? "Updating..." : getBackwardLabel(order, prev)}
              </button>
            )}
            {isCashOrCheck && !isTerminal(order.status) && !isCancelledOrRefunded(order.status) && (
              <button
                onClick={() => setShowLogCashModal(true)}
                disabled={isMutating}
                className="w-full border border-amber-300 text-amber-800 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-amber-50 transition-colors disabled:opacity-60"
              >
                {isFullyCollected ? "Update Cash Collected" : "Log Cash Received"}
              </button>
            )}
            {canChangePayment && (
              <button
                onClick={() => setShowPaymentModal(true)}
                disabled={isMutating}
                className="w-full border border-sky-300 text-blue-700 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-sky-50 transition-colors disabled:opacity-60"
              >
                Change Payment Method
              </button>
            )}
            {canRequestBalance && (
              <button
                onClick={() => setShowCustomPaymentModal(true)}
                disabled={isMutating}
                className="w-full border border-violet-300 text-violet-700 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-violet-50 transition-colors disabled:opacity-60"
              >
                {customPaymentSent ? "Request Balance Again" : "Request Remaining Balance"}
              </button>
            )}
            <button
              onClick={() => setShowManualModal(true)}
              disabled={isMutating}
              className="w-full border border-sky-200 text-sky-500 px-4 py-2 rounded-xl font-medium text-xs hover:bg-sky-50 transition-colors disabled:opacity-60"
            >
              Manual Status Override
            </button>
            {canCancelRefund && (
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={isMutating}
                className="w-full border border-red-200 text-red-600 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                {isRefundAction ? "Refund Order" : "Cancel Order"}
              </button>
            )}
          </div>

          {updateStatus.isError && (
            <p className="text-sm text-red-600">{updateStatus.error.message}</p>
          )}
          {cancelOrder.isError && (
            <p className="text-sm text-red-600">{cancelOrder.error.message}</p>
          )}
          {adminSetStatus.isError && (
            <p className="text-sm text-red-600">{adminSetStatus.error.message}</p>
          )}
        </div>
      )}

      {showCancelModal && (
        <CancelRefundModal
          isRefund={isRefundAction}
          isPending={cancelOrder.isPending}
          onClose={() => setShowCancelModal(false)}
          onConfirm={(reason) => cancelOrder.mutate({ id: order.id, reason: reason || undefined })}
        />
      )}

      {showPaymentModal && (
        <ChangePaymentModal
          currentMethod={order.paymentMethod}
          isPending={changePayment.isPending}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={(method) => changePayment.mutate({ id: order.id, newPaymentMethod: method })}
        />
      )}

      {showManualModal && (
        <ManualStatusModal
          currentStatus={order.status}
          isPending={adminSetStatus.isPending}
          onClose={() => setShowManualModal(false)}
          onConfirm={(status) => adminSetStatus.mutate({ id: order.id, status })}
        />
      )}

      {showLogCashModal && (
        <LogCashModal
          total={total}
          current={collected}
          isPending={logCash.isPending}
          onClose={() => setShowLogCashModal(false)}
          onConfirm={(amount) => logCash.mutate({ id: order.id, amount })}
        />
      )}

      {showCustomPaymentModal && (
        <RequestRemainingBalanceModal
          amountOwed={owedBalance}
          isPending={requestRemainingBalance.isPending}
          onClose={() => setShowCustomPaymentModal(false)}
          onConfirm={(channel, amount) => requestRemainingBalance.mutate({ orderId: order.id, channel, amount })}
        />
      )}

      {cancellationSummary && (
        <CancellationSummaryModal
          isRefund={cancellationSummary.isRefund}
          autoRefunded={cancellationSummary.autoRefunded}
          manualReturn={cancellationSummary.manualReturn}
          onClose={() => setCancellationSummary(null)}
        />
      )}

      {showDeliveryModal && (
        isCashOrCheck ? (
          <CashDeliveryModal
            total={total}
            priorCollected={collected}
            isPending={updateStatus.isPending}
            onClose={() => setShowDeliveryModal(false)}
            onConfirm={(amount) => updateStatus.mutate({ id: order.id, status: "delivered", cashCollected: amount })}
          />
        ) : (
          <ConfirmDeliveryModal
            isPending={updateStatus.isPending}
            onClose={() => setShowDeliveryModal(false)}
            onConfirm={() => updateStatus.mutate({ id: order.id, status: "delivered" })}
          />
        )
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const ALL_PAYMENT_METHODS = ["venmo", "paypal", "cash"] as PaymentMethod[];

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export function AdminOrdersClient() {
  const { data: orders, isLoading, isError } = trpc.orders.listAll.useQuery();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<OrderStatus>>(new Set());
  const [paymentFilter, setPaymentFilter] = useState<Set<PaymentMethod>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = (orders ?? []).filter((o) => {
    if (statusFilter.size > 0 && !statusFilter.has(o.status)) return false;
    const normalizedPayment = o.paymentMethod === "check" ? "cash" : o.paymentMethod;
    if (paymentFilter.size > 0 && !paymentFilter.has(normalizedPayment)) return false;
    if (!matchesSearch(o, search)) return false;
    const orderDate = new Date(o.createdAt);
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
      if (orderDate < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      if (orderDate > to) return false;
    }
    return true;
  });

  const hasDateFilter = dateFrom || dateTo;
  const hasAnyFilter = search || hasDateFilter || statusFilter.size > 0 || paymentFilter.size > 0;

  return (
    <div className="px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Orders</h1>
            {orders && (
              <p className="text-sm text-blue-600 mt-0.5">{filtered.length} of {orders.length}</p>
            )}
          </div>
          {hasAnyFilter && (
            <button
              onClick={() => { setSearch(""); setStatusFilter(new Set()); setPaymentFilter(new Set()); setDateFrom(""); setDateTo(""); }}
              className="text-xs text-blue-600 hover:text-blue-900 underline shrink-0"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-4 space-y-3">
          <input
            type="search"
            placeholder="Search by name, email, or order ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400" />
            <span className="text-sky-400 text-sm shrink-0">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400" />
            {hasDateFilter && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-blue-600 hover:text-blue-900 shrink-0 underline">
                Clear
              </button>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">Status</p>
            <div className="flex gap-2 flex-wrap">
              {ALL_STATUSES.map((s) => (
                <button key={s} onClick={() => setStatusFilter((prev) => toggleSet(prev, s))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter.has(s) ? "bg-blue-900 text-white" : "border border-sky-200 text-blue-700 hover:bg-sky-50"
                  }`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-1.5">Payment</p>
            <div className="flex gap-2 flex-wrap">
              {ALL_PAYMENT_METHODS.map((m) => (
                <button key={m} onClick={() => setPaymentFilter((prev) => toggleSet(prev, m))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    paymentFilter.has(m) ? "bg-blue-900 text-white" : "border border-sky-200 text-blue-700 hover:bg-sky-50"
                  }`}>
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-sky-500">
            <p className="text-3xl mb-3">⏳</p>
            <p className="text-sm">Loading orders…</p>
          </div>
        )}
        {isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">
            Failed to load orders. Please refresh.
          </div>
        )}
        {orders && filtered.length === 0 && (
          <div className="text-center py-16 text-sky-500">
            <p className="text-3xl mb-3">🧾</p>
            <p className="font-medium">{orders.length === 0 ? "No orders yet" : "No matches"}</p>
            <p className="text-sm mt-1">{orders.length === 0 ? "New orders will appear here" : "Try a different search or filter"}</p>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
