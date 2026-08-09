import { cookies } from "next/headers";
import Image from "next/image";
import { loginAction, verifyCodeAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  password: "Incorrect password. Please try again.",
  phone_format: "That doesn't look like a valid phone number.",
  phone_not_allowed: "That phone number isn't recognized.",
  no_pending_code: "Your verification session expired. Please sign in again.",
  code: "Incorrect or expired code. Please try again.",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

  const cookieStore = await cookies();
  const pendingPhone = cookieStore.get("admin_2fa_phone")?.value;

  return (
    <div className="min-h-screen bg-sky-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Ev'ry Bites Bakery" width={88} height={88} className="mx-auto [filter:drop-shadow(6px_8px_10px_rgba(0,0,0,0.55))]" />
          <h1 className="text-2xl font-bold text-blue-900 mt-3">
            EvryBites Admin
          </h1>
          <p className="text-sm text-blue-600 mt-1">
            {pendingPhone ? "Enter the code we texted you" : "Enter your password to continue"}
          </p>
        </div>

        {pendingPhone ? (
          <form
            action={verifyCodeAction}
            className="bg-white rounded-3xl shadow-sm border border-sky-100 p-6 space-y-4"
          >
            {errorMessage && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-blue-900 mb-2"
              >
                Verification code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent tracking-widest text-center text-lg"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-900 text-white px-4 py-3 rounded-xl font-semibold hover:bg-blue-800 active:bg-blue-950 transition-colors"
            >
              Verify
            </button>
          </form>
        ) : (
          <form
            action={loginAction}
            className="bg-white rounded-3xl shadow-sm border border-sky-100 p-6 space-y-4"
          >
            {errorMessage && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-blue-900 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                placeholder="Enter admin password"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-blue-900 mb-2"
              >
                Phone number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                placeholder="605-555-1234"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-900 text-white px-4 py-3 rounded-xl font-semibold hover:bg-blue-800 active:bg-blue-950 transition-colors"
            >
              Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
