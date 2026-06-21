"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PayPalScriptProvider,
  PayPalButtons,
  PayPalCardFieldsProvider,
  PayPalCardFieldsForm,
  usePayPalCardFields,
} from "@paypal/react-paypal-js";
import { trpc } from "../../../../lib/trpc/react";

interface Props {
  orderId: string;
  firstName: string | null;
  lastName: string | null;
  totalAmount: number;
  orderItems: {
    id: string;
    quantity: number;
    subtotal: number;
    productName: string;
    unitLabel: string;
  }[];
}

type PayMode = "paypal" | "card";

function CardSubmitButton({ amount, isPending }: { amount: number; isPending: boolean }) {
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
      {busy ? "Processing..." : `Pay $${amount.toFixed(2)}`}
    </button>
  );
}

export function PayOrderClient({ orderId, firstName, lastName, totalAmount, orderItems }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("paypal");

  const createPaypalOrder = trpc.orders.createPaypalOrderForExistingOrder.useMutation();
  const capture = trpc.orders.capturePaypalPaymentLink.useMutation({
    onSuccess: () => router.push(`/order/confirmation/${orderId}`),
    onError: () => setError("Payment failed. Please try again."),
  });

  const name = [firstName, lastName].filter(Boolean).join(" ") || "Customer";
  const ref = orderId.slice(0, 8).toUpperCase();

  const createOrder = async () => {
    setError(null);
    const result = await createPaypalOrder.mutateAsync({ orderId });
    return result.paypalOrderId;
  };

  const onApprove = async (data: { orderID: string }) => {
    await capture.mutateAsync({ orderId, paypalOrderId: data.orderID });
  };

  const onError = () => {
    if (!createPaypalOrder.isError) setError("Something went wrong. Please try again.");
  };

  const isPending = createPaypalOrder.isPending || capture.isPending;

  return (
    <div className="min-h-screen bg-bakery-pattern flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold text-blue-900 mb-0.5">Complete Payment</h1>
        <p className="text-sm text-blue-600 mb-5">Order #{ref} · {name}</p>

        {/* Order summary */}
        <div className="bg-sky-50 rounded-xl p-4 mb-5 space-y-1.5">
          {orderItems.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-blue-800">{item.productName} × {item.quantity} {item.unitLabel}</span>
              <span className="font-medium text-blue-900">${item.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold text-blue-900 border-t border-sky-200 pt-2 mt-1">
            <span>Total</span>
            <span>${totalAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment mode toggle */}
        <div className="flex gap-2 mb-4">
          {(["paypal", "card"] as PayMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setPayMode(mode)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                payMode === mode
                  ? "bg-blue-900 text-white border-blue-900"
                  : "border-sky-200 text-blue-700 hover:bg-sky-50"
              }`}
            >
              {mode === "paypal" ? "PayPal" : "Credit / Debit Card"}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <PayPalScriptProvider options={{
          clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "",
          currency: "USD",
          components: "buttons,card-fields",
          enableFunding: "venmo",
        }}>
          {payMode === "paypal" && (
            <PayPalButtons
              style={{ layout: "vertical", label: "pay" }}
              createOrder={createOrder}
              onApprove={onApprove}
              onError={onError}
            />
          )}
          {payMode === "card" && (
            <PayPalCardFieldsProvider
              createOrder={createOrder}
              onApprove={onApprove}
              onError={onError}
            >
              <PayPalCardFieldsForm />
              <CardSubmitButton amount={totalAmount} isPending={isPending} />
            </PayPalCardFieldsProvider>
          )}
        </PayPalScriptProvider>
      </div>
    </div>
  );
}
