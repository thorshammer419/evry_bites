"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Product } from "@prisma/client";
import { CartProvider, useCart } from "../../lib/cart";
import { trpc } from "../../lib/trpc/react";

interface OrderFormClientProps {
  products: Product[];
}

type FulfillmentType = "local_delivery" | "shipping";
type PaymentMethod = "venmo" | "paypal" | "cash" | "check";

function OrderFormInner({ products }: OrderFormClientProps) {
  const router = useRouter();
  const { cart, clearCart } = useCart();

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfillmentType, setFulfillmentType] =
    useState<FulfillmentType>("local_delivery");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("venmo");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const lineItems = products
    .filter((p) => cart[p.id] && cart[p.id] > 0)
    .map((p) => {
      const quantity = cart[p.id] ?? 0;
      return {
        product: p,
        quantity,
        subtotal: Number(p.price) * quantity,
      };
    });

  const grandTotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);

  const submitMutation = trpc.orders.submit.useMutation({
    onSuccess: (order) => {
      clearCart();
      router.push(`/order/confirmation/${order.id}`);
    },
    onError: (error) => {
      setFormError(error.message || "Something went wrong. Please try again.");
    },
  });

  const inputClass =
    "w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400";
  const labelClass = "block text-sm font-medium text-amber-800 mb-1";
  const sectionHeaderClass =
    "text-sm font-semibold text-amber-900 uppercase tracking-wide mb-3";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerName.trim()) {
      setFormError("Please enter your name.");
      return;
    }
    if (!customerEmail.trim()) {
      setFormError("Please enter your email address.");
      return;
    }
    if (!customerPhone.trim()) {
      setFormError("Please enter your phone number.");
      return;
    }
    if (!address.trim()) {
      setFormError("Please enter your address.");
      return;
    }
    if (lineItems.length === 0) {
      setFormError("Your cart is empty.");
      return;
    }

    submitMutation.mutate({
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
      fulfillmentType,
      address: address.trim(),
      paymentMethod,
      notes: notes.trim() || undefined,
      items: lineItems.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      })),
    });
  };

  if (lineItems.length === 0) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🛒</p>
          <p className="text-amber-800 font-medium text-lg mb-2">
            Your cart is empty.
          </p>
          <p className="text-amber-600 text-sm mb-6">
            Go back to the menu to add items.
          </p>
          <Link
            href="/"
            className="bg-amber-800 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-700 transition-colors"
          >
            ← Back to Menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="bg-white border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-amber-600 hover:text-amber-800 mr-1">
            ←
          </Link>
          <span className="text-3xl">🧁</span>
          <div>
            <h1 className="text-xl font-bold text-amber-900 leading-none">
              Place Your Order
            </h1>
            <p className="text-xs text-amber-600">EvryBites</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-12">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contact Information */}
          <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
            <h2 className={sectionHeaderClass}>Contact Information</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="customerName" className={labelClass}>
                  Full Name
                </label>
                <input
                  id="customerName"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputClass}
                  placeholder="Jane Smith"
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="customerEmail" className={labelClass}>
                  Email Address
                </label>
                <input
                  id="customerEmail"
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className={inputClass}
                  placeholder="jane@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label htmlFor="customerPhone" className={labelClass}>
                  Phone Number
                </label>
                <input
                  id="customerPhone"
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className={inputClass}
                  placeholder="605-555-0100"
                  autoComplete="tel"
                />
              </div>
            </div>
          </section>

          {/* Fulfillment */}
          <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
            <h2 className={sectionHeaderClass}>Fulfillment</h2>
            <div className="space-y-3 mb-4">
              {(
                [
                  {
                    value: "local_delivery",
                    label: "Local Delivery",
                    desc: "Available within the Rapid City, SD area",
                  },
                  {
                    value: "shipping",
                    label: "Shipping",
                    desc: "Shipped to your address",
                  },
                ] as { value: FulfillmentType; label: string; desc: string }[]
              ).map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                    fulfillmentType === option.value
                      ? "border-amber-800 bg-amber-50"
                      : "border-amber-100 bg-white hover:border-amber-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfillmentType"
                    value={option.value}
                    checked={fulfillmentType === option.value}
                    onChange={() => setFulfillmentType(option.value)}
                    className="mt-0.5 accent-amber-800"
                  />
                  <div>
                    <p className="font-semibold text-amber-900">{option.label}</p>
                    <p className="text-xs text-amber-600">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {fulfillmentType === "local_delivery" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
                Local delivery is available within the Rapid City, SD area
              </p>
            )}

            <div>
              <label htmlFor="address" className={labelClass}>
                {fulfillmentType === "local_delivery"
                  ? "Delivery Address"
                  : "Shipping Address"}
              </label>
              <input
                id="address"
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputClass}
                placeholder="123 Main St, Rapid City, SD 57701"
                autoComplete="street-address"
              />
            </div>
          </section>

          {/* Payment */}
          <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
            <h2 className={sectionHeaderClass}>Payment Method</h2>
            <div className="space-y-3 mb-4">
              {(
                [
                  { value: "venmo", label: "Venmo" },
                  { value: "paypal", label: "PayPal" },
                  { value: "cash", label: "Cash on Delivery" },
                  { value: "check", label: "Check on Delivery" },
                ] as { value: PaymentMethod; label: string }[]
              ).map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                    paymentMethod === option.value
                      ? "border-amber-800 bg-amber-50"
                      : "border-amber-100 bg-white hover:border-amber-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={option.value}
                    checked={paymentMethod === option.value}
                    onChange={() => setPaymentMethod(option.value)}
                    className="accent-amber-800"
                  />
                  <span className="font-semibold text-amber-900">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>

            {paymentMethod === "venmo" &&
              process.env.NEXT_PUBLIC_VENMO_HANDLE && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <p className="font-medium mb-1">Venmo Payment Instructions</p>
                  <p>
                    Send payment to{" "}
                    <span className="font-semibold">
                      {process.env.NEXT_PUBLIC_VENMO_HANDLE}
                    </span>{" "}
                    after your order is confirmed.
                  </p>
                </div>
              )}

            {paymentMethod === "paypal" &&
              process.env.NEXT_PUBLIC_PAYPAL_LINK && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <p className="font-medium mb-1">PayPal Payment Instructions</p>
                  <p>
                    Send payment via{" "}
                    <a
                      href={process.env.NEXT_PUBLIC_PAYPAL_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-semibold"
                    >
                      PayPal
                    </a>{" "}
                    after your order is confirmed.
                  </p>
                </div>
              )}
          </section>

          {/* Notes */}
          <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
            <h2 className={sectionHeaderClass}>Order Notes (Optional)</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputClass} min-h-[100px] resize-y`}
              placeholder="Any special requests or notes..."
            />
          </section>

          {/* Order Review */}
          <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
            <h2 className={sectionHeaderClass}>Order Review</h2>
            <div className="space-y-3 mb-4">
              {lineItems.map(({ product, quantity, subtotal }) => (
                <div
                  key={product.id}
                  className="flex justify-between items-start"
                >
                  <div>
                    <p className="font-medium text-amber-900">{product.name}</p>
                    <p className="text-xs text-amber-500">
                      {quantity} × {product.unitLabel} @ $
                      {Number(product.price).toFixed(2)}
                    </p>
                  </div>
                  <span className="font-semibold text-amber-900">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-amber-100 pt-3 flex justify-between items-center">
              <span className="font-semibold text-amber-900">Total</span>
              <span className="text-xl font-bold text-amber-900">
                ${grandTotal.toFixed(2)}
              </span>
            </div>

            <div className="mt-4 pt-4 border-t border-amber-100 space-y-1 text-sm text-amber-700">
              <p>
                <span className="font-medium">Fulfillment:</span>{" "}
                {fulfillmentType === "local_delivery"
                  ? "Local Delivery"
                  : "Shipping"}
                {address && ` — ${address}`}
              </p>
              <p>
                <span className="font-medium">Payment:</span>{" "}
                {paymentMethod === "venmo"
                  ? "Venmo"
                  : paymentMethod === "paypal"
                    ? "PayPal"
                    : paymentMethod === "cash"
                      ? "Cash on Delivery"
                      : "Check on Delivery"}
              </p>
            </div>
          </section>

          {/* Error */}
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {formError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="w-full bg-amber-800 text-white px-4 py-3 rounded-xl font-semibold hover:bg-amber-700 active:bg-amber-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitMutation.isPending ? "Placing Order..." : "Place Order"}
          </button>
        </form>
      </main>
    </div>
  );
}

export function OrderFormClient({ products }: OrderFormClientProps) {
  return (
    <CartProvider>
      <OrderFormInner products={products} />
    </CartProvider>
  );
}
