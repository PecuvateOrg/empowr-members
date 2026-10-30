// AWS Lambda entry point for the nightly jobs, invoked by EventBridge Scheduler
// with `{ "job": "<name>" }`. It runs the SAME handlers Netlify schedules today
// (netlify/functions/), so the job logic has one copy while both hosts exist.
//
// Bundled by ../ops/scripts/build-jobs.mjs with esbuild, like Netlify's bundle,
// so the `server-only` trap in verify-scheduled-function.ts applies here too:
// nothing reachable from these handlers may import a `server-only` module.
//
// A non-2xx Response is thrown, so Lambda records the run as failed and the
// scheduler's retry and the error alarm see it. Netlify only logged it.
import materializeMemberBookings from "../netlify/functions/materialize-member-bookings";
import accountDeletions from "../netlify/functions/account-deletions";

const JOBS: Record<string, () => Promise<Response>> = {
  "materialize-member-bookings": materializeMemberBookings,
  "account-deletions": accountDeletions,
};

export async function handler(event: { job?: string }): Promise<{ job: string; status: number }> {
  const job = event?.job ?? "";
  const run = JOBS[job];
  if (!run) throw new Error(`unknown job: ${JSON.stringify(job)}`);
  const res = await run();
  if (!res.ok) throw new Error(`${job} failed with status ${res.status}`);
  return { job, status: res.status };
}
