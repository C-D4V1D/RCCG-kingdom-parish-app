// rccgkp-admin-cron: the app's scheduler. Every hour it calls each of the app's scheduled jobs
// (/api/internal/run-*), one request per job so a slow job can't use up another's time. Each job decides
// for itself whether it is due (payment reminders, Happy New Month SMS, follow-ups, ...) and never sends
// twice for the same period, so calling them every hour is safe and cheap.
//
// This replaces GitHub's scheduled workflow, which GitHub runs only a few times a day at random and which
// had stopped working altogether (its CRON_SECRET was missing). Deployed by .github/workflows/deploy-admin-cron.yml.
// Secret (Cloudflare dashboard, kept across deploys): CRON_SECRET — the same value as the Pages app's CRON_SECRET.

// Must list every job in cronJobRunners() in functions/api/[[route]].js (tests/admin-cron-worker.test.js checks).
export const JOBS = [
  "run-monthly-sms",
  "run-reminder-sms",
  "run-anniversary-sms",
  "run-premeeting-sms",
  "run-actionitem-sms",
  "run-scheduled-sms",
  "run-newmonth-draft-fallback",
  "run-followups",
  "run-prebriefs",
  "run-bank-recon",
];

const JOB_TIMEOUT_MS = 100_000;

export async function runJobs(env, fetchImpl = fetch) {
  const base = String(env.PAGES_BASE_URL || "").replace(/\/+$/, "");
  if (!base || !env.CRON_SECRET) {
    console.error("admin-cron: PAGES_BASE_URL or CRON_SECRET is not set; nothing was run");
    return { ok: false, results: {} };
  }
  const results = {};
  for (const job of JOBS) {
    try {
      const res = await fetchImpl(`${base}/api/internal/${job}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
      });
      results[job] = res.status;
    } catch (e) {
      results[job] = `error: ${e?.message || e}`;
    }
  }
  const failed = Object.entries(results).filter(([, s]) => s !== 200);
  if (failed.length) console.error("admin-cron: jobs failed", JSON.stringify(Object.fromEntries(failed)));
  else console.log("admin-cron: all jobs ok");
  return { ok: failed.length === 0, results };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runJobs(env));
  },
};
