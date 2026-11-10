"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the browser console useful without leaking server details into the UI.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <main id="main" className="shell flex flex-1 items-center py-16">
        <div className="max-w-xl">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="display-lg mt-3 text-forest-deep">This page could not load.</h1>
          <p className="mt-4 text-ink-soft">
            Your data was not changed. Try again, or return to the dashboard. If the problem persists, note the reference
            below and contact support.
          </p>
          {error.digest ? <p className="mt-3 font-mono text-xs text-muted">Reference: {error.digest}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="btn btn-primary">
              Try again
            </button>
            <Link href="/app" className="btn btn-secondary">Open dashboard</Link>
            <Link href="/" className="btn btn-ghost">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
