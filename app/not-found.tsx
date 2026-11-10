import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line">
        <div className="shell flex h-[4.5rem] items-center">
          <Logo />
        </div>
      </header>
      <main id="main" className="shell flex flex-1 items-center py-16">
        <div className="max-w-xl">
          <p className="eyebrow">404</p>
          <h1 className="display-lg mt-3 text-forest-deep">We could not find that page.</h1>
          <p className="mt-4 text-ink-soft">
            The link may be old, or the record may have been deleted or archived. Nothing was changed.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/" className="btn btn-primary">Back to home</Link>
            <Link href="/app" className="btn btn-secondary">Open dashboard</Link>
            <Link href="/login" className="btn btn-ghost">Log in</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
