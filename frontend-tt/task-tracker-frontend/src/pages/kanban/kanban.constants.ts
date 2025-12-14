export const TASK_NAMESPACE = "TASK";

export function formatTaskKey(taskNumber: number) {
  return `${TASK_NAMESPACE}-${taskNumber}`;
}

