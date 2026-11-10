import { redirect } from "next/navigation";
import { getSessionUser, homeForRole } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; from?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(homeForRole(user.role));
  const query = await searchParams;
  const next = typeof query.next === "string" && query.next.startsWith("/") && !query.next.startsWith("//") ? query.next : undefined;

  return <LoginForm next={next} fromEstimate={query.from === "estimate"} />;
}
