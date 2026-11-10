import "server-only";

/**
 * CSRF defence for state-changing route handlers (server actions already check origin).
 * Requires the Origin header, when present, to match the request host. Session cookies are
 * also SameSite=Lax, so cross-site fetches don't carry them.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
