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
import { trpc } from "../../../../../lib/trpc/react";

interface Props {
  requestId: string;
  amount: number;
  orderId: string;
  firstName: string | null;
  lastName: string | null;
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

export function PayCustomClient({ requestId, amount, orderId, firstName, lastName }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<PayMode>("paypal");

  const createOrder = trpc.orders.createPaypalOrderForCustomPayment.useMutation();
  const capture = trpc.orders.captureCustomPayment.useMutation({
    onSuccess: () => router.push(`/order/pay/custom/${requestId}/thank-you`),
    onError: () => setError("Payment failed. Please try again."),
  });

  const name = [firstName, lastName].filter(Boolean).join(" ") || "Customer";
  const ref = orderId.slice(0, 8).toUpperCase();

  const createPaypalOrder = async () => {
    setError(null);
    const result = await createOrder.mutateAsync({ requestId });
    return result.paypalOrderId;
  };

  const onApprove = async (data: { orderID: string }) => {
    await capture.mutateAsync({ requestId, paypalOrderId: data.orderID });
  };

  const onError = () => {
    if (!createOrder.isError) setError("Something went wrong. Please try again.");
  };

  const isPending = createOrder.isPending || capture.isPending;

  return (
    <div className="min-h-screen bg-bakery-pattern flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold text-blue-900 mb-0.5">Payment Request</h1>
        <p className="text-sm text-blue-600 mb-5">Order #{ref} · {name}</p>

        <div className="bg-sky-50 rounded-xl p-4 mb-5">
          <div className="flex justify-between text-sm font-bold text-blue-900">
            <span>Amount due</span>
            <span>${amount.toFixed(2)}</span>
          </div>
        </div>

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
        }}>
          {payMode === "paypal" && (
            <PayPalButtons
              style={{ layout: "vertical", label: "pay" }}
              createOrder={createPaypalOrder}
              onApprove={onApprove}
              onError={onError}
            />
          )}
          {payMode === "card" && (
            <PayPalCardFieldsProvider
              createOrder={createPaypalOrder}
              onApprove={onApprove}
              onError={onError}
            >
              <PayPalCardFieldsForm />
              <CardSubmitButton amount={amount} isPending={isPending} />
            </PayPalCardFieldsProvider>
          )}
        </PayPalScriptProvider>
      </div>
    </div>
  );
}
