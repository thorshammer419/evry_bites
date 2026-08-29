import { cookies } from "next/headers";
import { computeSessionToken } from "../../../lib/auth";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;
  const expected = await computeSessionToken(process.env.ADMIN_PASSWORD!);
  const isAuthenticated = sessionCookie === expected;

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col">
      {isAuthenticated && <AdminNav />}
      <main className="flex-1">{children}</main>
    </div>
  );
}
