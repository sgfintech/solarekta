import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata = { title: "Customer dashboard" };

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["customer"]);
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
