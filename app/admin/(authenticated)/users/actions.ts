"use server";

import { clerkClient } from "@clerk/nextjs/server";

export async function approveUser(userId: string) {
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { cashCheckApproved: true },
  });
}

export async function revokeUser(userId: string) {
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { cashCheckApproved: false },
  });
}
