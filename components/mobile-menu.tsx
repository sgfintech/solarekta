"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "@/components/icons";

/**
 * Lightweight disclosure menu for small screens. Uses native <details> so it works
 * without JavaScript; the effect only closes it after navigation, on Escape and on
 * outside clicks.
 */
export function MobileMenu({
  children,
  label = "Menu",
  panelClassName = "w-64",
}: {
  children: React.ReactNode;
  label?: string;
  panelClassName?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (el) el.open = false;
  }, [pathname]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (el.open && !el.contains(event.target as Node)) el.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary className="btn btn-secondary btn-sm list-none [&::-webkit-details-marker]:hidden">
        <Menu className="h-4 w-4" />
        {label}
      </summary>
      <div
        className={`menu-panel absolute right-0 z-50 mt-2 max-h-[80vh] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-lift ${panelClassName}`}
      >
        {children}
      </div>
    </details>
  );
}
