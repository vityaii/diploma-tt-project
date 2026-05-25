async function resolveActorUsername(User, userId, fallbackUsername, transaction) {
  if (fallbackUsername && String(fallbackUsername).trim()) {
    return String(fallbackUsername).trim();
  }
  if (!Number.isInteger(Number(userId)) || Number(userId) < 1) return null;

  const user = await User.findByPk(userId, {
    transaction,
    attributes: ['username'],
  });
  return user?.username ?? null;
}

async function createActivityLog(ActivityLog, payload, transaction) {
  const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  return ActivityLog.create({
    event_type: payload.eventType,
    actor_user_id: payload.actorUserId ?? null,
    metadata,
  }, { transaction });
}

function buildTaskActivityMetadata(task, context) {
  return {
    actorUsername: context.actorUsername ?? null,
    projectId: context.projectId,
    projectName: context.projectName,
    taskId: task.id,
    taskTitle: task.title,
    taskNumber: Number.isFinite(Number(task.task_number)) ? Number(task.task_number) : null,
  };
}

module.exports = {
  resolveActorUsername,
  createActivityLog,
  buildTaskActivityMetadata,
};
