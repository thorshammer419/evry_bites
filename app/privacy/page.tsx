import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — EvryBites",
};

export default function PrivacyPage() {
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
            <h2 className="text-2xl font-bold text-amber-900 mb-1">Privacy Policy</h2>
            <p className="text-xs text-amber-500">Last updated: June 15, 2025</p>
          </div>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Information We Collect</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              When you place an order, we collect your name, email address, phone
              number, and delivery address. We use this information solely to
              process and fulfill your order and to send you order status
              notifications.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">How We Use Your Information</h3>
            <ul className="text-sm text-amber-800 leading-relaxed list-disc list-inside space-y-1">
              <li>To process and fulfill your bakery order</li>
              <li>To send order confirmation and status updates via email and SMS</li>
              <li>To contact you if there is an issue with your order</li>
            </ul>
            <p className="text-sm text-amber-800 leading-relaxed">
              We do not sell, rent, or share your personal information with third
              parties for marketing purposes.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">SMS Notifications</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              By providing your phone number when placing an order, you consent to
              receive transactional SMS messages about that order from EvryBites.
              Message and data rates may apply. You may opt out at any time by
              replying STOP.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Data Retention</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Order information is retained for business record-keeping purposes.
              You may request deletion of your personal data by contacting us at
              the email below.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-amber-900">Contact</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Questions about this policy? Email us at{" "}
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
