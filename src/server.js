const express = require('express');
const cors    = require('cors');
const http    = require('http');
const initDb  = require('./db/init');
const { setupFeedbackSocket } = require('./realtime/feedbackSocket');

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
const auditLogsRouter       = require('./routes/auditLogs');
const progressRouter        = require('./routes/progress');
const exercisesRouter       = require('./routes/exercises');
const painRouter            = require('./routes/pain');

const app  = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

app.use(cors());
// 5 MB limit so large measurement batches (with raw IMU sensorData) are not rejected
// with 413; Express defaults to only 100 kb.
app.use(express.json({ limit: '5mb' }));

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
app.use('/audit-logs',      auditLogsRouter);
app.use('/progress',        progressRouter);
app.use('/exercises',       exercisesRouter);
app.use('/pain',            painRouter);

app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
app.use(errorHandler);

// Init DB then start server
initDb().then(() => {
  setupFeedbackSocket(server);
  server.listen(PORT, () => {
    console.log('');
    console.log('  ================================');
    console.log('   V2 Backend is running!');
    console.log('   http://localhost:' + PORT + '/health');
    console.log('   ws://localhost:' + PORT + '/ws?sessionId=1');
    console.log('  ================================');
    console.log('');
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

module.exports = app;
