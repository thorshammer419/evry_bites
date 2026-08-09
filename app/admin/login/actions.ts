"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { computeSessionToken } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { toE164, sendVerificationCodeSms } from "../../../lib/acs-notifier";
import {
  isAllowedPhone,
  generateVerificationCode,
  isCodeExpired,
} from "../../../lib/two-factor";

const PHONE_COOKIE = "admin_2fa_phone";
const CODE_LIFETIME_MS = 10 * 60 * 1000;

export async function loginAction(formData: FormData) {
  const password = formData.get("password") as string;
  const rawPhone = formData.get("phone") as string;

  if (password !== process.env.ADMIN_PASSWORD) {
    redirect("/admin/login?error=password");
  }

  const phone = toE164(rawPhone ?? "");
  if (!phone) {
    redirect("/admin/login?error=phone_format");
  }

  if (!isAllowedPhone(phone, process.env.ADMIN_TRUSTED_PHONES ?? "")) {
    redirect("/admin/login?error=phone_not_allowed");
  }

  const code = generateVerificationCode();
  await db.adminVerificationCode.create({
    data: {
      phone,
      code,
      expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
    },
  });

  sendVerificationCodeSms(phone, code).catch((err) =>
    console.error("[admin-login] verification code SMS failed:", err)
  );

  const cookieStore = await cookies();
  cookieStore.set(PHONE_COOKIE, phone, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CODE_LIFETIME_MS / 1000,
    path: "/",
  });

  redirect("/admin/login");
}

export async function verifyCodeAction(formData: FormData) {
  const submittedCode = formData.get("code") as string;
  const cookieStore = await cookies();
  const phone = cookieStore.get(PHONE_COOKIE)?.value;

  if (!phone) {
    redirect("/admin/login?error=no_pending_code");
  }

  const record = await db.adminVerificationCode.findFirst({
    where: { phone, used: false },
    orderBy: { createdAt: "desc" },
  });

  if (
    !record ||
    isCodeExpired(record.expiresAt, new Date()) ||
    record.code !== submittedCode
  ) {
    redirect("/admin/login?error=code");
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
  cookieStore.delete(PHONE_COOKIE);

  redirect("/admin/orders");
}
