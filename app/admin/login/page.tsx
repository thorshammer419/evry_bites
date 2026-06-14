import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { computeSessionToken } from "../../../lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const password = formData.get("password") as string;

  if (password === process.env.ADMIN_PASSWORD) {
    const token = await computeSessionToken(password);
    const cookieStore = await cookies();
    cookieStore.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    redirect("/admin/orders");
  }

  redirect("/admin/login?error=1");
}

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = !!params.error;

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-5xl">🧁</span>
          <h1 className="text-2xl font-bold text-amber-900 mt-3">
            EvryBites Admin
          </h1>
          <p className="text-sm text-amber-600 mt-1">
            Enter your password to continue
          </p>
        </div>

        <form
          action={loginAction}
          className="bg-white rounded-3xl shadow-sm border border-amber-100 p-6 space-y-4"
        >
          {hasError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              Incorrect password. Please try again.
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-amber-900 mb-2"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              placeholder="Enter admin password"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-amber-800 text-white px-4 py-3 rounded-xl font-semibold hover:bg-amber-700 active:bg-amber-900 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
