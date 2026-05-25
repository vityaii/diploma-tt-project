async function ensureProjectExists(Project, projectId, transaction) {
  const project = await Project.findByPk(projectId, { transaction });
  if (!project) {
    const err = new Error('Проект не найден');
    err.status = 404;
    throw err;
  }
  return project;
}

module.exports = { ensureProjectExists };
