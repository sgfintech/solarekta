import { requireUser } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata = { title: "Admin operations" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["admin"]);
  return (
    <DashboardShell user={user} context="Operations console · actions are audit-logged">
      {children}
    </DashboardShell>
  );
}
