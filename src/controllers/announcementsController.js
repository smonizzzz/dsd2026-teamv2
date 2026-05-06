const getDb = require('../db/connection');
const { queryAll, queryOne, run } = require('../db/helpers');

async function getAnnouncements(req, res, next) {
  try {
    const { db } = await getDb();
    const { status } = req.query;
    if (status) {
      if (!['draft', 'published'].includes(status)) {
        const e = new Error('status must be draft or published'); e.status = 400; return next(e);
      }
      return res.json(queryAll(db,
        'SELECT a.*, u.name AS created_by_name FROM announcements a JOIN users u ON u.id = a.created_by WHERE a.status = ? ORDER BY a.created_at DESC',
        [status]
      ));
    }
    res.json(queryAll(db,
      'SELECT a.*, u.name AS created_by_name FROM announcements a JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC'
    ));
  } catch (err) { next(err); }
}

async function getAnnouncementById(req, res, next) {
  try {
    const { db } = await getDb();
    const row = queryOne(db,
      'SELECT a.*, u.name AS created_by_name FROM announcements a JOIN users u ON u.id = a.created_by WHERE a.id = ?',
      [req.params.id]
    );
    if (!row) { const e = new Error('Announcement not found'); e.status = 404; return next(e); }
    res.json(row);
  } catch (err) { next(err); }
}

async function createAnnouncement(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { title, content, createdBy, status = 'draft' } = req.body;
    if (!title || !content || !createdBy) {
      const e = new Error('title, content and createdBy are required'); e.status = 400; return next(e);
    }
    if (!['draft', 'published'].includes(status)) {
      const e = new Error('status must be draft or published'); e.status = 400; return next(e);
    }
    if (!queryOne(db, 'SELECT id FROM users WHERE id = ?', [createdBy])) {
      const e = new Error('User not found'); e.status = 404; return next(e);
    }
    const result = run(db,
      'INSERT INTO announcements (title, content, created_by, status) VALUES (?, ?, ?, ?)',
      [title, content, createdBy, status]
    );
    save();
    res.status(201).json(queryOne(db, 'SELECT * FROM announcements WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) { next(err); }
}

async function updateAnnouncement(req, res, next) {
  try {
    const { db, save } = await getDb();
    const { title, content, status } = req.body;
    if (!title && !content && !status) {
      const e = new Error('at least one field is required: title, content, status'); e.status = 400; return next(e);
    }
    if (status && !['draft', 'published'].includes(status)) {
      const e = new Error('status must be draft or published'); e.status = 400; return next(e);
    }
    if (!queryOne(db, 'SELECT id FROM announcements WHERE id = ?', [req.params.id])) {
      const e = new Error('Announcement not found'); e.status = 404; return next(e);
    }
    const now = new Date().toISOString();
    const fields = ['updated_at = ?'];
    const values = [now];
    if (title)   { fields.push('title = ?');   values.push(title); }
    if (content) { fields.push('content = ?'); values.push(content); }
    if (status)  { fields.push('status = ?');  values.push(status); }
    values.push(req.params.id);
    run(db, `UPDATE announcements SET ${fields.join(', ')} WHERE id = ?`, values);
    save();
    res.json(queryOne(db, 'SELECT * FROM announcements WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
}

async function deleteAnnouncement(req, res, next) {
  try {
    const { db, save } = await getDb();
    if (!queryOne(db, 'SELECT id FROM announcements WHERE id = ?', [req.params.id])) {
      const e = new Error('Announcement not found'); e.status = 404; return next(e);
    }
    run(db, 'DELETE FROM announcements WHERE id = ?', [req.params.id]);
    save();
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = { getAnnouncements, getAnnouncementById, createAnnouncement, updateAnnouncement, deleteAnnouncement };
