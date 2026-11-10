import { dateTime, titleCase } from "@/lib/format";

export function Timeline({
  events,
  label,
}: {
  events: { actor_role: string; to_status: string; note: string | null; created_at: string }[];
  label: (status: string) => string;
}) {
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {events.map((event, index) => (
        <li key={`${event.created_at}-${index}`} className="relative">
          <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-lime" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">{label(event.to_status)}</p>
          {event.note ? <p className="mt-0.5 text-sm text-ink-soft">{event.note}</p> : null}
          <p className="text-xs text-muted">
            {dateTime(event.created_at)} · {titleCase(event.actor_role)}
          </p>
        </li>
      ))}
    </ol>
  );
}
