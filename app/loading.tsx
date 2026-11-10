export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton mt-3 h-9 w-2/3 max-w-md" />
        <div className="skeleton mt-3 h-4 w-full max-w-xl" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton mt-6 h-48" />
      </div>
    </div>
  );
}
