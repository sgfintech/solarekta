import { redirect } from "next/navigation";
import { getSessionUser, homeForRole } from "@/lib/auth";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; from?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect(homeForRole(user.role));
  const query = await searchParams;
  const initialRole = query.role === "installer" ? "installer" : query.role === "supplier" ? "supplier" : "customer";

  return <SignupForm initialRole={initialRole} fromEstimate={query.from === "estimate"} />;
}
