"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { newId, nowIso } from "@/lib/ids";
import { logAudit } from "@/lib/audit";
import { deleteFile } from "@/lib/files";
import { requestContext } from "@/lib/request";
import { adminInstallerDecisionSchema, field, zodMessage } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";
import type { InstallerRow } from "@/lib/types";

export async function decideInstallerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await actionUser(["admin"]);
  if (!admin) return { error: "Admin access required." };
  const parsed = adminInstallerDecisionSchema.safeParse({
    installerId: field(formData, "installerId"),
    action: field(formData, "action"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  const { installerId, action, notes } = parsed.data;

  const installer = db.prepare("SELECT * FROM installers WHERE id = ?").get(installerId) as InstallerRow | undefined;
  if (!installer) return { error: "Installer not found." };

  const timestamp = nowIso();
  const nextStatus =
    action === "approve" || action === "reinstate"
      ? "verified"
      : action === "reject"
        ? "rejected"
        : "suspended";

  db.transaction(() => {
    db.prepare("UPDATE installers SET verification_status = ?, verified_at = ?, updated_at = ? WHERE id = ?").run(
      nextStatus,
      nextStatus === "verified" ? timestamp : null,
      timestamp,
      installerId,
    );
    db.prepare(
      "INSERT INTO verification_events (id, installer_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(newId(), installerId, admin.id, action, notes || null, timestamp);
    db.prepare(
      "INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, 'verification', ?, ?, '/installer/profile', ?)",
    ).run(
      newId(),
      installer.user_id,
      nextStatus === "verified" ? "Your business is verified" : `Verification status: ${nextStatus}`,
      notes || (nextStatus === "verified" ? "You can now receive opted-in leads and submit quotes." : "Open your profile to review next steps."),
      timestamp,
    );
  })();

  const ctx = await requestContext();
  logAudit({
    actorUserId: admin.id,
    actorRole: admin.role,
    action: `installer.${action}`,
    entityType: "installer",
    entityId: installerId,
    metadata: { from: installer.verification_status, to: nextStatus, note: notes },
    ip: ctx.ip,
  });
  redirect(`/admin/installers?done=${action}`);
}

export async function resolveDataRequestAction(formData: FormData) {
  const admin = await actionUser(["admin"]);
  if (!admin) redirect("/login");
  const requestId = field(formData, "requestId");
  const request = db
    .prepare("SELECT * FROM data_requests WHERE id = ?")
    .get(requestId) as { id: string; user_id: string; kind: "export" | "deletion"; status: string } | undefined;
  if (!request || request.status === "completed") redirect("/admin/data-requests");

  const timestamp = nowIso();
  const ctx = await requestContext();

  if (request.kind === "deletion") {
    const files = db.prepare("SELECT id FROM files WHERE owner_user_id = ?").all(request.user_id) as { id: string }[];
    for (const file of files) {
      await deleteFile(file.id);
    }

    db.transaction(() => {
      db.prepare("DELETE FROM sites WHERE user_id = ?").run(request.user_id);
      db.prepare("DELETE FROM installer_documents WHERE installer_id IN (SELECT id FROM installers WHERE user_id = ?)").run(request.user_id);
      db.prepare("DELETE FROM installers WHERE user_id = ?").run(request.user_id);
      db.prepare("DELETE FROM customer_profiles WHERE user_id = ?").run(request.user_id);
      db.prepare("DELETE FROM consents WHERE user_id = ?").run(request.user_id);
      db.prepare("DELETE FROM notifications WHERE user_id = ?").run(request.user_id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(request.user_id);
      db.prepare(
        `UPDATE users SET email = ?, name = 'Deleted account', phone = NULL, password_hash = ?, status = 'suspended', updated_at = ?
         WHERE id = ?`,
      ).run(`deleted+${request.user_id}@deleted.invalid`, `scrypt$${randomBytes(8).toString("hex")}$${randomBytes(32).toString("hex")}`, timestamp, request.user_id);
      db.prepare("UPDATE data_requests SET status = 'completed', resolved_at = ?, resolved_by = ? WHERE id = ?").run(
        timestamp,
        admin.id,
        request.id,
      );
    })();
  } else {
    db.prepare("UPDATE data_requests SET status = 'completed', resolved_at = ?, resolved_by = ? WHERE id = ?").run(
      timestamp,
      admin.id,
      request.id,
    );
  }

  logAudit({
    actorUserId: admin.id,
    actorRole: admin.role,
    action: `data_request.${request.kind}_completed`,
    entityType: "data_request",
    entityId: request.id,
    metadata: { userId: request.user_id },
    ip: ctx.ip,
  });
  redirect("/admin/data-requests?done=1");
}

export async function decideSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await actionUser(["admin"]);
  if (!admin) return { error: "Admin access required." };
  const supplierId = field(formData, "supplierId");
  const action = field(formData, "action");
  const notes = field(formData, "notes").trim().slice(0, 2000);
  if (!["approve", "reject", "suspend", "reinstate"].includes(action)) return { error: "Choose a decision." };
  if ((action === "reject" || action === "suspend") && notes.length < 5) return { error: "Add a short note explaining the decision." };
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId) as { user_id: string; verification_status: string } | undefined;
  if (!supplier) return { error: "Supplier not found." };
  const next = action === "approve" || action === "reinstate" ? "verified" : action === "reject" ? "rejected" : "suspended";
  const timestamp = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE suppliers SET verification_status = ?, verified_at = ?, updated_at = ? WHERE id = ?").run(next, next === "verified" ? timestamp : null, timestamp, supplierId);
    db.prepare("INSERT INTO supplier_verification_events (id, supplier_id, actor_user_id, action, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(newId(), supplierId, admin.id, action, notes || null, timestamp);
    db.prepare("INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, 'verification', ?, ?, '/supplier/profile', ?)").run(
      newId(),
      supplier.user_id,
      next === "verified" ? "Your company is verified" : `Verification status: ${next}`,
      notes || (next === "verified" ? "Approved products now appear in the catalogue." : "Open your profile for next steps."),
      timestamp,
    );
  })();
  logAudit({ actorUserId: admin.id, actorRole: admin.role, action: `supplier.${action}`, entityType: "supplier", entityId: supplierId, metadata: { from: supplier.verification_status, to: next } });
  redirect(`/admin/suppliers?done=${action}`);
}

export async function decideProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await actionUser(["admin"]);
  if (!admin) return { error: "Admin access required." };
  const productId = field(formData, "productId");
  const action = field(formData, "action");
  const notes = field(formData, "notes").trim().slice(0, 2000);
  if (action !== "approve" && action !== "reject") return { error: "Choose approve or reject." };
  if (action === "reject" && notes.length < 5) return { error: "Tell the supplier what to fix." };
  const product = db
    .prepare("SELECT p.id, p.brand, p.model, s.user_id FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?")
    .get(productId) as { id: string; brand: string; model: string; user_id: string } | undefined;
  if (!product) return { error: "Product not found." };
  const timestamp = nowIso();
  const status = action === "approve" ? "approved" : "rejected";
  db.prepare("UPDATE products SET status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?").run(status, notes || null, admin.id, timestamp, timestamp, productId);
  db.prepare("INSERT INTO notifications (id, user_id, kind, title, body, href, created_at) VALUES (?, ?, 'verification', ?, ?, '/supplier/products', ?)").run(
    newId(),
    product.user_id,
    status === "approved" ? `${product.brand} ${product.model} is live` : `${product.brand} ${product.model} needs changes`,
    notes || (status === "approved" ? "It now appears in the equipment catalogue." : "Open the product to see what to change."),
    timestamp,
  );
  logAudit({ actorUserId: admin.id, actorRole: admin.role, action: `product.${action}`, entityType: "product", entityId: productId });
  redirect(`/admin/products?done=${action}`);
}
