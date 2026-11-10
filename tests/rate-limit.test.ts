import { afterEach, describe, expect, it } from "vitest";
import { clientIp, rateLimit, resetRateLimits } from "@/lib/rate-limit";

afterEach(() => resetRateLimits());

describe("rate limiter", () => {
  it("allows requests up to the limit and then blocks", () => {
    expect(rateLimit("login:1.2.3.4", 3, 60_000).ok).toBe(true);
    expect(rateLimit("login:1.2.3.4", 3, 60_000).ok).toBe(true);
    expect(rateLimit("login:1.2.3.4", 3, 60_000).ok).toBe(true);
    const blocked = rateLimit("login:1.2.3.4", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("keeps buckets independent", () => {
    rateLimit("a", 1, 60_000);
    expect(rateLimit("a", 1, 60_000).ok).toBe(false);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true);
  });

  it("resets buckets", () => {
    rateLimit("a", 1, 60_000);
    resetRateLimits();
    expect(rateLimit("a", 1, 60_000).ok).toBe(true);
  });
});

describe("client IP extraction", () => {
  it("uses the first forwarded address", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip and then local", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBe("local");
  });
});
