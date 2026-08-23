const ATTEMPT_CAP = 5;
const RESEND_THROTTLE_MS = 60_000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string, allowlist: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const entries = allowlist
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

  return entries.includes(normalized);
}

export function generateVerificationCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function isCodeExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function hasAttemptsRemaining(attempts: number): boolean {
  return attempts < ATTEMPT_CAP;
}

export function canRequestNewCode(lastSentAt: Date | null, now: Date): boolean {
  if (lastSentAt === null) return true;
  return now.getTime() - lastSentAt.getTime() >= RESEND_THROTTLE_MS;
}
