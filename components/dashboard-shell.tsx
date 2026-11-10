import { AppSidebar } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { MobileMenu } from "@/components/mobile-menu";
import { BottomNav } from "@/components/bottom-nav";
import { db } from "@/lib/db";
import type { Role, SessionUser } from "@/lib/types";

export function DashboardShell({
  user,
  context,
  children,
}: {
  user: SessionUser;
  context?: string;
  children: React.ReactNode;
}) {
  const unread = (db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL").get(user.id) as { c: number }).c;
  const home = user.role === "admin" ? "/admin" : user.role === "installer" ? "/installer" : user.role === "supplier" ? "/supplier" : "/app";
  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="hidden border-r border-line bg-white lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto px-4 py-5">
          <AppSidebar role={user.role as Role} name={user.name} email={user.email} context={context} unread={unread} />
        </div>
      </div>

      <div className="min-w-0">
        <header aria-label="Dashboard header" className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <Logo href={home} size="sm" />
          <MobileMenu panelClassName="w-72 p-3">
            <AppSidebar role={user.role as Role} name={user.name} email={user.email} context={context} unread={unread} compact />
          </MobileMenu>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
        <BottomNav role={user.role as Role} unread={unread} />
      </div>
    </div>
  );
}
