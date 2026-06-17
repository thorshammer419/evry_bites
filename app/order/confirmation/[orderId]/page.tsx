import Link from "next/link";
import type { FulfillmentType, PaymentMethod } from "@prisma/client";
import { db } from "../../../../lib/db";
import { CustomerHeader } from "../../../components/CustomerHeader";
import { CustomerFooter } from "../../../components/CustomerFooter";

interface ConfirmationPageProps {
  params: Promise<{ orderId: string }>;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  venmo: "Venmo",
  paypal: "PayPal",
  cash: "Cash on Delivery",
  check: "Check on Delivery",
};

const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  local_delivery: "Local Delivery",
  shipping: "Shipping",
};

export default async function OrderConfirmationPage({
  params,
}: ConfirmationPageProps) {
  const { orderId } = await params;

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
  });

  const venmoHandle = process.env.NEXT_PUBLIC_VENMO_HANDLE;
  const paypalLink = process.env.NEXT_PUBLIC_PAYPAL_LINK;

  return (
    <div className="min-h-screen bg-amber-50">
      <CustomerHeader title="Order Confirmed!" subtitle="EvryBites" />

      <main className="max-w-2xl mx-auto px-4 py-6 pb-12 space-y-6">
        {/* Success Banner */}
        <div className="bg-green-50 border border-green-200 rounded-3xl p-4 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="font-semibold text-green-800 text-lg">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-sm text-green-700 mt-1">
            A confirmation email and text message will be sent shortly.
          </p>
        </div>

        {/* Order Items */}
        <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
          <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide mb-3">
            Your Order
          </h2>
          <div className="space-y-3 mb-4">
            {order.orderItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-start"
              >
                <div>
                  <p className="font-medium text-amber-900">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-amber-500">
                    {item.quantity} × {item.product.unitLabel} @ $
                    {Number(item.unitPrice).toFixed(2)}
                  </p>
                </div>
                <span className="font-semibold text-amber-900">
                  ${Number(item.subtotal).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-amber-100 pt-3 flex justify-between items-center">
            <span className="font-semibold text-amber-900">Total</span>
            <span className="text-xl font-bold text-amber-900">
              ${Number(order.totalAmount).toFixed(2)}
            </span>
          </div>
        </section>

        {/* Fulfillment Details */}
        <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
          <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide mb-3">
            Fulfillment Details
          </h2>
          <div className="space-y-2 text-sm text-amber-700">
            <p>
              <span className="font-medium text-amber-900">Method:</span>{" "}
              {FULFILLMENT_LABELS[order.fulfillmentType]}
            </p>
            {order.addressLine1 && (
              <p>
                <span className="font-medium text-amber-900">Address:</span>{" "}
                {order.addressLine1}{order.city ? `, ${order.city}` : ""}{order.state ? `, ${order.state}` : ""}{order.zip ? ` ${order.zip}` : ""}
              </p>
            )}
          </div>
        </section>

        {/* Payment */}
        <section className="bg-white rounded-3xl shadow-sm border border-amber-100 p-4">
          <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide mb-3">
            Payment
          </h2>
          <p className="text-sm text-amber-700 mb-3">
            <span className="font-medium text-amber-900">Method:</span>{" "}
            {PAYMENT_LABELS[order.paymentMethod]}
          </p>

          {order.paymentMethod === "venmo" && venmoHandle && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <p className="font-medium mb-1">Venmo Payment Instructions</p>
              <p>
                Please send{" "}
                <span className="font-semibold">
                  ${Number(order.totalAmount).toFixed(2)}
                </span>{" "}
                to{" "}
                <span className="font-semibold">{venmoHandle}</span> via Venmo.
              </p>
            </div>
          )}

          {order.paymentMethod === "paypal" && paypalLink && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <p className="font-medium mb-1">PayPal Payment Instructions</p>
              <p>
                Please send{" "}
                <span className="font-semibold">
                  ${Number(order.totalAmount).toFixed(2)}
                </span>{" "}
                via{" "}
                <a
                  href={paypalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold"
                >
                  PayPal
                </a>
                .
              </p>
            </div>
          )}
        </section>

        {/* Back to menu */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-block bg-amber-800 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-700 active:bg-amber-900 transition-colors"
          >
            ← Back to Menu
          </Link>
        </div>
      </main>
      <CustomerFooter />
    </div>
  );
}
