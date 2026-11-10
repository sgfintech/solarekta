"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { getInstallerByUserId } from "@/lib/data";
import { saveUpload, UploadError } from "@/lib/files";
import { uniqueSlug } from "@/lib/slug";
import { requestContext } from "@/lib/request";
import { field, installerApplicationSchema, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";

export async function saveInstallerProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["installer"]);
  if (!user) return { error: "Please log in as an installer." };

  const parsed = installerApplicationSchema.safeParse({
    businessName: field(formData, "businessName"),
    about: field(formData, "about"),
    phone: field(formData, "phone"),
    serviceAreas: field(formData, "serviceAreas"),
    licenseNo: field(formData, "licenseNo"),
    yearsExperience: field(formData, "yearsExperience"),
    website: field(formData, "website"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const d = parsed.data;

  const areas = Array.from(
    new Set(
      d.serviceAreas
        .split(/[,\n]/)
        .map((area) => area.trim())
        .filter(Boolean)
        .slice(0, 12),
    ),
  );
  if (areas.length === 0) return { error: "List at least one city or province you serve." };

  const existing = getInstallerByUserId(user.id);
  const timestamp = nowIso();
  const nowStatus = existing?.verification_status;
  const nextStatus = !nowStatus || nowStatus === "draft" || nowStatus === "rejected" ? "pending" : nowStatus;

  if (existing) {
    db.prepare(
      `UPDATE installers SET business_name=?, about=?, website=?, phone=?, service_areas_json=?, license_no=?,
         years_experience=?, verification_status=?, updated_at=? WHERE id=?`,
    ).run(
      d.businessName,
      d.about,
      d.website || null,
      d.phone,
      JSON.stringify(areas),
      d.licenseNo || null,
      d.yearsExperience,
      nextStatus,
      timestamp,
      existing.id,
    );
    if (nextStatus === "pending" && nowStatus !== "pending") {
      db.prepare(
        "INSERT INTO verification_events (id, installer_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'submitted', ?, ?)",
      ).run(newId(), existing.id, user.id, "Profile submitted for manual review", timestamp);
    }
  } else {
    const slug = uniqueSlug(d.businessName, (candidate) => Boolean(db.prepare("SELECT 1 FROM installers WHERE slug = ?").get(candidate)));
    const id = newId();
    db.prepare(
      `INSERT INTO installers (id, user_id, business_name, slug, about, website, phone, service_areas_json,
         verification_status, license_no, years_experience, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    ).run(id, user.id, d.businessName, slug, d.about, d.website || null, d.phone, JSON.stringify(areas), d.licenseNo || null, d.yearsExperience, timestamp, timestamp);
    db.prepare(
      "INSERT INTO verification_events (id, installer_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, 'submitted', ?, ?)",
    ).run(newId(), id, user.id, "Initial application submitted", timestamp);
  }

  // Alert admins without exposing installer credentials in the notification body.
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all() as { id: string }[];
  const insertNotification = db.prepare(
    "INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, 'verification', 'Installer application to review', ?, '/admin/installers', ?)",
  );
  for (const admin of admins) {
    insertNotification.run(newId(), admin.id, `${d.businessName} submitted documents for manual review.`, timestamp);
  }

  const ctx = await requestContext();
  logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: existing ? "installer.profile_updated" : "installer.applied",
    entityType: "installer",
    entityId: existing?.id ?? user.id,
    metadata: { status: nextStatus },
    ip: ctx.ip,
  });
  redirect("/installer/profile?saved=1");
}

export async function uploadInstallerDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser(["installer"]);
  if (!user) return { error: "Please log in as an installer." };
  const installer = getInstallerByUserId(user.id);
  if (!installer) return { error: "Save your business profile before uploading documents." };

  const kind = field(formData, "kind");
  if (!["sec_registration", "mayors_permit", "license", "insurance", "other"].includes(kind)) {
    return { error: "Choose a document type." };
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a document to upload." };

  try {
    const saved = await saveUpload(file, user.id, "installer_document");
    const timestamp = nowIso();
    db.prepare(
      `INSERT INTO installer_documents (id, installer_id, file_id, kind, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    ).run(newId(), installer.id, saved.id, kind, timestamp);
    const ctx = await requestContext();
    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: "installer.document_uploaded",
      entityType: "installer",
      entityId: installer.id,
      metadata: { kind },
      ip: ctx.ip,
    });
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Upload failed. Try a smaller file." };
  }
  redirect("/installer/profile?saved=document");
}
