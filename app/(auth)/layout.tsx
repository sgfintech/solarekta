import Link from "next/link";
import { Logo } from "@/components/logo";
import { Check, Shield } from "@/components/icons";
import { EnergyFlowIllustration } from "@/components/illustrations/energy-flow";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside aria-label="About SOLARekta" className="relative hidden overflow-hidden bg-forest-deep p-10 text-white lg:flex lg:flex-col lg:justify-between lg:gap-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sun/10 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-lime/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <Logo tone="light" size="md" />
        </div>
        <div className="relative max-w-md">
          <div className="hidden rounded-3xl bg-white/95 p-3 shadow-lift [@media(min-height:940px)]:block">
            <EnergyFlowIllustration className="h-auto w-full" />
          </div>
          <h2 className="display-lg [@media(min-height:940px)]:mt-8">A clearer way to go solar in the Philippines.</h2>
          <p className="mt-4 text-[#d6ead0]">
            Real bill. Real assumptions. Structured installer quotes you can compare line by line.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-[#e4f2d8]">
            {[
              "Deterministic savings scenarios, never an AI guess",
              "Bills stored privately, served only to you",
              "Contact details shared only with your consent",
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-sun" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-[#b8d9a6]">
          <Shield className="h-4 w-4" /> Built with the Philippine Data Privacy Act in mind
        </div>
      </aside>

      <div className="flex flex-col bg-paper">
        <header className="flex items-center justify-between gap-3 px-5 py-4 lg:hidden">
          <Logo size="sm" />
          <Link href="/" className="btn btn-ghost btn-sm">
            Back home
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-5 py-8 sm:px-10 sm:py-12">
          <div className="intro w-full max-w-md">
            <div className="rounded-[1.5rem] border border-line bg-white p-6 shadow-soft sm:p-8">{children}</div>
          </div>
        </main>
        <footer className="px-5 pb-6 text-center text-xs text-muted sm:px-10">
          <Link href="/privacy" className="inline-flex min-h-7 items-center hover:text-forest hover:underline">Privacy</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <Link href="/terms" className="inline-flex min-h-7 items-center hover:text-forest hover:underline">Terms</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <Link href="/safety" className="inline-flex min-h-7 items-center hover:text-forest hover:underline">Safety</Link>
        </footer>
      </div>
    </div>
  );
}
