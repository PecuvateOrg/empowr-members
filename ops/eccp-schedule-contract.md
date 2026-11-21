# ECCP schedule integration — draft v1

GET /api/integrations/eccp/schedule requires a dedicated server-side Bearer credential (MEMBERS_ECCP_SCHEDULE_SECRET, minimum 32 characters). Never expose it to browsers or logs. Responses are no-store and contain no member records.

Start at offset 0. Collect pages using next_offset and the original snapshot_version. Validate schema_version, total, offsets, unique source keys and identical snapshot_version on every page. A complete response means the final page, not that previous pages were collected or that the database was read transactionally. Reject all pages on any error, inconsistent metadata, duplicate key, 409 or 503; retain last known good state. Do not apply partial pages.

Occurrence keys are occurrence:<id>; course keys are course-run:<id>:<YYYY-MM-DD>. Course dates use the existing weekly attendance expansion and Europe/London conversion. A changed occurrence time retains its key. A changed course date may have a new key. Active offerings only; ended sessions are omitted.

ECCP must upsert only source-owned sessions, retain assignments and audit history, mark explicit cancellations without deleting records, and flag changed times/venues for management review and coach notification. Missing keys are not proof of cancellation: they may be elapsed, deleted, deactivated or affected by concurrent database changes. Flag future missing sessions for management review only after repeated complete successful snapshots; never automatically delete assignments or historical records. Never infer a replacement course date or transfer assignments without approval.

The current feed uses separate paginated reads, not transactionally isolated snapshots. Cross-page content hashing detects changed payloads but cannot prove database-wide atomicity. Automated destructive reconciliation is prohibited. Future horizon, exclusion handling, deployment credentials, downstream verification and end-to-end testing remain release gates. Keep both integrations disabled in production until approved.
