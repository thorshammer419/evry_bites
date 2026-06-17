const EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 hours

function encode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function decode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

async function hmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createApprovalToken(userId: string): Promise<string> {
  const secret = process.env.APPROVAL_TOKEN_SECRET;
  if (!secret) throw new Error("APPROVAL_TOKEN_SECRET not set");

  const payload = encode(JSON.stringify({ userId, expiresAt: Date.now() + EXPIRY_MS }));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyApprovalToken(
  token: string
): Promise<{ userId: string } | null> {
  const secret = process.env.APPROVAL_TOKEN_SECRET;
  if (!secret) return null;

  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(payload, secret);

  if (sig !== expected) return null;

  let parsed: { userId: string; expiresAt: number };
  try {
    parsed = JSON.parse(decode(payload));
  } catch {
    return null;
  }

  if (Date.now() > parsed.expiresAt) return null;
  return { userId: parsed.userId };
}
