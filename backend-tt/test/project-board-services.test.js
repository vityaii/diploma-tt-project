const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { ensureProjectExists } = require('../services/project-service');
const {
  ensureDefaultColumnsForProject,
  getNextTaskNumber,
  getNextTaskPosition,
  buildBoardFromTables,
  getBoardPayload,
  syncBoardToTables,
} = require('../services/board-service');

function createRecord(fields) {
  return {
    ...fields,
    async update(patch) {
      Object.assign(this, patch);
      return this;
    },
    async save() {
      return this;
    },
  };
}

test('ensureProjectExists returns project or throws 404', async () => {
  const project = { id: 1, name: 'Project A' };
  const Project = {
    async findByPk(id, options) {
      assert.equal(id, 1);
      assert.deepEqual(options, { transaction: 'tx' });
      return project;
    },
  };

  assert.equal(await ensureProjectExists(Project, 1, 'tx'), project);

  await assert.rejects(
    () => ensureProjectExists({ async findByPk() { return null; } }, 999),
    (err) => {
      assert.equal(err.message, 'Проект не найден');
      assert.equal(err.status, 404);
      return true;
    },
  );
});

test('ensureDefaultColumnsForProject creates default board columns only for empty project', async () => {
  const created = [];
  const Column = {
    countCalls: 0,
    async count({ where, transaction }) {
      assert.deepEqual(where, { project_id: 3 });
      assert.equal(transaction, 'tx');
      this.countCalls += 1;
      return this.countCalls === 1 ? 0 : 4;
    },
    async create(payload, options) {
      assert.equal(options.transaction, 'tx');
      created.push(payload);
      return payload;
    },
  };

  await ensureDefaultColumnsForProject(Column, 3, 'tx');
  await ensureDefaultColumnsForProject(Column, 3, 'tx');

  assert.deepEqual(created.map((column) => column.client_id), ['todo', 'inprogress', 'review', 'done']);
  assert.deepEqual(created.map((column) => column.position), [0, 1, 2, 3]);
});

test('task numbering helpers use max task number and position', async () => {
  const Task = {
    async max(field, { where, transaction }) {
      assert.deepEqual(where.project_id, 5);
      assert.equal(transaction, 'tx');
      if (field === 'task_number') return 8;
      if (field === 'id') return 12;
      if (field === 'position') {
        assert.equal(where.column_id, 4);
        return 3;
      }
      throw new Error(`Unexpected max field: ${field}`);
    },
  };

  assert.equal(await getNextTaskNumber(Task, 5, 'tx'), 13);
  assert.equal(await getNextTaskPosition(Task, 5, 4, 'tx'), 4);
});

test('buildBoardFromTables maps columns, cards and unassigned tasks to board payload', async () => {
  const columns = [
    createRecord({ id: 1, client_id: 'todo', name: 'To Do' }),
    createRecord({ id: 2, client_id: 'done', name: 'Done' }),
  ];
  const tasks = [
    createRecord({
      id: 10,
      client_id: 'card-10',
      column_id: 1,
      task_number: 3,
      title: 'Implement tests',
      text: 'Unit tests',
      priority: 'high',
      tags: ['qa'],
      assignee_name: 'Ivan',
      assignee_initials: null,
      duration_weeks: 1,
      duration_days: 2,
    }),
    createRecord({
      id: 11,
      client_id: null,
      column_id: 99,
      task_number: null,
      title: 'Unassigned task',
      text: '',
      priority: 'low',
      tags: [],
    }),
  ];
  const Task = {
    async findAll({ where, order }) {
      assert.deepEqual(where, { project_id: 6 });
      assert.deepEqual(order, [['position', 'ASC'], ['id', 'ASC']]);
      return tasks;
    },
    async max(field) {
      if (field === 'task_number') return 3;
      if (field === 'id') return 11;
      return null;
    },
  };
  const Column = {
    async findAll({ where, order }) {
      assert.deepEqual(where, { project_id: 6 });
      assert.deepEqual(order, [['position', 'ASC'], ['id', 'ASC']]);
      return columns;
    },
  };

  const payload = await buildBoardFromTables({ models: { Column, Task } }, 6);

  assert.equal(payload.nextTaskNumber, 12);
  assert.deepEqual(payload.board.columns, [
    { id: 'todo', title: 'To Do', cardIds: ['card-10'] },
    { id: 'done', title: 'Done', cardIds: [] },
    { id: 'unassigned', title: 'Unassigned', cardIds: ['11'] },
  ]);
  assert.equal(payload.board.cards['card-10'].priority, 'High');
  assert.deepEqual(payload.board.cards['card-10'].assignee, { name: 'Ivan', initials: 'IV' });
  assert.equal(payload.board.cards['11'].priority, 'Low');
});

