"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICONS, isActivePath, NAV } from "@/components/app-sidebar";
import type { Role } from "@/lib/types";

/** Thumb-reachable navigation for the four most-used dashboard destinations on phones. */
export function BottomNav({ role, unread = 0 }: { role: Role; unread?: number }) {
  const pathname = usePathname();
  const items = NAV[role].flatMap((g) => g.items).filter((i) => i.primary).slice(0, 4);
  return (
    <nav className="bottom-nav lg:hidden" aria-label="Quick navigation">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActivePath(pathname, item.href);
        const count = item.badge === "notifications" ? unread : 0;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            <span className="bottom-nav-icon">
              <Icon className="h-5 w-5" />
            </span>
            {item.short ?? item.label}
            {count > 0 ? <span className="nav-count" aria-label={`${count} unread`}>{count > 9 ? "9+" : count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
