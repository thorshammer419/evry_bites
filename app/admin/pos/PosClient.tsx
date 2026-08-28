"use client";

import { useState } from "react";
import type { Product } from "@prisma/client";
import {
  PayPalScriptProvider,
  PayPalButtons,
  PayPalCardFieldsProvider,
  PayPalCardFieldsForm,
  usePayPalCardFields,
} from "@paypal/react-paypal-js";
import { trpc } from "../../../lib/trpc/react";

interface Props {
  products: Product[];
}

type PaymentMode = "cash" | "paypal" | "venmo" | "card";

function CardFieldsSubmitButton({ amount, isPending }: { amount: number; isPending: boolean }) {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = useState(false);
  const busy = isPending || submitting;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setSubmitting(true);
        try { await cardFieldsForm?.submit({}); } catch { /* onError handles it */ }
        finally { setSubmitting(false); }
      }}
      className="w-full mt-3 bg-purple-800 text-white px-4 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {busy ? "Processing..." : `Charge $${amount.toFixed(2)}`}
    </button>
  );
}

export function PosClient({ products }: Props) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<{ ref: string; total: number } | null>(null);

  const [pendingOrder, setPendingOrder] = useState<{ orderId: string; paypalOrderId: string } | null>(null);

  const cashMutation = trpc.orders.createPosCashOrder.useMutation();
  const createPaypalOrder = trpc.orders.createPosPaypalOrder.useMutation();
  const capture = trpc.orders.capturePaypalOrder.useMutation();

  const lineItems = products
    .filter((p) => cart[p.id] > 0)
    .map((p) => ({ product: p, quantity: cart[p.id], subtotal: Number(p.price) * cart[p.id] }));

  const total = lineItems.reduce((sum, item) => sum + item.subtotal, 0);

  function setQuantity(productId: string, quantity: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });
  }

  function resetSale() {
    setCart({});
    setFirstName("");
    setLastName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setShowCustomerInfo(false);
    setPaymentMode("cash");
    setError(null);
    setPendingOrder(null);
    setCompletedSale(null);
  }

  function customerFields() {
    return {
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
    };
  }

  function itemsPayload() {
    return lineItems.map((item) => ({ productId: item.product.id, quantity: item.quantity }));
  }

  async function handleCashSale() {
    setError(null);
    try {
      const order = await cashMutation.mutateAsync({ ...customerFields(), items: itemsPayload() });
      setCompletedSale({ ref: order.id.slice(0, 8).toUpperCase(), total: Number(order.totalAmount) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong completing the sale.");
    }
  }

  const paypalCreateOrder = async () => {
    setError(null);
    if (lineItems.length === 0) throw new Error("empty_cart");
    try {
      const result = await createPaypalOrder.mutateAsync({ ...customerFields(), items: itemsPayload() });
      setPendingOrder(result);
      return result.paypalOrderId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong starting the payment.");
      throw err;
    }
  };

  const paypalOnApprove = async () => {
    if (!pendingOrder) return;
    try {
      const order = await capture.mutateAsync(pendingOrder);
      setCompletedSale({ ref: order.id.slice(0, 8).toUpperCase(), total: Number(order.totalAmount) });
    } catch {
      setError("Payment capture failed. Please try again.");
    }
  };

  const paypalOnError = () => {
    if (!createPaypalOrder.isError) setError("Something went wrong. Please try again.");
  };

  const isPending = createPaypalOrder.isPending || capture.isPending;

  if (completedSale) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-5xl mb-4">✅</p>
        <h1 className="text-2xl font-bold text-blue-900 mb-1">Sale Complete</h1>
        <p className="text-blue-700 mb-6">Order #{completedSale.ref} · ${completedSale.total.toFixed(2)}</p>
        <button
          onClick={resetSale}
          className="w-full bg-blue-900 text-white px-4 py-3 rounded-xl font-semibold hover:bg-blue-800 transition-colors"
        >
          Start New Sale
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-16 space-y-6">
      <h1 className="text-2xl font-bold text-blue-900">Point of Sale</h1>

      {/* Products */}
      <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
        <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wide mb-3">Products</h2>
        <div className="space-y-2">
          {products.map((product) => {
            const quantity = cart[product.id] ?? 0;
            return (
              <div key={product.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-sky-100">
                <div className="min-w-0">
                  <p className="font-medium text-blue-900 truncate">{product.name}</p>
                  <p className="text-xs text-sky-500">${Number(product.price).toFixed(2)} / {product.unitLabel}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setQuantity(product.id, quantity - 1)}
                    disabled={quantity === 0}
                    className="w-8 h-8 rounded-lg border border-sky-200 text-blue-800 font-bold hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold text-blue-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(product.id, quantity + 1)}
                    className="w-8 h-8 rounded-lg border border-sky-200 text-blue-800 font-bold hover:bg-sky-50"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cart summary */}
      {lineItems.length > 0 && (
        <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
          <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wide mb-3">Order Summary</h2>
          <div className="space-y-1.5">
            {lineItems.map((item) => (
              <div key={item.product.id} className="flex justify-between text-sm">
                <span className="text-blue-800">{item.product.name} × {item.quantity}</span>
                <span className="font-medium text-blue-900">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold text-blue-900 border-t border-sky-200 pt-2 mt-1">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Optional customer info */}
      <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
        <button
          type="button"
          onClick={() => setShowCustomerInfo((v) => !v)}
          className="flex items-center justify-between w-full text-sm font-semibold text-blue-900 uppercase tracking-wide"
        >
          Customer Info (Optional)
          <span className="text-sky-500 normal-case font-normal">{showCustomerInfo ? "Hide" : "Add for a receipt"}</span>
        </button>
        {showCustomerInfo && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name"
              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400" />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name"
              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400" />
            <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email" type="email"
              className="col-span-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400" />
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" type="tel"
              className="col-span-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
        )}
      </section>

      {/* Payment */}
      <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
        <h2 className="text-sm font-semibold text-blue-900 uppercase tracking-wide mb-3">Payment Method</h2>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {([
            { value: "cash" as PaymentMode, label: "Cash" },
            { value: "paypal" as PaymentMode, label: "PayPal" },
            { value: "venmo" as PaymentMode, label: "Venmo" },
            { value: "card" as PaymentMode, label: "Card" },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { setPaymentMode(option.value); setError(null); }}
              className={`py-2 rounded-xl text-sm font-semibold border transition-colors ${
                paymentMode === option.value
                  ? "bg-blue-900 text-white border-blue-900"
                  : "border-sky-200 text-blue-700 hover:bg-sky-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {lineItems.length === 0 ? (
          <p className="text-sm text-sky-500 text-center py-2">Add items above to take payment.</p>
        ) : paymentMode === "cash" ? (
          <button
            type="button"
            onClick={handleCashSale}
            disabled={cashMutation.isPending}
            className="w-full bg-blue-900 text-white px-4 py-3 rounded-xl font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {cashMutation.isPending ? "Completing Sale..." : `Collect Cash & Complete Sale — $${total.toFixed(2)}`}
          </button>
        ) : (
          <PayPalScriptProvider options={{
            clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "",
            currency: "USD",
            components: "buttons,card-fields",
            enableFunding: "venmo",
          }}>
            {paymentMode === "paypal" && (
              <PayPalButtons
                style={{ layout: "vertical", label: "pay" }}
                createOrder={paypalCreateOrder}
                onApprove={paypalOnApprove}
                onError={paypalOnError}
              />
            )}
            {paymentMode === "venmo" && (
              <PayPalButtons
                style={{ layout: "vertical", label: "pay" }}
                fundingSource="venmo"
                createOrder={paypalCreateOrder}
                onApprove={paypalOnApprove}
                onError={paypalOnError}
              />
            )}
            {paymentMode === "card" && (
              <PayPalCardFieldsProvider
                createOrder={paypalCreateOrder}
                onApprove={paypalOnApprove}
                onError={paypalOnError}
              >
                <PayPalCardFieldsForm />
                <CardFieldsSubmitButton amount={total} isPending={isPending} />
              </PayPalCardFieldsProvider>
            )}
          </PayPalScriptProvider>
        )}
      </section>
    </div>
  );
}
