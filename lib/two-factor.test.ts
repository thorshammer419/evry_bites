import { describe, it, expect } from "vitest";
import {
  isAllowedPhone,
  generateVerificationCode,
  isCodeExpired,
  hasAttemptsRemaining,
  canRequestNewCode,
} from "./two-factor";

describe("isAllowedPhone", () => {
  it("matches an exact entry in the allowlist", () => {
    expect(isAllowedPhone("+16055551234", "+16055551234,+16055555678")).toBe(true);
  });

  it("returns false for a number not on the allowlist", () => {
    expect(isAllowedPhone("+16055559999", "+16055551234,+16055555678")).toBe(false);
  });

  it("ignores spaces and dashes when comparing", () => {
    expect(isAllowedPhone("+1 605-555-1234", "+16055551234")).toBe(true);
    expect(isAllowedPhone("+16055551234", "+1 605-555-1234")).toBe(true);
  });

  it("ignores surrounding whitespace on allowlist entries", () => {
    expect(isAllowedPhone("+16055551234", " +16055551234 , +16055555678 ")).toBe(true);
  });

  it("returns false for an empty allowlist", () => {
    expect(isAllowedPhone("+16055551234", "")).toBe(false);
  });

  it("returns false for an empty phone number", () => {
    expect(isAllowedPhone("", "+16055551234")).toBe(false);
  });
});

describe("generateVerificationCode", () => {
  it("returns a 6-digit numeric string", () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("produces different codes across calls (not a constant)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateVerificationCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("isCodeExpired", () => {
  const expiresAt = new Date("2026-01-01T00:10:00Z");

  it("is not expired before the expiry time", () => {
    expect(isCodeExpired(expiresAt, new Date("2026-01-01T00:09:59Z"))).toBe(false);
  });

  it("is expired exactly at the expiry time", () => {
    expect(isCodeExpired(expiresAt, new Date("2026-01-01T00:10:00Z"))).toBe(true);
  });

  it("is expired after the expiry time", () => {
    expect(isCodeExpired(expiresAt, new Date("2026-01-01T00:10:01Z"))).toBe(true);
  });
});

describe("hasAttemptsRemaining", () => {
  it("allows attempts below the cap", () => {
    expect(hasAttemptsRemaining(0)).toBe(true);
    expect(hasAttemptsRemaining(4)).toBe(true);
  });

  it("blocks once 5 attempts have been recorded", () => {
    expect(hasAttemptsRemaining(5)).toBe(false);
  });

  it("blocks beyond the cap", () => {
    expect(hasAttemptsRemaining(6)).toBe(false);
  });
});

describe("canRequestNewCode", () => {
  it("allows a request when no code has ever been sent", () => {
    expect(canRequestNewCode(null, new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("blocks a request within the 60-second throttle window", () => {
    const lastSentAt = new Date("2026-01-01T00:00:00Z");
    expect(canRequestNewCode(lastSentAt, new Date("2026-01-01T00:00:59Z"))).toBe(false);
  });

  it("allows a request exactly at the 60-second boundary", () => {
    const lastSentAt = new Date("2026-01-01T00:00:00Z");
    expect(canRequestNewCode(lastSentAt, new Date("2026-01-01T00:01:00Z"))).toBe(true);
  });

  it("allows a request after the throttle window", () => {
    const lastSentAt = new Date("2026-01-01T00:00:00Z");
    expect(canRequestNewCode(lastSentAt, new Date("2026-01-01T00:01:01Z"))).toBe(true);
  });
});
