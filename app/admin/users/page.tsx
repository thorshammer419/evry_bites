import { clerkClient } from "@clerk/nextjs/server";
import { AdminUsersClient } from "./AdminUsersClient";

export default async function AdminUsersPage() {
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({
    limit: 100,
    orderBy: "-created_at",
  });

  const userData = users.map((u) => ({
    id: u.id,
    email: u.emailAddresses[0]?.emailAddress ?? "",
    firstName: u.firstName,
    lastName: u.lastName,
    cashCheckApproved: Boolean(u.publicMetadata?.cashCheckApproved),
    createdAt: u.createdAt,
  }));

  return <AdminUsersClient users={userData} />;
}
