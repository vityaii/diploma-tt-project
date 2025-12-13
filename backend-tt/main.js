require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');

const DB_NAME = 'ttbd';
const DB_USER = 'postgres';
const DB_PASS = 'root';
const DB_HOST = 'localhost';
const DB_DIALECT = 'postgres';
const PORT = 7070;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  dialect: DB_DIALECT,
});

const Tasks = sequelize.define('Tasks', {
  id: {
    type: DataTypes.UUID,
    allowNull: false,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  title: { // название таски
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '',
  },
  text: { // содержимое таски
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '',
  },
  stat: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Создана',
  },
  date_creation: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
  },
}, {
  timestamps: true,
});

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// получить все таски
app.get('/tasks', async (req, res) => {
  try {
    const tasks = await Tasks.findAll();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// получить таску по id
app.get('/tasks/:id', async (req, res) => {
  try {
    const task = await Tasks.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Не нашлась задача' });
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// создать таску
app.post('/task', async (req, res) => {
  const { title, text } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Название необходимо' });
  }

  try {
    const task = await Tasks.create({ title, text, stat });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Редактировать таску по id
app.put('/tasks/:id', async (req, res) => {
  const { title} = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Необходимо название' });
  }

  try {
    const task = await Tasks.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Не найдена задача' });
    }
    task.title = title;
    task.text = text;
    task.stat = stat;
    await note.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// вернёт все задачи при запросе к корню
app.get('/', async (req, res) => {
  try {
    const tasks = await Tasks.findAll();
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// удаление задачи по id
app.delete('/tasks/:id', async (req, res) => {
  try {
    const deleted = await Tasks.destroy({ where: { id: req.params.id } });
    if (!deleted) {
      return res.status(404).json({ error: 'Не найдена задача' });
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

sequelize.authenticate()
  .then(() => sequelize.sync())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });
