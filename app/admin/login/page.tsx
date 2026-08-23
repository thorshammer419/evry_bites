import { cookies } from "next/headers";
import Image from "next/image";
import { loginAction, verifyCodeAction, resendCodeAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  password: "Incorrect password. Please try again.",
  email_format: "That doesn't look like a valid email address.",
  email_not_allowed: "That email address isn't recognized.",
  no_pending_code: "Your verification session expired. Please sign in again.",
  code_not_found: "We couldn't find a pending code. Please request a new one.",
  code_wrong: "Incorrect code. Please try again.",
  code_expired: "That code has expired. Request a new one below.",
  code_locked: "Too many incorrect attempts. Request a new code below.",
  resend_throttled: "Please wait a bit before requesting another code.",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; resent?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;
  const justResent = params.resent === "1";

  const cookieStore = await cookies();
  const pendingEmail = cookieStore.get("admin_2fa_email")?.value;

  return (
    <div className="min-h-screen bg-sky-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Ev'ry Bites Bakery" width={88} height={88} className="mx-auto [filter:drop-shadow(6px_8px_10px_rgba(0,0,0,0.55))]" />
          <h1 className="text-2xl font-bold text-blue-900 mt-3">
            EvryBites Admin
          </h1>
          <p className="text-sm text-blue-600 mt-1">
            {pendingEmail ? "Enter the code we emailed you" : "Enter your password to continue"}
          </p>
        </div>

        {pendingEmail ? (
          <form
            action={verifyCodeAction}
            className="bg-white rounded-3xl shadow-sm border border-sky-100 p-6 space-y-4"
          >
            {errorMessage && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {!errorMessage && justResent && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                A new code has been sent.
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

            <button
              formAction={resendCodeAction}
              formNoValidate
              className="w-full border border-sky-200 text-blue-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-sky-50 transition-colors"
            >
              Resend code
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
                htmlFor="email"
                className="block text-sm font-medium text-blue-900 mb-2"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 placeholder-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                placeholder="you@evrybites.com"
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
