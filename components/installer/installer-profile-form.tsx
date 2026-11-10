"use client";

import { PreservingForm } from "@/components/preserving-form";
import { useActionState, useState } from "react";
import { saveInstallerProfileAction, uploadInstallerDocumentAction } from "@/app/actions/installer";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/icons";
import { parseServiceAreas } from "@/lib/service-areas";
import type { ActionState } from "@/lib/action-state";
import type { InstallerRow } from "@/lib/types";

export function InstallerProfileForm({ installer }: { installer?: InstallerRow }) {
  const [state, action] = useActionState<ActionState, FormData>(saveInstallerProfileAction, null);
  const areas = installer ? parseServiceAreas(installer.service_areas_json) : [];

  return (
    <PreservingForm action={action} className="space-y-5" noValidate>
      {state?.error ? (
        <div role="alert" className="alert-error flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="businessName" className="label">Registered business name</label>
          <input
            id="businessName"
            name="businessName"
            className="input"
            defaultValue={installer?.business_name}
            placeholder="Bayanihan Solar Works Inc."
            required
          />
          <p className="help">Use the name that appears on your registration documents.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="about" className="label">About your business</label>
          <textarea
            id="about"
            name="about"
            className="textarea"
            defaultValue={installer?.about ?? ""}
            placeholder="What you install, typical project sizes, certifications and how you handle after-sales support."
            minLength={20}
            maxLength={2000}
            required
          />
          <p className="help">At least 20 characters. Avoid unverifiable claims or savings promises.</p>
        </div>

        <div>
          <label htmlFor="phone" className="label">Business phone</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="input"
            defaultValue={installer?.phone ?? ""}
            placeholder="+63 917 000 0000"
            required
          />
          <p className="help">Shared with customers only through requests they opt into.</p>
        </div>

        <div>
          <label htmlFor="yearsExperience" className="label">Years in operation</label>
          <input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min={0}
            max={80}
            className="input"
            defaultValue={installer?.years_experience ?? ""}
            required
          />
        </div>

        <div>
          <label htmlFor="licenseNo" className="label">Licence / registration no. <span className="normal-case tracking-normal text-muted">(optional)</span></label>
          <input
            id="licenseNo"
            name="licenseNo"
            className="input"
            defaultValue={installer?.license_no ?? ""}
            placeholder="SEC / DTI / contractor licence"
          />
        </div>

        <div>
          <label htmlFor="website" className="label">Website <span className="normal-case tracking-normal text-muted">(optional)</span></label>
          <input
            id="website"
            name="website"
            type="url"
            className="input"
            defaultValue={installer?.website ?? ""}
            placeholder="https://example.ph"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="serviceAreas" className="label">Service areas</label>
          <textarea
            id="serviceAreas"
            name="serviceAreas"
            className="textarea"
            style={{ minHeight: "5.5rem" }}
            defaultValue={areas.join("\n")}
            placeholder={"Quezon City\nMetro Manila\nRizal"}
            required
          />
          <p className="help">One city or province per line (or comma-separated). Up to 12 areas.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-primary" pendingText="Saving…">
          {installer ? "Save profile" : "Submit profile for review"}
        </SubmitButton>
        <p className="text-xs text-muted">
          {installer
            ? "Updating a rejected or draft profile resubmits it for manual review."
            : "Saving sends your application to an admin for manual review."}
        </p>
      </div>
    </PreservingForm>
  );
}

export function DocumentUploadForm() {
  const [state, action] = useActionState<ActionState, FormData>(uploadInstallerDocumentAction, null);

  return (
    <PreservingForm action={action} className="rounded-xl border border-line bg-paper-deep/40 p-4">
      {state?.error ? (
        <div role="alert" className="alert-error mb-3 flex gap-2">
          <Alert className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor="kind" className="label">Document type</label>
          <select id="kind" name="kind" className="select">
            <option value="sec_registration">SEC / DTI registration</option>
            <option value="mayors_permit">Mayor&apos;s permit</option>
            <option value="license">Contractor licence</option>
            <option value="insurance">Insurance</option>
            <option value="other">Other supporting document</option>
          </select>
        </div>
        <div>
          <label htmlFor="file" className="label">File</label>
          <input
            id="file"
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="input !py-2"
            required
          />
        </div>
        <SubmitButton className="btn btn-secondary btn-sm" pendingText="Uploading…">Upload</SubmitButton>
      </div>
    </PreservingForm>
  );
}
