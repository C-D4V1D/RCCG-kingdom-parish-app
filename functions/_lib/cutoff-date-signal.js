// Date-driven month-end start. David's rule: the month-end filing starts ON the set cut-off date, whatever
// weekday it is, not on the last Sunday before it. The Sunday-collection save already fires the signal when the
// cut-off date is a Sunday; this covers every other weekday. The hourly rccgkp-admin-cron Worker calls
// POST /api/internal/run-cutoff-date-signal (other weekdays only; a Sunday cut-off is triggered by the Sunday save); this file holds the decision so it can be tested without a database.

/** Today's date (YYYY-MM-DD) in Dublin, where the church's dates are kept. */
export function dublinToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Settings key that records "the signal for this period has been sent". */
export function cutoffSignalMarkerKey(periodEnd) {
  return `remit_cutoff_signal_${periodEnd}`;
}

/**
 * Decide what the hourly job does.
 *   today        YYYY-MM-DD (Dublin)
 *   period       { periodStart, periodEnd } when today is a configured cut-off date, else null
 *   sundays      every Sunday of the period from the gate start, INCLUDING a Sunday on the cut-off date
 *   haveSundays  Set of Sundays that already have a saved collection
 *   marked       true when the signal for this period already went out (from a Sunday save or an earlier run)
 * Returns { action: 'skip' | 'wait' | 'send', reason, missing }.
 */
export function decideCutoffSignal({ today, period, sundays, haveSundays, marked }) {
  if (!period || period.periodEnd !== today) return { action: 'skip', reason: 'not a cut-off date', missing: [] };
  // A Sunday cut-off date already fires the signal from the Sunday collection save. A second (synthetic) one for the same
  // period could be taken by the box as an interrupted run and stop a good filing, so this job only covers other weekdays.
  if (new Date(`${period.periodEnd}T00:00:00Z`).getUTCDay() === 0) return { action: 'skip', reason: 'cut-off Sunday: the Sunday collection save is the trigger', missing: [] };
  if (marked) return { action: 'skip', reason: 'signal already sent for this period', missing: [] };
  const missing = (sundays || []).filter(d => d <= period.periodEnd && !haveSundays.has(d));
  if (missing.length) return { action: 'wait', reason: 'weekly collections missing', missing };
  return { action: 'send', reason: 'cut-off date and every Sunday has a collection', missing: [] };
}
