/**
 * Date Helper for Deterministic Relative QA Seed Data
 * Uses Asia/Kolkata (Indian Standard Time - IST) as authoritative timezone.
 * Never hardcodes static calendar dates so seed data remains perpetually valid.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns today's authoritative calendar date in IST as 'YYYY-MM-DD'.
 */
export function getTodayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Adds (or subtracts) an integer number of days to an ISO 'YYYY-MM-DD' date string in IST.
 */
export function addDaysIst(baseDateStr: string, offsetDays: number): string {
  const [year, month, day] = baseDateStr.split('-').map((v) => parseInt(v, 10));
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + offsetDays);

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(utcDate);
}

/**
 * Computes an IST date string offset by N days relative to today.
 * e.g., offsetDays = -5 returns 5 days before today.
 */
export function getRelativeDateIst(offsetDays: number): string {
  return addDaysIst(getTodayIst(), offsetDays);
}

/**
 * Returns a JavaScript Date object corresponding to todayIst + offsetDays
 * with the specified hour/minute/second in IST.
 */
export function getRelativeTimestampIst(
  offsetDays: number,
  hour = 12,
  minute = 0,
  second = 0,
): Date {
  const dateStr = getRelativeDateIst(offsetDays);
  // IST is UTC+05:30. Form ISO string with +05:30 timezone offset.
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoWithTz = `${dateStr}T${pad(hour)}:${pad(minute)}:${pad(second)}+05:30`;
  return new Date(isoWithTz);
}
