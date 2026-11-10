"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { clearAllDrafts } from "@/components/survey/client-utils";
import { logoutAction } from "@/app/actions/auth";
import { Bell, Bill, Box, Cart, Clipboard, HomeIcon, Lock, Panel, Roof, Settings, Shield, Sparkles, Users } from "@/components/dashboard-icons";
import type { Role } from "@/lib/types";

export type NavIcon = keyof typeof ICONS;
export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  short?: string;
  icon: NavIcon;
  /** Shown in the mobile bottom bar (max 4 per role). */
  primary?: boolean;
  badge?: "notifications";
}

/** Dashboard navigation, grouped by job-to-be-done. */
export const NAV: Record<Role, { section: string; items: NavItem[] }[]> = {
  customer: [
    {
      section: "Solar",
      items: [
        { href: "/app", label: "Overview", icon: "home", primary: true },
        { href: "/app/sites", label: "My properties", short: "Properties", icon: "roof", primary: true },
        { href: "/app/quotes", label: "Quote requests", short: "Quotes", icon: "bill", primary: true },
        { href: "/app/surveys", label: "Site surveys", icon: "clipboard" },
      ],
    },
    {
      section: "Equipment",
      items: [
        { href: "/app/advisor", label: "Ask Solar AI", short: "Ask AI", icon: "sparkles", primary: true },
        { href: "/app/orders", label: "Equipment orders", icon: "cart" },
        { href: "/app/supplier-quotes", label: "Supplier quotations", icon: "box" },
      ],
    },
    {
      section: "Account",
      items: [
        { href: "/app/notifications", label: "Notifications", icon: "bell", badge: "notifications" },
        { href: "/app/settings", label: "Settings & privacy", icon: "settings" },
      ],
    },
  ],
  installer: [
    {
      section: "Work",
      items: [
        { href: "/installer", label: "Pipeline", icon: "home", primary: true },
        { href: "/installer/leads", label: "Lead inbox", short: "Leads", icon: "users", primary: true },
        { href: "/installer/surveys", label: "Site surveys", short: "Surveys", icon: "clipboard", primary: true },
      ],
    },
    {
      section: "Equipment",
      items: [
        { href: "/installer/equipment", label: "Equipment catalogue", short: "Catalogue", icon: "panel" },
        { href: "/installer/price-requests", label: "Price requests", icon: "bill" },
        { href: "/installer/advisor", label: "Ask Solar AI", short: "Ask AI", icon: "sparkles", primary: true },
      ],
    },
    { section: "Account", items: [{ href: "/installer/profile", label: "Business profile", icon: "settings" }] },
  ],
  supplier: [
    {
      section: "Sales",
      items: [
        { href: "/supplier", label: "Overview", icon: "home", primary: true },
        { href: "/supplier/orders", label: "Buyer orders", short: "Orders", icon: "cart", primary: true },
        { href: "/supplier/requests", label: "Price & quotation requests", short: "Requests", icon: "bill", primary: true },
      ],
    },
    { section: "Catalogue", items: [{ href: "/supplier/products", label: "Products", icon: "box", primary: true }] },
    { section: "Account", items: [{ href: "/supplier/profile", label: "Business profile", icon: "settings" }] },
  ],
  admin: [
    { section: "Operations", items: [{ href: "/admin", label: "Operations", icon: "home", primary: true }] },
    {
      section: "Review",
      items: [
        { href: "/admin/installers", label: "Installer review", short: "Installers", icon: "shield", primary: true },
        { href: "/admin/suppliers", label: "Supplier review", icon: "shield" },
        { href: "/admin/products", label: "Product review", short: "Products", icon: "box", primary: true },
        { href: "/admin/quotes", label: "Quote moderation", short: "Quotes", icon: "bill" },
        { href: "/admin/surveys", label: "Survey review", short: "Surveys", icon: "clipboard", primary: true },
      ],
    },
    {
      section: "Compliance",
      items: [
        { href: "/admin/data-requests", label: "Data requests", icon: "lock" },
        { href: "/admin/audit", label: "Audit log", icon: "clipboard" },
      ],
    },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  customer: "Homeowner / business",
  installer: "Installer",
  supplier: "Supplier",
  admin: "Admin",
};

export const ICONS = {
  home: HomeIcon,
  roof: Roof,
  bill: Bill,
  bell: Bell,
  settings: Settings,
  users: Users,
  shield: Shield,
  lock: Lock,
  box: Box,
  cart: Cart,
  panel: Panel,
  sparkles: Sparkles,
  clipboard: Clipboard,
};

const ROOTS = ["/app", "/installer", "/admin", "/supplier"];
export function isActivePath(pathname: string, href: string) {
  return href === pathname || (!ROOTS.includes(href) && pathname.startsWith(`${href}/`)) || (!ROOTS.includes(href) && pathname === href);
}

export function AppSidebar({
  role,
  name,
  email,
  context,
  compact = false,
  unread = 0,
}: {
  role: Role;
  name: string;
  email: string;
  context?: string;
  compact?: boolean;
  unread?: number;
}) {
  const pathname = usePathname();
  const groups = NAV[role];
  const isActive = (href: string) => isActivePath(pathname, href);

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <aside className="flex h-full flex-col" aria-label={compact ? "Account and navigation" : "Sidebar"}>
      {compact ? null : (
        <div className="px-1 pb-6">
          <Logo href={role === "admin" ? "/admin" : role === "installer" ? "/installer" : role === "supplier" ? "/supplier" : "/app"} size="md" />
        </div>
      )}
      {context ? (
        <p className="mb-4 rounded-xl border border-[#f5d68a] bg-sun-soft px-3 py-2 text-xs leading-snug text-[#6b4708]">{context}</p>
      ) : null}
      <nav className="flex-1 pl-2" aria-label={compact ? "Dashboard menu" : "Dashboard"}>
        {groups.map((group) => (
          <div key={group.section}>
            <p className="nav-section" aria-hidden="true">{group.section}</p>
            <ul className="space-y-1" aria-label={group.section}>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(item.href);
                const count = item.badge === "notifications" ? unread : 0;
                return (
                  <li key={item.href}>
                    <Link href={item.href} className="app-link" data-active={active} aria-current={active ? "page" : undefined}>
                      <Icon className="h-[1.1rem] w-[1.1rem] shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {count > 0 ? (
                        <span className="nav-count" aria-label={`${count} unread`}>
                          {count > 9 ? "9+" : count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-6 border-t border-line pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-paper px-3 py-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-bold text-white"
            aria-hidden="true"
          >
            {initials || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <p className="mt-0.5 text-xs font-medium text-leaf">{ROLE_LABEL[role]}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <Link href="/" className="link-action link-muted px-1 text-xs font-medium">
            Public site
          </Link>
          <form action={logoutAction} onSubmit={() => clearAllDrafts()}>
            <button type="submit" className="link-action px-1 text-xs">
              Log out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
