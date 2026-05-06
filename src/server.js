const express = require('express');
const cors    = require('cors');
const initDb  = require('./db/init');

const errorHandler          = require('./middleware/errorHandler');
const authRouter            = require('./routes/auth');
const usersRouter           = require('./routes/users');
const patientsRouter        = require('./routes/patients');
const sessionsRouter        = require('./routes/sessions');
const measurementsRouter    = require('./routes/measurements');
const recommendationsRouter = require('./routes/recommendations');
const scheduleRouter        = require('./routes/schedule');
const pushRouter            = require('./routes/push');
const feedbackRouter        = require('./routes/feedback');
const announcementsRouter   = require('./routes/announcements');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({
  status: 'ok',
  team: 'V2 - Backend API & Storage',
  project: 'DSD 2025-2026',
  timestamp: new Date().toISOString()
}));

app.use('/auth',            authRouter);
app.use('/users',           usersRouter);
app.use('/patients',        patientsRouter);
app.use('/sessions',        sessionsRouter);
app.use('/measurements',    measurementsRouter);
app.use('/recommendations', recommendationsRouter);
app.use('/schedule',        scheduleRouter);
app.use('/push',            pushRouter);
app.use('/feedback',        feedbackRouter);
app.use('/announcements',   announcementsRouter);

app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
app.use(errorHandler);

// Init DB then start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ================================');
    console.log('   V2 Backend is running!');
    console.log('   http://localhost:' + PORT + '/health');
    console.log('  ================================');
    console.log('');
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

module.exports = app;
