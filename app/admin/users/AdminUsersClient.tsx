"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveUser, revokeUser } from "./actions";

type ClerkUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  cashCheckApproved: boolean;
  createdAt: number;
};

function UserRow({ user }: { user: ClerkUser }) {
  const [approved, setApproved] = useState(user.cashCheckApproved);
  const [isPending, startTransition] = useTransition();

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
  const date = new Date(user.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  function toggle() {
    startTransition(async () => {
      if (approved) {
        await revokeUser(user.id);
        setApproved(false);
      } else {
        await approveUser(user.id);
        setApproved(true);
      }
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-100 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-amber-900 truncate">{name}</p>
          <p className="text-sm text-amber-600 truncate">{user.email}</p>
          <p className="text-xs text-amber-400 mt-0.5">Joined {date}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              approved ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {approved ? "Cash/Check Approved" : "Pending"}
          </span>
          <button
            onClick={toggle}
            disabled={isPending}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60 ${
              approved
                ? "border border-red-200 text-red-600 hover:bg-red-50"
                : "bg-amber-800 text-white hover:bg-amber-700"
            }`}
          >
            {isPending ? "..." : approved ? "Revoke" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminUsersClient({ users }: { users: ClerkUser[] }) {
  return (
    <div className="min-h-screen bg-amber-50 px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-amber-900">Customers</h1>
            <p className="text-sm text-amber-600 mt-0.5">{users.length} accounts</p>
          </div>
          <Link
            href="/admin/orders"
            className="border border-amber-200 text-amber-800 px-3 py-2 rounded-xl text-sm font-medium hover:bg-amber-50 transition-colors"
          >
            Orders →
          </Link>
        </div>

        {users.length === 0 && (
          <div className="text-center py-16 text-amber-500">
            <p className="text-3xl mb-3">👤</p>
            <p className="font-medium">No accounts yet</p>
            <p className="text-sm mt-1">Customers who create accounts will appear here</p>
          </div>
        )}

        <div className="space-y-3">
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </div>
      </div>
    </div>
  );
}
