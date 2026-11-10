import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { MobileMenu } from "@/components/mobile-menu";
import { ArrowRight } from "@/components/icons";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/equipment", label: "Equipment" },
  { href: "/installers", label: "Installers" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/advisor", label: "Ask Solar AI" },
];

export async function SiteHeader() {
  const user = await getSessionUser();
  const home = user ? (user.role === "admin" ? "/admin" : user.role === "installer" ? "/installer" : user.role === "supplier" ? "/supplier" : "/app") : "/login";

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/75">
      <div className="shell flex h-[4.5rem] items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="btn btn-ghost">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {user ? (
            <Link href={home} className="btn btn-primary btn-sm">
              Open dashboard <ArrowRight />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link href="/estimate" className="btn btn-primary btn-sm">
                Get my estimate
              </Link>
            </>
          )}
        </div>
        <div className="lg:hidden">
          <MobileMenu>
            <nav aria-label="Main" className="flex flex-col">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="app-link">
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="my-2 border-t border-line" />
            {user ? (
              <Link href={home} className="btn btn-primary w-full">
                Open dashboard
              </Link>
            ) : (
              <div className="flex flex-col gap-2 p-1">
                <Link href="/estimate" className="btn btn-primary w-full">
                  Get my estimate
                </Link>
                <Link href="/login" className="btn btn-secondary w-full">
                  Log in
                </Link>
              </div>
            )}
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
