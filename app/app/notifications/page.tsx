import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listNotifications } from "@/lib/data";
import { markNotificationsReadAction } from "@/app/actions/settings";
import { PageHeader } from "@/components/page-header";
import { shortDate } from "@/lib/format";
import Link from "next/link";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser(["customer", "installer"]);
  const notifications = listNotifications(user.id, 50);
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Quote updates, verification decisions and account activity. This pilot does not send email or SMS."
        actions={
          unread > 0 ? (
            <form action={markNotificationsReadAction}>
              <button type="submit" className="btn btn-secondary btn-sm">Mark all as read</button>
            </form>
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-ink-soft">Nothing yet.</div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li key={n.id} className={`card px-5 py-4 ${n.read_at ? "" : "border-forest/25 bg-mint/25"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className={`text-sm ${n.read_at ? "text-ink-soft" : "font-semibold text-ink"}`}>{n.title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{n.body}</p>
                  {n.href ? (
                    <Link href={n.href} className="link-action mt-2 text-xs">
                      Open
                    </Link>
                  ) : null}
                </div>
                <span className="text-xs text-muted">{shortDate(n.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
