import "server-only";
import { headers } from "next/headers";
import { clientIp } from "@/lib/rate-limit";

export async function requestContext() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") ?? undefined };
}
