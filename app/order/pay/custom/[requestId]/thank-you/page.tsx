import Link from "next/link";
import Image from "next/image";

export default function CustomPaymentThankYou() {
  return (
    <div className="min-h-screen bg-bakery-pattern flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-sm border border-sky-100 p-8 w-full max-w-md text-center">
        <p className="text-4xl mb-4">🎉</p>
        <h1 className="text-2xl font-bold text-blue-900 mb-2">Payment Received!</h1>
        <p className="text-blue-700 mb-6">
          Thank you for your payment. We{"'"}ve sent a confirmation to your email.
        </p>
        <Link href="/" aria-label="Back to Menu">
          <Image src="/back-button.png" alt="Back to Menu" width={120} height={66} className="h-14 w-auto inline-block" />
        </Link>
      </div>
    </div>
  );
}
