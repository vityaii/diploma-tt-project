type TaskPlanningLike = {
  plannedDate?: string;
  durationWeeks?: number;
  durationDays?: number;
};

function coerceNonNegativeInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export function normalizeWeekDayDuration(durationWeeks: unknown, durationDays: unknown) {
  const totalDays = coerceNonNegativeInteger(durationWeeks) * 7 + coerceNonNegativeInteger(durationDays);
  return {
    durationWeeks: Math.floor(totalDays / 7),
    durationDays: totalDays % 7,
  };
}

export function getTaskDurationInDays(task: TaskPlanningLike) {
  const normalized = normalizeWeekDayDuration(task.durationWeeks, task.durationDays);
  return normalized.durationWeeks * 7 + normalized.durationDays;
}

export function formatTaskDuration(task: TaskPlanningLike) {
  const normalized = normalizeWeekDayDuration(task.durationWeeks, task.durationDays);
  const parts = [];

  if (normalized.durationWeeks > 0) parts.push(`${normalized.durationWeeks}w`);
  if (normalized.durationDays > 0) parts.push(`${normalized.durationDays}d`);

  return parts.join(" ");
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function formatPlannedDate(dateOnly?: string) {
  if (!dateOnly) return "";
  const date = parseDateOnly(dateOnly);
  if (Number.isNaN(date.getTime())) return dateOnly;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function dateOnlyToUtc(dateOnly: string) {
  return parseDateOnly(dateOnly);
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function diffUtcDays(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}
