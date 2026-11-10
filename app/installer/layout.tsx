import { requireUser } from "@/lib/auth";
import { getInstallerByUserId } from "@/lib/data";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata = { title: "Installer workspace" };

export default async function InstallerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["installer"]);
  const installer = getInstallerByUserId(user.id);
  const context = installer
    ? `${installer.business_name} · ${installer.verification_status === "verified" ? "Verified" : installer.verification_status}`
    : "Business profile not submitted";

  return (
    <DashboardShell user={user} context={context}>
      {children}
    </DashboardShell>
  );
}
