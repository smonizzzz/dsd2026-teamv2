const { WebSocket, WebSocketServer } = require('ws');

const clientsBySession = new Map();

function getSessionClients(sessionId) {
  const key = String(sessionId);
  if (!clientsBySession.has(key)) clientsBySession.set(key, new Set());
  return clientsBySession.get(key);
}

function setupFeedbackSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      socket.close(1008, 'sessionId query parameter is required');
      return;
    }

    const clients = getSessionClients(sessionId);
    clients.add(socket);

    socket.send(JSON.stringify({
      type: 'connected',
      data: { sessionId: Number(sessionId) }
    }));

    socket.on('close', () => {
      clients.delete(socket);
      if (clients.size === 0) clientsBySession.delete(String(sessionId));
    });
  });

  return wss;
}

function broadcastToSession(sessionId, message) {
  const clients = clientsBySession.get(String(sessionId));
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastMovementFeedback({ sessionId, timestamp, isCorrect, jointAngles }) {
  if (!jointAngles || typeof jointAngles !== 'object') return;

  for (const [joint, angle] of Object.entries(jointAngles)) {
    broadcastToSession(sessionId, {
      type: 'movement_feedback',
      data: {
        sessionId: Number(sessionId),
        timestamp,
        isCorrect: Boolean(isCorrect),
        joint,
        angle
      }
    });
  }
}

function broadcastSessionEnded({ sessionId, timestamp }) {
  broadcastToSession(sessionId, {
    type: 'session_ended',
    data: {
      sessionId: Number(sessionId),
      timestamp
    }
  });
}

module.exports = {
  setupFeedbackSocket,
  broadcastMovementFeedback,
  broadcastSessionEnded
};