test('getBoardPayload validates project, creates defaults and returns board', async () => {
  const createdColumns = [];
  const Project = {
    async findByPk(projectId) {
      assert.equal(projectId, 4);
      return { id: 4, name: 'Project B' };
    },
  };
  const Column = {
    async count() {
      return 0;
    },
    async create(payload) {
      createdColumns.push(createRecord({ id: createdColumns.length + 1, ...payload }));
      return createdColumns.at(-1);
    },
    async findAll() {
      return createdColumns;
    },
  };
  const Task = {
    async findAll() {
      return [];
    },
    async max() {
      return null;
    },
  };

  const payload = await getBoardPayload({ models: { Project, Column, Task } }, 4);

  assert.equal(createdColumns.length, 4);
  assert.deepEqual(payload.board.columns.map((column) => column.id), ['todo', 'inprogress', 'review', 'done']);
  assert.equal(payload.nextTaskNumber, 1);
});

test('syncBoardToTables creates columns, tasks and activity logs from board payload', async () => {
  const createdColumns = [];
  const createdTasks = [];
  const activityLogs = [];

  const Column = {
    async findAll() {
      return [];
    },
    async create(payload) {
      const record = createRecord({ id: createdColumns.length + 1, ...payload });
      createdColumns.push(record);
      return record;
    },
    async destroy() {
      throw new Error('No columns should be deleted in this scenario');
    },
  };
  const Task = {
    async findAll() {
      return [];
    },
    async max() {
      return null;
    },
    async create(payload) {
      const record = createRecord({ id: createdTasks.length + 10, ...payload });
      createdTasks.push(record);
      return record;
    },
    async destroy() {
      throw new Error('No tasks should be deleted in this scenario');
    },
  };
  const User = {
    async findByPk() {
      throw new Error('Fallback username should not be queried');
    },
  };
  const ActivityLog = {
    async create(payload) {
      activityLogs.push(payload);
      return payload;
    },
  };
  const sequelize = {
    models: { Column, Task, User, ActivityLog },
    async transaction(callback) {
      return callback('tx');
    },
  };

  await syncBoardToTables(sequelize, {
    columns: [
      { id: 'todo', title: 'To Do', cardIds: ['card-1'] },
      { id: 'done', title: 'Done', cardIds: [] },
    ],
    cards: {
      'card-1': {
        title: 'New card',
        description: 'Created from board',
        priority: 'High',
        tags: ['backend'],
        taskNumber: 5,
        customer: { name: 'MISIS' },
        assignee: { name: 'Tester', initials: 'TT' },
        plannedDate: '2026-05-25',
        durationWeeks: 1,
        durationDays: 8,
      },
    },
  }, 9, { userId: 2, username: 'admin', projectName: 'Board project' });

  assert.deepEqual(createdColumns.map((column) => column.client_id), ['todo', 'done']);
  assert.equal(createdTasks.length, 1);
  assert.equal(createdTasks[0].client_id, 'card-1');
  assert.equal(createdTasks[0].project_id, 9);
  assert.equal(createdTasks[0].column_id, 1);
  assert.equal(createdTasks[0].priority, 'high');
  assert.equal(createdTasks[0].duration_weeks, 2);
  assert.equal(createdTasks[0].duration_days, 1);
  assert.deepEqual(activityLogs, [{
    event_type: 'task_created',
    actor_user_id: 2,
    metadata: {
      actorUsername: 'admin',
      projectId: 9,
      projectName: 'Board project',
      taskId: 10,
      taskTitle: 'New card',
      taskNumber: 5,
    },
  }]);
});

test('syncBoardToTables removes tasks and columns missing from incoming board', async () => {
  const keptColumn = createRecord({ id: 1, client_id: 'todo', name: 'Old name', position: 0 });
  const removedColumn = createRecord({ id: 2, client_id: 'done', name: 'Done', position: 1 });
  const removedTask = createRecord({ id: 10, client_id: 'card-10', project_id: 12, column_id: 2 });
  const destroyedTasks = [];
  const destroyedColumns = [];

  const Column = {
    async findAll() {
      return [keptColumn, removedColumn];
    },
    async create() {
      throw new Error('No columns should be created in this scenario');
    },
    async destroy({ where }) {
      destroyedColumns.push(where);
      return 1;
    },
  };
  const Task = {
    async findAll() {
      return [removedTask];
    },
    async max() {
      return null;
    },
    async create() {
      throw new Error('No tasks should be created in this scenario');
    },
    async destroy({ where }) {
      destroyedTasks.push(where);
      return 1;
    },
  };
  const sequelize = {
    models: {
      Column,
      Task,
      User: { async findByPk() { return null; } },
      ActivityLog: { async create() { return null; } },
    },
    async transaction(callback) {
      return callback('tx');
    },
  };

  await syncBoardToTables(sequelize, {
    columns: [{ id: 'todo', title: 'Ready', cardIds: [] }],
    cards: {},
  }, 12, { userId: 5, username: 'admin', projectName: 'Cleanup board' });

  assert.equal(keptColumn.name, 'Ready');
  assert.deepEqual(destroyedTasks, [{ id: { [Op.in]: [10] }, project_id: 12 }]);
  assert.equal(destroyedColumns[0].project_id, 12);
  assert.deepEqual(destroyedColumns[0].id, { [Op.in]: [2] });
});
