import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { verifyApprovalToken } from "../../../../lib/approval-token";

function html(title: string, message: string, success: boolean) {
  const color = success ? "#14532d" : "#7f1d1d";
  const bg = success ? "#f0fdf4" : "#fef2f2";
  const border = success ? "#bbf7d0" : "#fecaca";
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#fffbeb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}.card{background:${bg};border:1px solid ${border};border-radius:1rem;padding:2rem;max-width:420px;width:100%;text-align:center}.emoji{font-size:2.5rem;margin-bottom:1rem}.title{font-size:1.25rem;font-weight:700;color:${color};margin-bottom:.5rem}.msg{color:${color};font-size:.95rem;line-height:1.5}.back{display:inline-block;margin-top:1.5rem;color:#92400e;font-size:.875rem;text-decoration:none;opacity:.7}.back:hover{opacity:1}</style></head><body><div class="card"><div class="emoji">${success ? "✅" : "❌"}</div><div class="title">${title}</div><p class="msg">${message}</p><a class="back" href="https://evrybites.com">← EvryBites</a></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");
  const token = searchParams.get("token");

  if ((action !== "approve" && action !== "deny") || !token) {
    return html("Invalid Link", "This link is malformed or incomplete.", false);
  }

  const verified = await verifyApprovalToken(token);
  if (!verified) {
    return html(
      "Link Expired",
      "This approval link has expired or is invalid. Links are valid for 72 hours.",
      false
    );
  }

  const { userId } = verified;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.emailAddresses[0]?.emailAddress ||
      "Customer";

    if (action === "approve") {
      await client.users.updateUser(userId, {
        publicMetadata: { cashCheckApproved: true },
      });
      return html(
        "Customer Approved",
        `${name} has been approved for Cash/Check payments.`,
        true
      );
    } else {
      await client.users.updateUser(userId, {
        publicMetadata: { cashCheckApproved: false },
      });
      return html(
        "Customer Denied",
        `${name} has been denied for Cash/Check payments.`,
        true
      );
    }
  } catch {
    return html("Error", "Something went wrong. Please try again.", false);
  }
}
