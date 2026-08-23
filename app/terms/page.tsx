import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — EvryBites",
};

export default function TermsPage() {
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
              EvryBites
            </h1>
            <p className="text-xs text-amber-600">Fresh baked to order</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <div className="bg-white rounded-3xl shadow-sm border border-amber-100 p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-amber-900 mb-1">Terms &amp; Conditions</h2>
            <p className="text-xs text-amber-500">Last updated: August 23, 2026</p>
          </div>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Orders</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              All items are baked fresh to order. Submitting an order is a request
              — your order is confirmed only after you receive a confirmation from
              EvryBites. We reserve the right to refuse or cancel any order at our
              discretion.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Payment</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Payment is due at the time of delivery or pickup unless otherwise
              arranged. Accepted payment methods are listed at checkout. Prices are
              subject to change without notice.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Cancellations</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Please contact us as soon as possible if you need to cancel an order.
              Because items are baked to order, cancellations requested after
              baking has begun may not be accommodated.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Allergens</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Our products are made in a home kitchen that handles common
              allergens including wheat, eggs, dairy, nuts, and soy. We cannot
              guarantee an allergen-free environment. Please contact us before
              ordering if you have serious food allergies.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Limitation of Liability</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              EvryBites is not liable for any indirect, incidental, or
              consequential damages arising from the purchase or use of our
              products. Our total liability is limited to the amount paid for the
              order in question.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Contact</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Questions? Email us at{" "}
              <a
                href="mailto:orders@evrybites.com"
                className="underline text-amber-700"
              >
                orders@evrybites.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
