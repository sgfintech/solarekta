# Ocular / site surveys

Verified installer companies use this module to record residential and commercial rooftop surveys on a phone. They attach photo, video and document evidence, record the visit, and submit the survey for SOLARekta's technical review. Reviewers are admins. Customers see a survey only after the installer shares it.

## Where things are
| Who | Page |
|---|---|
| Installer (surveyor) | `/installer/surveys` (list, filters, new survey), `/installer/surveys/[id]` (mobile editor), `/installer/surveys/[id]/review` (summary, reopen, share, AI, comments). A lead page has "Start survey", which prefills the address, utility and any contact the customer shared. |
| Reviewer (admin) | `/admin/surveys` (filters: client/site, type, surveyor, visit dates, status, missing evidence, flagged), `/admin/surveys/[id]` (start review, approve / request changes, accept or reject each evidence file, accept a visit exception, comment). |
| Customer | `/app/surveys` and `/app/surveys/[id]`, shared surveys only. Device locations, phone numbers, hashes, comments, history and signature images are never shown to customers. |
| Report | `/surveys/[id]/report`: branded multi-page A4 report. Print, or "Save as PDF" from the browser. It uses the viewer's access. |

## Workflow
Draft → In progress → Submitted → Under review → Approved or Changes requested.

- **Approved** only means the record passed SOLARekta's internal review. It is not structural approval, utility approval or permission to install, and every screen says so.
- **Snapshots:** each submission and each review decision stores an unchangeable snapshot in `survey_revisions`, with the evidence list and the fields changed since the previous snapshot.
- **Reopening:** reopening a submitted, under-review or approved survey needs a reason. It starts the next revision, which must be resubmitted. Reviewed findings are never overwritten in place.
- **Removing evidence:** evidence that belongs to a submitted snapshot is only hidden from the current revision, never deleted. Evidence uploaded since the last submission can be deleted.

## Checklist
- **Templates:** they live in `lib/survey/templates.ts` and are versioned (`res-2026.11.1`, `com-2026.11.1`). Each survey stores its template version. To change a checklist, add a new version; don't edit a published one.
- **Statuses:** every item is Not assessed, Completed, Issue found or Not applicable. "Issue found" always needs an explanation. "Not applicable" needs one unless the item says otherwise.
- **Values:** measured values (breaker rating, area, pitch and so on) are stored separately from the status.
- **Progress:** counted from the survey's own template version.
- **Submission checks:** these list what's missing, with a "Fix" link to the item. Warnings, such as a completed item with an empty value or a location flag, don't block submission; reviewers see them.
- **Regulatory labels:** connection arrangements are configured in `lib/survey/config.ts`. No eligibility thresholds are hard-coded.
- **Structural observations:** the commercial "Structural observations" section is labelled for engineer review. Nothing recorded there counts as structural verification.

## Evidence and the visit record
- **Capture:** "Take photo" and "Record video" open the device camera, using `capture` on mobile browsers. Where recording isn't supported (most desktops), they fall back to the file picker. "Upload files" allows several photos, videos and PDFs at once.
- **Uploads:**
  - Each file streams to disk while it's hashed (SHA-256), so large videos never sit in memory.
  - The type is decided from file content, not the name. JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM and PDF are accepted; anything else is refused.
  - Each upload carries a client key, so a retry returns the existing record instead of a duplicate.
  - An upload shows as complete only after both storage and registration succeed.
  - Uploads have progress, cancel, retry and plain error messages.
- **Thumbnails and duration:**
  - Photo thumbnails are made by the server with `sharp` and labelled as compressed copies; originals are kept unchanged.
  - Video previews are frames the uploading device generated, and are labelled that way.
  - MP4/MOV duration is read from the file by the server. WEBM duration is device-reported.
- **Metadata:**
  - Server upload time and device-reported capture time, labelled with their source (EXIF camera time or the file's timestamp).
  - Capture source, and an optional device GPS position with accuracy.
  - Caption, category, and links to a checklist item or roof plane.
  - Labels state that metadata supports the visit record but can't prove attendance. Nothing is ever marked "verified" because of GPS or EXIF data.
- **Start / Finish site visit:**
  - Records server timestamps. Location is optional and asked for with an explanation.
  - The device location is compared with the site pin (geofence and maximum accuracy are configurable).
  - A declined, imprecise or distant location becomes a review flag, never lost work. Reviewers can accept an exception, with a required reason.
  - Four states are kept separate: evidence submitted, location consistent with the site, client acknowledged, reviewer accepted.
- **Client acknowledgment:** the client's name, the consent text (versioned) and a signature drawn by touch or mouse, saved with the server time. It's described as a drawn acknowledgment, never as a digital signature.

## Privacy and storage
- **Storage:** files live under `UPLOAD_DIR/surveys/<survey-id>/`. They're served only by `/api/surveys/evidence/[id]` after an access check:
  - the owning installer company;
  - admins;
  - the customer, for shared surveys, excluding signatures and rejected files.
- **Delivery:** inline with `nosniff` and a sandboxing CSP, private cache headers and Range support for video seeking.
- **No expiring links:** local disk storage has no expiring signed URLs. Access is checked on every request instead, and the report never prints media URLs.
- **Logs:** audit logs record metadata only: ids, kinds, byte sizes. Notes, photos and documents aren't written to logs.
- **Browser settings:** camera, microphone and geolocation are allowed for the site itself only (`Permissions-Policy`), and `media-src` allows local previews.
- **Logout** clears drafts cached on the device.

## Autosave and connectivity
- **Status:** changes save automatically about a second after typing stops. The status shows Saving, Saved, Sync pending, Offline (saved on this device) or Save failed (retrying).
- **Local recovery:** every change is also kept in the browser's local storage. If a session is interrupted, the editor offers to restore the unsaved changes.
- **Conflicts:** saves carry a version number. If another device saved first, the editor shows a conflict and lets the user keep their version or use the saved one. Nothing is overwritten silently.
- **Offline uploads:** files wait on the page while offline and upload when the connection returns. They're not stored durably. If the page is closed, queued files are lost, and the page says so. A durable offline media queue (IndexedDB plus a service worker) is not implemented.

## AI assistance (optional)
- **What it does:** on request, it drafts a findings summary, a client-friendly summary, follow-up questions and possible gaps from the recorded answers.
- **What's sent:** names, phone numbers, addresses, coordinates, photos and documents are never sent. Photo-based observations are not implemented.
- **Validation:** drafts that use numbers not in the answers, or claim anything is verified, certified, compliant, approved or structurally sound, are discarded.
- **Acceptance:** a person must accept a summary before it's copied into the notes, and the acceptance is recorded in the timeline.
- **Without AI:** the deterministic missing-data and contradiction checks always run, and the survey works fully without AI.

## Configuration
See the "Site surveys" block in `.env.example`. AI uses the existing `AI_PROVIDER` / `OPENAI_API_KEY` settings, plus the per-feature limit `AI_DAILY_LIMIT_SURVEY_ASSIST`. No other external credentials are needed.

## Maintenance
`cleanupAbandonedUploads()` in `lib/survey/storage.ts` deletes partial uploads older than 24 hours from `UPLOAD_DIR/tmp`. It never touches media that a survey references. Failed uploads already delete their own temp files, so this only catches crashes. Run it from a scheduled job if needed; no scheduler is wired up.
