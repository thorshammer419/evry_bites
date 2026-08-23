"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { computeSessionToken } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { sendVerificationCodeEmail } from "../../../lib/acs-notifier";
import {
  isAllowedEmail,
  generateVerificationCode,
  isCodeExpired,
  hasAttemptsRemaining,
  canRequestNewCode,
} from "../../../lib/two-factor";

const EMAIL_COOKIE = "admin_2fa_email";
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function normalizeEmail(rawEmail: string): string | null {
  const trimmed = rawEmail.trim().toLowerCase();
  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

function setEmailCookie(cookieStore: CookieStore, email: string) {
  cookieStore.set(EMAIL_COOKIE, email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CODE_LIFETIME_MS / 1000,
    path: "/",
  });
}

async function issueCodeFor(email: string) {
  const code = generateVerificationCode();
  await db.adminVerificationCode.create({
    data: {
      email,
      code,
      expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
    },
  });

  sendVerificationCodeEmail(email, code).catch((err) =>
    console.error("[admin-login] verification code email failed:", err)
  );
}

export async function loginAction(formData: FormData) {
  const password = formData.get("password") as string;
  const rawEmail = formData.get("email") as string;

  if (password !== process.env.ADMIN_PASSWORD) {
    redirect("/admin/login?error=password");
  }

  const email = normalizeEmail(rawEmail ?? "");
  if (!email) {
    redirect("/admin/login?error=email_format");
  }

  if (!isAllowedEmail(email, process.env.ADMIN_TRUSTED_EMAILS ?? "")) {
    redirect("/admin/login?error=email_not_allowed");
  }

  await issueCodeFor(email);

  const cookieStore = await cookies();
  setEmailCookie(cookieStore, email);

  redirect("/admin/login");
}

export async function resendCodeAction() {
  const cookieStore = await cookies();
  const email = cookieStore.get(EMAIL_COOKIE)?.value;

  if (!email) {
    redirect("/admin/login?error=no_pending_code");
  }

  const lastCode = await db.adminVerificationCode.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });

  if (lastCode && !canRequestNewCode(lastCode.createdAt, new Date())) {
    redirect("/admin/login?error=resend_throttled");
  }

  await issueCodeFor(email);
  setEmailCookie(cookieStore, email);

  redirect("/admin/login?resent=1");
}

export async function verifyCodeAction(formData: FormData) {
  const submittedCode = formData.get("code") as string;
  const cookieStore = await cookies();
  const email = cookieStore.get(EMAIL_COOKIE)?.value;

  if (!email) {
    redirect("/admin/login?error=no_pending_code");
  }

  const record = await db.adminVerificationCode.findFirst({
    where: { email, used: false },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    redirect("/admin/login?error=code_not_found");
  }

  if (!hasAttemptsRemaining(record.attempts)) {
    redirect("/admin/login?error=code_locked");
  }

  if (isCodeExpired(record.expiresAt, new Date())) {
    redirect("/admin/login?error=code_expired");
  }

  if (record.code !== submittedCode) {
    await db.adminVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    redirect("/admin/login?error=code_wrong");
  }

  await db.adminVerificationCode.update({
    where: { id: record.id },
    data: { used: true },
  });

  const token = await computeSessionToken(process.env.ADMIN_PASSWORD!);
  cookieStore.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  cookieStore.delete(EMAIL_COOKIE);

  redirect("/admin/orders");
}
