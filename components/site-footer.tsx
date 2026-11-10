import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-paper-deep">
      <div className="shell grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <Logo size="lg" eager={false} />
          <p className="mt-4 max-w-xs text-sm text-ink-soft">
            A Philippine pilot that turns a real electricity bill into a transparent solar estimate, then connects you
            directly with verified installers you can compare.
          </p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Product</p>
          <ul className="space-y-2.5 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/how-it-works">How it works</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/estimate">Free solar estimate</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/equipment">Equipment catalogue</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/advisor">Ask Solar AI</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/installers">Installer directory</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/suppliers">For suppliers</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/signup">Create an account</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/login">Log in</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Trust</p>
          <ul className="space-y-2.5 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/safety">Safety &amp; data</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/privacy">Privacy notice</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/terms">Terms of use</Link></li>
            <li><Link className="inline-flex min-h-7 items-center hover:text-forest" href="/installers#verification">Verification criteria</Link></li>
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-white/60 p-4">
          <p className="text-sm font-semibold text-ink">Good to know</p>
          <p className="mt-1.5 text-sm text-ink-soft">
            Estimates are indicative, not guarantees. SOLARekta is not an engineering certification body and does not
            promise utility or government approval. A licensed installer must verify every site.
          </p>
        </div>
      </div>
      <div className="border-t border-line/80">
        <div className="shell flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SOLARekta. All rights reserved.</p>
          <p>Built for Philippine rooftops, in English and Filipino-friendly copy.</p>
        </div>
      </div>
    </footer>
  );
}
