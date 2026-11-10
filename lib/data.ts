import "server-only";
import { db } from "@/lib/db";
import type {
  AssessmentRow,
  BillRow,
  InstallerRow,
  InstallerQuoteRow,
  QuoteRequestRow,
  SiteRow,
  UserRow,
} from "@/lib/types";

export function getSite(siteId: string, userId: string): SiteRow | undefined {
  return db.prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?").get(siteId, userId) as SiteRow | undefined;
}

export function getBill(billId: string, userId: string): BillRow | undefined {
  return db.prepare("SELECT * FROM electricity_bills WHERE id = ? AND user_id = ?").get(billId, userId) as
    | BillRow
    | undefined;
}

export function getAssessment(assessmentId: string, userId: string): AssessmentRow | undefined {
  return db
    .prepare("SELECT * FROM assessments WHERE id = ? AND user_id = ?")
    .get(assessmentId, userId) as AssessmentRow | undefined;
}

export function getInstallerByUserId(userId: string): InstallerRow | undefined {
  return db.prepare("SELECT * FROM installers WHERE user_id = ?").get(userId) as InstallerRow | undefined;
}

export function getInstaller(id: string): InstallerRow | undefined {
  return db.prepare("SELECT * FROM installers WHERE id = ?").get(id) as InstallerRow | undefined;
}

export function getQuoteRequestForCustomer(id: string, customerUserId: string): QuoteRequestRow | undefined {
  return db
    .prepare("SELECT * FROM quote_requests WHERE id = ? AND customer_user_id = ?")
    .get(id, customerUserId) as QuoteRequestRow | undefined;
}

export function getQuoteRequestForInstaller(id: string, installerId: string): QuoteRequestRow | undefined {
  return db
    .prepare(
      `SELECT qr.* FROM quote_requests qr
       JOIN quote_invites qi ON qi.quote_request_id = qr.id
       WHERE qr.id = ? AND qi.installer_id = ?`,
    )
    .get(id, installerId) as QuoteRequestRow | undefined;
}

export function listVerifiedInstallers(): InstallerRow[] {
  return db
    .prepare("SELECT * FROM installers WHERE verification_status = 'verified' ORDER BY business_name")
    .all() as InstallerRow[];
}

export function unreadNotificationCount(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .get(userId) as { count: number };
  return row.count;
}

export function listNotifications(userId: string, limit = 20) {
  return db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as {
    id: string;
    user_id: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    read_at: string | null;
    created_at: string;
  }[];
}

export function getQuoteForInvite(inviteId: string): InstallerQuoteRow | undefined {
  return db.prepare("SELECT * FROM installer_quotes WHERE invite_id = ?").get(inviteId) as
    | InstallerQuoteRow
    | undefined;
}

export function customerCanSeeContact(request: QuoteRequestRow, installer: InstallerRow) {
  return request.share_contact === 1 && installer.verification_status === "verified";
}

export function getUserById(id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export { parseServiceAreas } from "@/lib/service-areas";
