'use strict';
// Unit/integration tests for V2 API — Node 18+ built-in test runner
// Run: npm test
// The server starts on port 3001 for tests so it doesn't conflict with dev.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

const BASE = 'http://localhost:3001';

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = http.request(`${BASE}${path}`, { method, headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = (path, token)       => request('GET',    path, null,  token);
const post = (path, body, token)  => request('POST',   path, body,  token);
const patch= (path, body, token)  => request('PATCH',  path, body,  token);

// ─── Server lifecycle ────────────────────────────────────────────────────────

let server;
let adminToken, patientToken;
let patientId, sessionId, measurementId, recommendationId;

before(async () => {
  process.env.PORT = '3001';
  // Load app — this calls initDb and seeds the admin account
  const app = require('../src/server');
  await new Promise(resolve => setTimeout(resolve, 800)); // wait for DB init
  server = app.listen ? app : null;
  // server.js calls app.listen internally, so we just wait
});

after(() => {
  // Process exits after tests complete
  setTimeout(() => process.exit(0), 200);
});

// ─── HEALTH ──────────────────────────────────────────────────────────────────

test('GET /health returns ok', async () => {
  const res = await get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

// ─── AUTH — ADMIN LOGIN ───────────────────────────────────────────────────────

test('POST /auth/login — admin logs in with seeded credentials', async () => {
  const res = await post('/auth/login', { email: 'admin@v2.dsd', password: 'Admin2026!' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token, 'token must be present');
  assert.equal(res.body.user.role, 'admin');
  adminToken = res.body.token;
});

// ─── AUTH — PATIENT REGISTRATION ─────────────────────────────────────────────

test('POST /auth/register — patient registers successfully', async () => {
  const res = await post('/auth/register', {
    name: 'Test Patient',
    email: `patient_${Date.now()}@test.dsd`,
    password: 'Patient123!',
    role: 'patient',
    age: 30
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.token, 'JWT token must be returned for patient');
  assert.equal(res.body.user.role, 'patient');
  assert.equal(res.body.user.status, 'active');
  patientToken = res.body.token;
  patientId    = res.body.user.id;
});

test('POST /auth/register — duplicate email returns 409', async () => {
  const email = `dup_${Date.now()}@test.dsd`;
  await post('/auth/register', { name: 'A', email, password: 'x', role: 'patient' });
  const res = await post('/auth/register', { name: 'B', email, password: 'x', role: 'patient' });
  assert.equal(res.status, 409);
});

test('POST /auth/register — missing fields returns 400', async () => {
  const res = await post('/auth/register', { email: 'x@x.com' });
  assert.equal(res.status, 400);
});

// ─── AUTH — LOGIN ─────────────────────────────────────────────────────────────

test('POST /auth/login — wrong password returns 401', async () => {
  const res = await post('/auth/login', { email: 'admin@v2.dsd', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('POST /auth/login — missing fields returns 400', async () => {
  const res = await post('/auth/login', { email: 'admin@v2.dsd' });
  assert.equal(res.status, 400);
});

// ─── AUTH — STATUS ────────────────────────────────────────────────────────────

test('GET /auth/status — returns userId and role', async () => {
  const res = await get('/auth/status', adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.userId);
  assert.equal(res.body.role, 'admin');
});

test('GET /auth/status — no token returns 401', async () => {
  const res = await get('/auth/status');
  assert.equal(res.status, 401);
});

// ─── PATIENTS ─────────────────────────────────────────────────────────────────

test('GET /patients — returns array of patients', async () => {
  const res = await get('/patients', adminToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('GET /patients/:id — returns patient by id', async () => {
  const res = await get(`/patients/${patientId}`, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, patientId);
  assert.equal(res.body.role, 'patient');
});

test('GET /patients/:id — non-existent id returns 404', async () => {
  const res = await get('/patients/999999', adminToken);
  assert.equal(res.status, 404);
});

// ─── SESSIONS ─────────────────────────────────────────────────────────────────

test('POST /sessions — creates a session for patient', async () => {
  const res = await post('/sessions', { userId: patientId }, patientToken);
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.equal(res.body.user_id, patientId);
  assert.ok(res.body.started_at);
  assert.equal(res.body.ended_at, null);
  sessionId = res.body.id;
});

test('POST /sessions — missing userId returns 400', async () => {
  const res = await post('/sessions', {}, patientToken);
  assert.equal(res.status, 400);
});

test('GET /sessions/:userId — returns sessions for user', async () => {
  const res = await get(`/sessions/${patientId}`, patientToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some(s => s.id === sessionId));
});

// ─── MEASUREMENTS ─────────────────────────────────────────────────────────────

test('POST /measurements — records a single measurement', async () => {
  const res = await post('/measurements', {
    sessionId,
    jointAngles: { knee: 45.0, hip: 30.0 },
    isCorrect: false
  }, patientToken);
  assert.equal(res.status, 201);
  assert.equal(res.body.session_id, sessionId);
  assert.deepEqual(res.body.joint_angles, { knee: 45.0, hip: 30.0 });
  assert.equal(res.body.is_correct, false);
  measurementId = res.body.id;
});

test('POST /measurements — missing jointAngles returns 400', async () => {
  const res = await post('/measurements', { sessionId }, patientToken);
  assert.equal(res.status, 400);
});

test('POST /measurements/batch — inserts multiple measurements', async () => {
  const res = await post('/measurements/batch', {
    sessionId,
    measurements: [
      { jointAngles: { knee: 40.0 }, isCorrect: true },
      { jointAngles: { knee: 42.0 }, isCorrect: false },
      { jointAngles: { knee: 44.0 }, isCorrect: true }
    ]
  }, patientToken);
  assert.equal(res.status, 201);
  assert.equal(res.body.inserted, 3);
  assert.equal(res.body.sessionId, sessionId);
});

test('GET /measurements/:sessionId — returns measurements array', async () => {
  const res = await get(`/measurements/${sessionId}`, patientToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 1);
});

test('GET /measurements/:sessionId?startDate — filters by date', async () => {
  const res = await get(`/measurements/${sessionId}?startDate=2000-01-01`, patientToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// ─── END SESSION ──────────────────────────────────────────────────────────────

test('PATCH /sessions/:id/end — closes the session', async () => {
  const res = await patch(`/sessions/${sessionId}/end`, {}, patientToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.ended_at, 'ended_at must be set');
});

test('PATCH /sessions/:id/end — closing again returns 409', async () => {
  const res = await patch(`/sessions/${sessionId}/end`, {}, patientToken);
  assert.equal(res.status, 409);
});

test('POST /measurements — adding to closed session returns 409', async () => {
  const res = await post('/measurements', {
    sessionId,
    jointAngles: { knee: 90.0 }
  }, patientToken);
  assert.equal(res.status, 409);
});

// ─── RECOMMENDATIONS ─────────────────────────────────────────────────────────

test('POST /recommendations — creates recommendation', async () => {
  const res = await post('/recommendations', {
    userId: patientId,
    content: 'Do 10 reps of knee flexion',
    notes: 'Focus on full range of motion'
  }, adminToken);
  assert.equal(res.status, 201);
  assert.equal(res.body.user_id, patientId);
  assert.ok(res.body.content);
  recommendationId = res.body.id;
});

test('GET /recommendations/:userId — returns array', async () => {
  const res = await get(`/recommendations/${patientId}`, patientToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 1);
});

test('GET /recommendations/:userId — unknown user returns 404', async () => {
  const res = await get('/recommendations/999999', patientToken);
  assert.equal(res.status, 404);
});

// ─── SCHEDULE ─────────────────────────────────────────────────────────────────

test('POST /schedule — creates schedule entry', async () => {
  const res = await post('/schedule', {
    userId: patientId,
    exercise: 'Knee flexion',
    date: '2026-06-01',
    duration: 30
  }, adminToken);
  assert.equal(res.status, 201);
  assert.equal(res.body.user_id, patientId);
});

test('GET /schedule/:userId — returns schedule entries', async () => {
  const res = await get(`/schedule/${patientId}`, patientToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

// ─── PUSH TOKENS ──────────────────────────────────────────────────────────────

test('POST /push/register — registers a push token', async () => {
  const res = await post('/push/register', {
    userId: patientId,
    token: 'test-device-token-abc123',
    platform: 'ios'
  }, patientToken);
  assert.equal(res.status, 201);
  assert.equal(res.body.user_id, patientId);
  assert.ok(res.body.token);
});
