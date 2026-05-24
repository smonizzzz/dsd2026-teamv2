const assert = require('assert');
const { WebSocket } = require('ws');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WS_URL = BASE_URL.replace(/^http/, 'ws');
const runId = Date.now();
const passedTests = [];

async function request(method, path, body, token) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, data };
}

async function multipartRequest(method, path, fields, files, token) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  for (const file of files) {
    form.append(file.field, new Blob([file.content], { type: file.type }), file.name);
  }

  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: form,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, data };
}

function expectStatus(result, expected, label) {
  assert.strictEqual(
    result.status,
    expected,
    `${label}: expected HTTP ${expected}, got ${result.status}: ${JSON.stringify(result.data)}`
  );
  passedTests.push(`${label} returned HTTP ${expected}`);
}

function connectFeedbackSocket(sessionId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS_URL}/ws?sessionId=${sessionId}`);
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);

    socket.on('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on('error', reject);
  });
}

function waitForSocketMessage(socket, predicate, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`${label}: timed out waiting for WebSocket message`));
    }, 5000);

    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;

      clearTimeout(timeout);
      socket.off('message', onMessage);
      passedTests.push(label);
      resolve(message);
    }

    socket.on('message', onMessage);
  });
}

async function main() {
  console.log(`Testing API at ${BASE_URL}`);

  const health = await request('GET', '/health');
  expectStatus(health, 200, 'GET /health');
  assert.strictEqual(health.data.status, 'ok');

  const adminLogin = await request('POST', '/auth/login', {
    email: 'admin@v2.dsd',
    password: 'Admin2026!',
  });
  expectStatus(adminLogin, 200, 'POST /auth/login admin');
  const adminToken = adminLogin.data.token;

  const clinicianEmail = `doctor-${runId}@example.com`;
  const clinicianPassword = 'DoctorPassword123!';
  const clinicianRegister = await multipartRequest('POST', '/auth/register', {
    name: 'Pending Doctor',
    email: clinicianEmail,
    password: clinicianPassword,
    role: 'clinician',
  }, [
    { field: 'license', name: 'license-old.txt', content: 'old license photo', type: 'text/plain' },
  ]);
  expectStatus(clinicianRegister, 201, 'POST /auth/register clinician with license');
  assert.strictEqual(clinicianRegister.data.status, 'pending');

  const clinicianPendingLogin = await request('POST', '/auth/login', { email: clinicianEmail, password: clinicianPassword });
  expectStatus(clinicianPendingLogin, 403, 'POST /auth/login pending clinician');

  const rejectClinician = await request('PATCH', `/auth/reject/${clinicianRegister.data.userId}`, undefined, adminToken);
  expectStatus(rejectClinician, 200, 'PATCH /auth/reject/:userId');
  assert.strictEqual(rejectClinician.data.status, 'rejected');

  const clinicianRejectedLogin = await request('POST', '/auth/login', { email: clinicianEmail, password: clinicianPassword });
  expectStatus(clinicianRejectedLogin, 403, 'POST /auth/login rejected clinician');

  const updateClinicianLicense = await multipartRequest('PATCH', `/users/${clinicianRegister.data.userId}/license`, {}, [
    { field: 'license', name: 'license-new.txt', content: 'new license photo', type: 'text/plain' },
  ]);
  expectStatus(updateClinicianLicense, 200, 'PATCH /users/:id/license');
  assert.strictEqual(updateClinicianLicense.data.status, 'pending');

  const approveClinician = await request('PATCH', `/auth/approve/${clinicianRegister.data.userId}`, undefined, adminToken);
  expectStatus(approveClinician, 200, 'PATCH /auth/approve/:userId');

  const clinicianApprovedLogin = await request('POST', '/auth/login', { email: clinicianEmail, password: clinicianPassword });
  expectStatus(clinicianApprovedLogin, 200, 'POST /auth/login approved clinician');
  assert.ok(clinicianApprovedLogin.data.token, 'approved clinician login should return a token');
  const clinicianToken = clinicianApprovedLogin.data.token;
  const clinicianId = clinicianApprovedLogin.data.user.id;

  const invite = await request('POST', '/doctor-invites', { maxUses: 1 }, clinicianToken);
  expectStatus(invite, 201, 'POST /doctor-invites');
  assert.strictEqual(invite.data.doctor_id, clinicianId);
  assert.ok(invite.data.token, 'doctor invite should return a token');
  assert.ok(invite.data.registration_url.includes('inviteToken='));

  const inviteStatus = await request('GET', `/doctor-invites/${invite.data.token}`);
  expectStatus(inviteStatus, 200, 'GET /doctor-invites/:token');
  assert.strictEqual(inviteStatus.data.valid, true);

  const email = `tester-${runId}@example.com`;
  const password = 'TestPassword123!';

  const independentRegister = await request('POST', '/auth/register', {
    name: 'Independent Patient',
    email: `independent-${runId}@example.com`,
    password,
    role: 'patient',
  });
  expectStatus(independentRegister, 400, 'POST /auth/register patient without invite');

  const register = await request('POST', '/auth/register', {
    name: 'API Smoke Tester',
    email,
    password,
    role: 'patient',
    age: 25,
    inviteToken: invite.data.token,
  });
  expectStatus(register, 201, 'POST /auth/register patient with invite');
  assert.ok(register.data.token, 'register should return a token');
  assert.ok(register.data.user.id, 'register should return a user id');
  assert.strictEqual(register.data.user.doctor_id, clinicianId);

  const login = await request('POST', '/auth/login', { email, password });
  expectStatus(login, 200, 'POST /auth/login');
  assert.ok(login.data.token, 'login should return a token');

  const token = login.data.token;
  const userId = login.data.user.id;

  const me = await request('GET', '/auth/me', undefined, token);
  expectStatus(me, 200, 'GET /auth/me');
  assert.strictEqual(me.data.email, email);

  const doctorPatients = await request('GET', '/patients', undefined, clinicianToken);
  expectStatus(doctorPatients, 200, 'GET /patients as bound doctor');
  assert.ok(doctorPatients.data.some((patient) => patient.id === userId));

  const session = await request('POST', '/sessions', { userId }, token);
  expectStatus(session, 201, 'POST /sessions');
  assert.ok(session.data.id, 'session should return an id');

  const sessionId = session.data.id;
  const feedbackSocket = await connectFeedbackSocket(sessionId);
  const connectedMessage = await waitForSocketMessage(
    feedbackSocket,
    (message) => message.type === 'connected' && message.data.sessionId === sessionId,
    'WebSocket /ws connected to session'
  );
  assert.strictEqual(connectedMessage.data.sessionId, sessionId);

  const movementFeedbackPromise = waitForSocketMessage(
    feedbackSocket,
    (message) => (
      message.type === 'movement_feedback' &&
      message.data.sessionId === sessionId &&
      message.data.joint === 'knee'
    ),
    'WebSocket movement_feedback event received'
  );

  const measurement = await request('POST', '/measurements', {
    sessionId,
    jointAngles: { knee: 45.2, hip: 30.1 },
    isCorrect: true,
  });
  expectStatus(measurement, 201, 'POST /measurements');
  assert.strictEqual(measurement.data.session_id, sessionId);
  assert.deepStrictEqual(measurement.data.joint_angles, { knee: 45.2, hip: 30.1 });
  assert.strictEqual(measurement.data.is_correct, true);

  const movementFeedback = await movementFeedbackPromise;
  assert.deepStrictEqual(movementFeedback.data, {
    sessionId,
    timestamp: measurement.data.timestamp,
    isCorrect: true,
    joint: 'knee',
    angle: 45.2,
  });

  const batch = await request('POST', '/measurements/batch', {
    sessionId,
    measurements: [
      { jointAngles: { knee: 40, hip: 20 }, isCorrect: false },
      { jointAngles: { knee: 50, hip: 35 }, isCorrect: true },
    ],
  });
  expectStatus(batch, 201, 'POST /measurements/batch');
  assert.strictEqual(batch.data.inserted, 2);

  const measurements = await request('GET', `/measurements/${sessionId}`, undefined, token);
  expectStatus(measurements, 200, 'GET /measurements/:sessionId');
  assert.strictEqual(measurements.data.length, 3);

  const progress = await request('GET', `/progress/${userId}`, undefined, clinicianToken);
  expectStatus(progress, 200, 'GET /progress/:userId');
  assert.strictEqual(progress.data.userId, userId);
  assert.ok(progress.data.summary.total_sessions >= 1);
  assert.ok(progress.data.summary.total_measurements >= 3);
  assert.ok(progress.data.joint_progress.some((item) => item.joint === 'knee'));
  assert.ok(Array.isArray(progress.data.recent_sessions));
  assert.ok(Array.isArray(progress.data.daily_trend));

  const standardCurve = await request('POST', '/standard-curves', {
    name: 'Knee baseline',
    joint: 'knee',
    curveData: [45.2, 40, 50],
    notes: 'Smoke test standard curve',
  }, clinicianToken);
  expectStatus(standardCurve, 201, 'POST /standard-curves');
  assert.strictEqual(standardCurve.data.doctor_id, clinicianId);

  const standardCurveList = await request('GET', '/standard-curves?joint=knee', undefined, clinicianToken);
  expectStatus(standardCurveList, 200, 'GET /standard-curves');
  assert.ok(standardCurveList.data.some((curve) => curve.id === standardCurve.data.id));

  const curveComparison = await request('GET', `/standard-curves/compare?sessionId=${sessionId}&curveId=${standardCurve.data.id}`, undefined, clinicianToken);
  expectStatus(curveComparison, 200, 'GET /standard-curves/compare');
  assert.strictEqual(curveComparison.data.session_id, sessionId);
  assert.strictEqual(curveComparison.data.joint, 'knee');
  assert.ok(curveComparison.data.samples_compared >= 1);

  const recommendation = await request('POST', '/recommendations', {
    sessionId,
    movement: 'knee flexion',
    confidence: 0.82,
    notes: 'Generated by smoke test',
  });
  expectStatus(recommendation, 201, 'POST /recommendations');
  assert.strictEqual(recommendation.data.status, 'pending');

  const engine = await request('GET', `/recommendations/engine/${userId}`, undefined, clinicianToken);
  expectStatus(engine, 200, 'GET /recommendations/engine/:userId');
  assert.ok(Array.isArray(engine.data.suggestions), 'engine should return suggestions array');

  const schedule = await request('POST', '/schedule', {
    userId,
    exercise: 'Knee rehabilitation',
    date: new Date(Date.now() + 86400000).toISOString(),
    duration: 30,
    notes: 'Smoke test schedule item',
  }, token);
  expectStatus(schedule, 201, 'POST /schedule');
  assert.strictEqual(schedule.data.user_id, userId);

  const scheduleList = await request('GET', `/schedule/${userId}`, undefined, clinicianToken);
  expectStatus(scheduleList, 200, 'GET /schedule/:userId');
  assert.ok(scheduleList.data.some((item) => item.id === schedule.data.id));

  const sessionEndedPromise = waitForSocketMessage(
    feedbackSocket,
    (message) => message.type === 'session_ended' && message.data.sessionId === sessionId,
    'WebSocket session_ended event received'
  );

  const endSession = await request('PATCH', `/sessions/${sessionId}/end`, undefined, token);
  expectStatus(endSession, 200, 'PATCH /sessions/:id/end');
  assert.ok(endSession.data.ended_at, 'ended session should have ended_at');

  const sessionEnded = await sessionEndedPromise;
  assert.deepStrictEqual(sessionEnded.data, {
    sessionId,
    timestamp: endSession.data.ended_at,
  });
  feedbackSocket.close();

  const closedMeasurement = await request('POST', '/measurements', {
    sessionId,
    jointAngles: { knee: 10 },
    isCorrect: false,
  });
  expectStatus(closedMeasurement, 409, 'POST /measurements after session end');

  console.log('');
  console.log('Passed tests:');
  for (const test of passedTests) {
    console.log(`- ${test}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
