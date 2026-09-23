// Emergent Auth (Google OAuth managed by Emergent).
//
// Flow:
//   1. React shows a "Sign in with Google" button that redirects to
//      https://auth.emergentagent.com/?redirect=<current-origin>/auth/callback
//   2. Google finishes → user lands at `<origin>/auth/callback#session_id=<id>`
//   3. AuthCallback (React) POSTs { session_id } to this route.
//   4. We hit Emergent's /auth/v1/env/oauth/session-data with X-Session-ID,
//      get {id,email,name,picture,session_token}, upsert into `users` and
//      insert a row into `user_sessions` with 7-day expiry, set an httpOnly
//      cookie `session_token`, then return the user doc to React.
//
// The anonymous `X-Client-Id` fallback (routes/users.js) still works when
// no cookie is present — users who never sign in keep their local profile.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../services/mongo');

const router = express.Router();

const EMERGENT_SESSION_URL =
  'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data';
const SESSION_COOKIE = 'session_token';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Extract a session token from either the httpOnly cookie or an
// `Authorization: Bearer <token>` header (fallback for non-browser
// clients like curl / the webosu2 iframe).
function extractSessionToken(req) {
  if (req.cookies && req.cookies[SESSION_COOKIE]) return req.cookies[SESSION_COOKIE];
  const auth = req.header('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

async function loadUserBySession(db, token) {
  if (!token) return null;
  const session = await db.collection('user_sessions').findOne({ session_token: token });
  if (!session) return null;
  // Timezone-safe expiry check (Mongo stores UTC).
  const exp = session.expires_at instanceof Date
    ? session.expires_at
    : new Date(session.expires_at);
  if (!exp || exp.getTime() < Date.now()) {
    // Expired — clean up so the next request doesn't re-check.
    try { await db.collection('user_sessions').deleteOne({ session_token: token }); }
    catch (_) {}
    return null;
  }
  const user = await db.collection('users').findOne({ user_id: session.user_id }, { projection: { _id: 0 } });
  return user || null;
}

// Middleware: attaches `req.user` if the request carries a valid session
// (cookie or Authorization header). Never throws — anonymous requests
// simply have no `req.user` and fall back to the X-Client-Id flow.
async function attachUserIfAuthed(req, _res, next) {
  try {
    const token = extractSessionToken(req);
    if (!token) return next();
    const db = await getDb();
    const user = await loadUserBySession(db, token);
    if (user) req.user = user;
  } catch (err) {
    console.warn('[auth middleware]', err.message);
  }
  next();
}

// POST /api/auth/session — exchange a session_id (from the OAuth callback
// URL fragment) for an Emergent session_token, store it, and set the
// httpOnly cookie.
router.post('/session', express.json(), async (req, res) => {
  const sid = (req.body && req.body.session_id) || req.header('X-Session-ID');
  if (!sid || typeof sid !== 'string' || sid.length < 8) {
    return res.status(400).json({ error: 'session_id required' });
  }
  try {
    const upstream = await fetch(EMERGENT_SESSION_URL, {
      method: 'GET',
      headers: { 'X-Session-ID': sid },
    });
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      console.warn('[auth.session upstream]', upstream.status, body.slice(0, 200));
      return res.status(401).json({ error: 'invalid session_id' });
    }
    const data = await upstream.json();
    const emergentId = data.id;
    const email = String(data.email || '').toLowerCase();
    const name = data.name || email.split('@')[0] || 'Player';
    const picture = data.picture || null;
    const sessionToken = data.session_token;
    if (!email || !sessionToken) {
      return res.status(502).json({ error: 'upstream missing fields' });
    }

    const db = await getDb();
    // Upsert user by email — treats returning users as the same account
    // even if Emergent's `id` changes.
    const existing = await db.collection('users').findOne({ email }, { projection: { _id: 0 } });
    let user;
    if (existing) {
      const patch = {
        updated_at: new Date(),
        name,
        picture,
        emergent_id: emergentId,
      };
      // Preserve the user's chosen username if they set one; otherwise
      // seed it from their Google display name.
      if (!existing.username || existing.username.startsWith('Player')) patch.username = name;
      await db.collection('users').updateOne({ email }, { $set: patch });
      user = { ...existing, ...patch };
    } else {
      const userId = 'user_' + uuidv4().replace(/-/g, '').slice(0, 20);
      user = {
        id: userId,          // legacy anonymous key (kept for existing routes)
        user_id: userId,     // canonical auth key
        emergent_id: emergentId,
        email,
        username: name,
        name,
        picture,
        country: 'FR',
        created_at: new Date(),
        updated_at: new Date(),
      };
      await db.collection('users').insertOne(user);
      delete user._id;
    }

    // Guarantee both id + user_id are populated (legacy docs may miss one).
    const userId = user.user_id || user.id;
    if (!user.user_id || !user.id) {
      await db.collection('users').updateOne(
        { email },
        { $set: { user_id: userId, id: userId } }
      );
      user.user_id = userId;
      user.id = userId;
    }

    // Store the session.
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.collection('user_sessions').insertOne({
      user_id: userId,
      session_token: sessionToken,
      created_at: new Date(),
      expires_at: expiresAt,
      user_agent: req.header('User-Agent') || null,
    });

    // Set the httpOnly cookie. sameSite=none + secure is required for the
    // /webosu2/ iframe and cross-origin fetch.
    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      expires: expiresAt,
    });

    res.json({ user: {
      user_id: userId,
      email: user.email,
      username: user.username,
      name: user.name,
      picture: user.picture,
      country: user.country,
    }});
  } catch (err) {
    console.error('[auth.session]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// GET /api/auth/me — returns the authenticated user, or 401.
router.get('/me', async (req, res) => {
  try {
    const token = extractSessionToken(req);
    if (!token) return res.status(401).json({ error: 'not authenticated' });
    const db = await getDb();
    const user = await loadUserBySession(db, token);
    if (!user) return res.status(401).json({ error: 'invalid or expired session' });
    res.json({
      user_id: user.user_id || user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      picture: user.picture,
      country: user.country,
    });
  } catch (err) {
    console.error('[auth.me]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// POST /api/auth/logout — clear session.
router.post('/logout', async (req, res) => {
  try {
    const token = extractSessionToken(req);
    if (token) {
      const db = await getDb();
      await db.collection('user_sessions').deleteOne({ session_token: token });
    }
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true, secure: true, sameSite: 'none', path: '/',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth.logout]', err);
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = { router, attachUserIfAuthed };
