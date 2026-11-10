import { requireUser } from "@/lib/auth";
import { getSupplierByUserId } from "@/lib/marketplace-data";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata = { title: "Supplier workspace" };

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["supplier"]);
  const supplier = getSupplierByUserId(user.id);
  const context = supplier
    ? `${supplier.business_name} · ${supplier.verification_status === "verified" ? "Verified" : supplier.verification_status}`
    : "Company profile not submitted";
  return (
    <DashboardShell user={user} context={context}>
      {children}
    </DashboardShell>
  );
}
