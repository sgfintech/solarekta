"use client";

import { resolveDataRequestAction } from "@/app/actions/admin";

export function ResolveDataRequestForm({
  requestId,
  kind,
  label,
}: {
  requestId: string;
  kind: "export" | "deletion";
  label: string;
}) {
  return (
    <form
      action={resolveDataRequestAction}
      onSubmit={(event) => {
        if (
          kind === "deletion" &&
          !window.confirm(
            "Delete this account's personal data? Bills, sites, assessments and installer records are removed and cannot be recovered. This is recorded in the audit log.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" className={`btn btn-sm ${kind === "deletion" ? "btn-secondary" : "btn-primary"}`}>
        {label}
      </button>
    </form>
  );
}
