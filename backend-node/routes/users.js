// Anonymous user system.
//
// We don't have a real auth backend yet — instead the React client
// generates a UUID v4 on first visit, persists it in localStorage, and
// sends it in `X-Client-Id` on every request. The backend treats that ID
// as the owner of all the user-scoped resources (imports, scores, etc.).
//
// When real auth (Google OAuth / email-password) is added later, we can
// migrate these anonymous client IDs onto authenticated user records.
const express = require('express');
const { getDb } = require('../services/mongo');

const router = express.Router();

function getClientId(req) {
  const cid = req.header('X-Client-Id');
  if (typeof cid !== 'string') return null;
  const trimmed = cid.trim();
  // Loose UUID-ish validation — the client always generates uuidv4 but we
  // don't enforce strict format so future schemes (jwt sub claim, google
  // sub) keep working.
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  return trimmed;
}

async function ensureUser(db, cid) {
  const existing = await db.collection('users').findOne({ id: cid });
  if (existing) return existing;
  const fresh = {
    id: cid,
    username: `Player${cid.slice(0, 4).toUpperCase()}`,
    country: 'FR',
    created_at: new Date(),
    updated_at: new Date(),
  };
  try {
    await db.collection('users').insertOne(fresh);
  } catch (err) {
    // Concurrent insert from another tab — fetch the winner.
    if (err && err.code === 11000) {
      return await db.collection('users').findOne({ id: cid });
    }
    throw err;
  }
  return fresh;
}

router.get('/me', async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  try {
    const db = await getDb();
    const user = await ensureUser(db, cid);
    delete user._id;
    res.json(user);
  } catch (err) {
    console.error('[users.me GET]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.patch('/me', async (req, res) => {
  const cid = getClientId(req);
  if (!cid) return res.status(400).json({ error: 'X-Client-Id header required' });
  try {
    const db = await getDb();
    await ensureUser(db, cid);

    const { username, country } = req.body || {};
    const set = { updated_at: new Date() };
    if (typeof username === 'string') {
      const trimmed = username.trim().slice(0, 30);
      if (trimmed.length < 1) {
        return res.status(400).json({ error: 'username cannot be empty' });
      }
      set.username = trimmed;
    }
    if (typeof country === 'string') {
      set.country = country.trim().slice(0, 4).toUpperCase();
    }

    await db.collection('users').updateOne({ id: cid }, { $set: set });
    const user = await db.collection('users').findOne({ id: cid });
    delete user._id;
    res.json(user);
  } catch (err) {
    console.error('[users.me PATCH]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = { router, getClientId };
