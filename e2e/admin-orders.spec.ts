import { test, expect } from "@playwright/test";
import { computeSessionToken } from "../lib/auth";

// ACS is effectively stubbed because ACS_CONNECTION_STRING is empty in the
// test environment — sendStatusNotification logs but does not call Azure.
// The test verifies the full UI flow: authenticate → view orders → advance status.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme";

const MOCK_ORDER = {
  id: "e2e-order-00000001",
  customerName: "Jane Smith",
  customerEmail: "jane@example.com",
  customerPhone: "605-555-1234",
  fulfillmentType: "local_delivery",
  address: "123 Main St, Rapid City, SD 57701",
  paymentMethod: "venmo",
  notes: null,
  status: "received",
  totalAmount: "24.00",
  paymentStatus: null,
  createdAt: new Date("2024-01-15T10:30:00Z").toISOString(),
  orderItems: [
    {
      id: "e2e-item-1",
      orderId: "e2e-order-00000001",
      productId: "e2e-product-1",
      quantity: 2,
      unitPrice: "12.00",
      subtotal: "24.00",
      product: {
        id: "e2e-product-1",
        name: "Chocolate Chip Cookies",
        unitLabel: "dozen",
      },
    },
  ],
};

function tRPCSuccess(data: unknown) {
  return {
    contentType: "application/json",
    body: JSON.stringify([
      {
        result: {
          data: {
            json: data,
            meta: { values: { "0.createdAt": ["Date"] } },
          },
        },
      },
    ]),
  };
}

test.describe("Admin order status management", () => {
  test("login → view order → advance to confirmed (ACS stubbed)", async ({
    page,
    context,
  }) => {
    // Inject the admin session cookie so we don't need the real login form
    const token = await computeSessionToken(ADMIN_PASSWORD);
    await context.addCookies([
      {
        name: "admin_session",
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // Track current status so the re-fetch after mutation returns the updated value
    let currentStatus = "received";

    // Mock orders.listAll — returns state-aware mock order
    await page.route("**/api/trpc/orders.listAll**", async (route) => {
      await route.fulfill(
        tRPCSuccess([{ ...MOCK_ORDER, status: currentStatus }])
      );
    });

    // Mock orders.updateStatus — advances status and updates state
    await page.route("**/api/trpc/orders.updateStatus**", async (route) => {
      const body = await route.request().postData();
      const parsed = body ? JSON.parse(body) : {};
      const newStatus = parsed?.[0]?.json?.status ?? parsed?.json?.status ?? "confirmed";
      currentStatus = newStatus;
      await route.fulfill(
        tRPCSuccess({ ...MOCK_ORDER, status: newStatus })
      );
    });

    // Navigate to admin orders
    await page.goto("/admin/orders");

    // The order row should appear with the customer name and received status
    await expect(page.getByText("Jane Smith")).toBeVisible();
    await expect(page.getByText("Received")).toBeVisible();

    // Expand the order row (the whole row is a button; target it by customer name)
    await page.getByRole("button").filter({ hasText: "Jane Smith" }).click();

    // Click the status advancement button
    await page.getByRole("button", { name: "Mark as Confirmed" }).click();

    // After mutation + re-fetch, the status badge should update
    await expect(page.getByText("Confirmed")).toBeVisible({ timeout: 5000 });
  });
});
