import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { computeSessionToken } from "./lib/auth";

const TEST_PASSWORD = "test-admin-password";

vi.stubEnv("ADMIN_PASSWORD", TEST_PASSWORD);

// Import after env stub so the module sees the right env at call time
const { middleware } = await import("./middleware");

let validToken: string;

beforeAll(async () => {
  validToken = await computeSessionToken(TEST_PASSWORD);
});

describe("admin middleware", () => {
  it("passes /admin/login through without a session cookie", async () => {
    const req = new NextRequest("http://localhost/admin/login");
    const res = await middleware(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects /admin/orders to /admin/login when no cookie is present", async () => {
    const req = new NextRequest("http://localhost/admin/orders");
    const res = await middleware(req);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("allows /admin/orders through when the valid session cookie is present", async () => {
    const req = new NextRequest("http://localhost/admin/orders", {
      headers: { cookie: `admin_session=${validToken}` },
    });
    const res = await middleware(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects /admin/orders to /admin/login when the cookie value is wrong", async () => {
    const req = new NextRequest("http://localhost/admin/orders", {
      headers: { cookie: "admin_session=not-the-right-token" },
    });
    const res = await middleware(req);
    expect(res.headers.get("location")).toContain("/admin/login");
  });
});
