const DEFAULT_BOARD_COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'inprogress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
];

function isPositiveIntLike(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function normalizePriorityForStorage(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'low') return 'low';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium' || normalized === 'normal') return 'medium';
  return 'medium';
}

function normalizePriorityForBoard(value) {
  const normalized = normalizePriorityForStorage(value);
  if (normalized === 'low') return 'Low';
  if (normalized === 'high') return 'High';
  return 'Medium';
}

function normalizeNullableText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag ?? '').trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeDateOnly(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function coerceNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function normalizePlanningValues(input) {
  const plannedDate = normalizeDateOnly(input?.plannedDate ?? input?.planned_date);
  const totalDays =
    coerceNonNegativeInteger(input?.durationWeeks ?? input?.duration_weeks) * 7 +
    coerceNonNegativeInteger(input?.durationDays ?? input?.duration_days);

  return {
    plannedDate,
    durationWeeks: Math.floor(totalDays / 7),
    durationDays: totalDays % 7,
  };
}

function parsePlanningPayload(body, base = {}) {
  const provided =
    body?.plannedDate !== undefined ||
    body?.planned_date !== undefined ||
    body?.durationWeeks !== undefined ||
    body?.duration_weeks !== undefined ||
    body?.durationDays !== undefined ||
    body?.duration_days !== undefined;

  if (!provided) return { provided: false };

  const rawPlannedDate = body?.plannedDate ?? body?.planned_date;
  if (
    rawPlannedDate !== undefined &&
    rawPlannedDate !== null &&
    String(rawPlannedDate).trim() !== '' &&
    !normalizeDateOnly(rawPlannedDate)
  ) {
    return { error: 'Некорректный plannedDate. Используйте YYYY-MM-DD' };
  }

  for (const [key, value] of [
    ['durationWeeks', body?.durationWeeks ?? body?.duration_weeks],
    ['durationDays', body?.durationDays ?? body?.duration_days],
  ]) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: `Некорректный ${key}` };
    }
  }

  const merged = {
    plannedDate:
      rawPlannedDate !== undefined
        ? rawPlannedDate
        : (base.plannedDate ?? base.planned_date),
    durationWeeks:
      body?.durationWeeks ?? body?.duration_weeks ?? base.durationWeeks ?? base.duration_weeks,
    durationDays:
      body?.durationDays ?? body?.duration_days ?? base.durationDays ?? base.duration_days,
  };

  return {
    provided: true,
    ...normalizePlanningValues(merged),
  };
}

function getTaskComparableState(taskLike) {
  return {
    title: String(taskLike?.title ?? '').trim(),
    text: String(taskLike?.text ?? ''),
    stat: String(taskLike?.stat ?? ''),
    priority: normalizePriorityForStorage(taskLike?.priority),
    column_id: Number.isFinite(Number(taskLike?.column_id)) ? Number(taskLike.column_id) : null,
    project_id: Number.isFinite(Number(taskLike?.project_id)) ? Number(taskLike.project_id) : null,
    position: Number.isFinite(Number(taskLike?.position)) ? Number(taskLike.position) : 0,
    task_number: Number.isFinite(Number(taskLike?.task_number)) ? Number(taskLike.task_number) : null,
    customer_name: normalizeNullableText(taskLike?.customer_name),
    assignee_name: normalizeNullableText(taskLike?.assignee_name),
    assignee_initials: normalizeNullableText(taskLike?.assignee_initials),
    planned_date: normalizeDateOnly(taskLike?.planned_date),
    duration_weeks: coerceNonNegativeInteger(taskLike?.duration_weeks),
    duration_days: coerceNonNegativeInteger(taskLike?.duration_days),
    tags: normalizeTags(taskLike?.tags),
  };
}

function taskStatesEqual(left, right) {
  if (!left || !right) return false;

  for (const key of [
    'title',
    'text',
    'stat',
    'priority',
    'column_id',
    'project_id',
    'position',
    'task_number',
    'customer_name',
    'assignee_name',
    'assignee_initials',
    'planned_date',
    'duration_weeks',
    'duration_days',
  ]) {
    if (left[key] !== right[key]) return false;
  }

  if (left.tags.length !== right.tags.length) return false;
  return left.tags.every((tag, index) => tag === right.tags[index]);
}

function parseEntityId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
}

function parseProjectIdInput(value) {
  return parseEntityId(value);
}

function parseProjectIdFromRequest(req) {
  return parseProjectIdInput(req.query.projectId ?? req.query.project_id);
}

function readProjectIdFromBody(body) {
  return parseEntityId(body?.projectId ?? body?.project_id);
}

function readColumnIdFromBody(body) {
  return parseEntityId(body?.columnId ?? body?.column_id);
}

function readColumnClientIdFromBody(body) {
  const raw = body?.columnClientId ?? body?.column_client_id;
  const normalized = normalizeNullableText(raw);
  return normalized ? String(normalized) : null;
}

module.exports = {
  DEFAULT_BOARD_COLUMNS,
  isPositiveIntLike,
  normalizePriorityForStorage,
  normalizePriorityForBoard,
  normalizeNullableText,
  normalizeTags,
  normalizeDateOnly,
  coerceNonNegativeInteger,
  normalizePlanningValues,
  parsePlanningPayload,
  getTaskComparableState,
  taskStatesEqual,
  parseEntityId,
  parseProjectIdInput,
  parseProjectIdFromRequest,
  readProjectIdFromBody,
  readColumnIdFromBody,
  readColumnClientIdFromBody,
};
