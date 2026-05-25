const { Sequelize, DataTypes } = require('sequelize');

function defineModels(sequelizeInstance) {
  const User = sequelizeInstance.models.User || sequelizeInstance.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'users',
    timestamps: false,
  });

  const Project = sequelizeInstance.models.Project || sequelizeInstance.define('Project', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    theme: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'projects',
    timestamps: false,
  });

  const ActivityLog = sequelizeInstance.models.ActivityLog || sequelizeInstance.define('ActivityLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    event_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    actor_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'activity_log',
    timestamps: false,
  });

  const BoardState = sequelizeInstance.models.BoardState || sequelizeInstance.define('BoardState', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    board: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    next_task_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'board_state',
    timestamps: false,
  });

  const Column = sequelizeInstance.models.Column || sequelizeInstance.define('Column', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    client_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'columns',
    timestamps: false,
  });

  const Task = sequelizeInstance.models.Task || sequelizeInstance.define('Task', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    stat: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Создана',
    },
    priority: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'normal',
    },
    column_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    client_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    task_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    customer_name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assignee_name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assignee_initials: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    planned_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    duration_weeks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    duration_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  }, {
    tableName: 'tasks',
    timestamps: false,
  });

  Column.hasMany(Task, { foreignKey: 'column_id' });
  Task.belongsTo(Column, { foreignKey: 'column_id' });
  Project.hasMany(Column, { foreignKey: 'project_id' });
  Project.hasMany(Task, { foreignKey: 'project_id' });
  Column.belongsTo(Project, { foreignKey: 'project_id' });
  Task.belongsTo(Project, { foreignKey: 'project_id' });
  User.hasMany(ActivityLog, { foreignKey: 'actor_user_id' });
  ActivityLog.belongsTo(User, { foreignKey: 'actor_user_id' });

  return { Task, Column, BoardState, User, Project, ActivityLog };
}

module.exports = { defineModels };
