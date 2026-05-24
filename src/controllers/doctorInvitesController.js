const crypto = require('crypto');
const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');
const { ensureRole } = require('../utils/accessControl');

function makeRegistrationUrl(req, token) {
  const baseUrl = process.env.PATIENT_REGISTER_BASE_URL || `${req.protocol}://${req.get('host')}/auth/register`;
  return `${baseUrl}?inviteToken=${encodeURIComponent(token)}`;
}

function inviteIsUsable(invite) {
  if (!invite || invite.status !== 'active') return false;
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return false;
  return invite.used_count < invite.max_uses;
}

async function createInvite(req, res, next) {
  try {
    ensureRole(req.user, ['admin', 'clinician']);
    const { db, save } = await getDb();
    const { doctorId, maxUses = 1, expiresAt = null } = req.body || {};
    const resolvedDoctorId = req.user.role === 'admin' && doctorId ? Number(doctorId) : Number(req.user.id);

    const doctor = queryOne(db,
      "SELECT id, name, email, role, status FROM users WHERE id = ? AND role = 'clinician'",
      [resolvedDoctorId]
    );
    if (!doctor) {
      const e = new Error('Doctor not found');
      e.status = 404;
      return next(e);
    }
    if (doctor.status !== 'active') {
      const e = new Error('Doctor account must be active before creating invites');
      e.status = 409;
      return next(e);
    }

    const uses = Number(maxUses);
    if (!Number.isInteger(uses) || uses < 1) {
      const e = new Error('maxUses must be a positive integer');
      e.status = 400;
      return next(e);
    }

    const token = crypto.randomBytes(18).toString('base64url');
    const result = run(db, `
      INSERT INTO doctor_invites (doctor_id, token, max_uses, expires_at)
      VALUES (?, ?, ?, ?)
    `, [resolvedDoctorId, token, uses, expiresAt]);
    save();

    const invite = queryOne(db, 'SELECT * FROM doctor_invites WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({
      ...invite,
      registration_url: makeRegistrationUrl(req, token),
      qr_payload: makeRegistrationUrl(req, token)
    });
  } catch (err) { next(err); }
}

async function getInviteByToken(req, res, next) {
  try {
    const { db } = await getDb();
    const invite = queryOne(db, `
      SELECT i.id, i.token, i.status, i.max_uses, i.used_count, i.expires_at, i.created_at,
             u.id AS doctor_id, u.name AS doctor_name, u.email AS doctor_email
      FROM doctor_invites i
      JOIN users u ON u.id = i.doctor_id
      WHERE i.token = ?
    `, [req.params.token]);
    if (!invite) {
      const e = new Error('Invite not found');
      e.status = 404;
      return next(e);
    }

    res.json({
      valid: inviteIsUsable(invite),
      token: invite.token,
      status: invite.status,
      max_uses: invite.max_uses,
      used_count: invite.used_count,
      expires_at: invite.expires_at,
      doctor: {
        id: invite.doctor_id,
        name: invite.doctor_name,
        email: invite.doctor_email
      }
    });
  } catch (err) { next(err); }
}

async function getInvites(req, res, next) {
  try {
    ensureRole(req.user, ['admin', 'clinician']);
    const { db } = await getDb();
    const params = [];
    let where = '';

    if (req.user.role === 'clinician') {
      where = 'WHERE doctor_id = ?';
      params.push(req.user.id);
    } else if (req.query.doctorId) {
      where = 'WHERE doctor_id = ?';
      params.push(req.query.doctorId);
    }

    const invites = queryAll(db, `
      SELECT * FROM doctor_invites
      ${where}
      ORDER BY created_at DESC
    `, params).map(invite => ({
      ...invite,
      registration_url: makeRegistrationUrl(req, invite.token),
      qr_payload: makeRegistrationUrl(req, invite.token)
    }));
    res.json(invites);
  } catch (err) { next(err); }
}

module.exports = { createInvite, getInviteByToken, getInvites };
