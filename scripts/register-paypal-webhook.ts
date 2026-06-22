/**
 * Registers (or updates) the PayPal webhook subscription to include
 * PAYMENT.CAPTURE.COMPLETED and INVOICING.INVOICE.PAID.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/register-paypal-webhook.ts
 *
 * Set PAYPAL_WEBHOOK_URL to override the default endpoint (useful for
 * pointing sandbox events at a tunnel like ngrok during local testing).
 */

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const MODE = process.env.PAYPAL_MODE ?? "sandbox";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://evrybites.com";
const WEBHOOK_URL = process.env.PAYPAL_WEBHOOK_URL ?? `${APP_URL}/api/paypal/webhook`;

const BASE = MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const EVENTS = [
  { name: "PAYMENT.CAPTURE.COMPLETED" },
  { name: "INVOICING.INVOICE.PAID" },
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
  process.exit(1);
}

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function listWebhooks(token: string): Promise<{ id: string; url: string; event_types: { name: string }[] }[]> {
  const res = await fetch(`${BASE}/v1/notifications/webhooks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { webhooks?: { id: string; url: string; event_types: { name: string }[] }[] };
  return data.webhooks ?? [];
}

async function createWebhook(token: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/notifications/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: WEBHOOK_URL, event_types: EVENTS }),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { id: string };
  console.log(`✓ Created webhook ${data.id} → ${WEBHOOK_URL}`);
  console.log(`  Events: ${EVENTS.map((e) => e.name).join(", ")}`);
}

async function updateWebhook(token: string, webhookId: string, existingEvents: { name: string }[]): Promise<void> {
  const existingNames = new Set(existingEvents.map((e) => e.name));
  const merged = [...existingEvents];
  for (const e of EVENTS) {
    if (!existingNames.has(e.name)) merged.push(e);
  }

  const res = await fetch(`${BASE}/v1/notifications/webhooks/${webhookId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify([{ op: "replace", path: "/event_types", value: merged }]),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`);
  console.log(`✓ Updated webhook ${webhookId} → ${WEBHOOK_URL}`);
  console.log(`  Events: ${merged.map((e) => e.name).join(", ")}`);
}

async function main() {
  console.log(`Mode: ${MODE}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}\n`);

  const token = await getToken();
  const webhooks = await listWebhooks(token);

  const existing = webhooks.find((w) => w.url === WEBHOOK_URL);

  if (existing) {
    console.log(`Found existing webhook ${existing.id}`);
    console.log(`  Current events: ${existing.event_types.map((e) => e.name).join(", ")}`);
    await updateWebhook(token, existing.id, existing.event_types);
  } else {
    console.log("No existing webhook found for this URL — creating new one");
    await createWebhook(token);
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
