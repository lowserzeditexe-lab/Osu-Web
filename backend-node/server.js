const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const beatmapsRouter = require('./routes/beatmaps');
const { router: usersRouter } = require('./routes/users');
const importsRouter = require('./routes/imports');
const scoresRouter = require('./routes/scores');
const { router: authRouter, attachUserIfAuthed } = require('./routes/auth');

const app = express();
const PORT = parseInt(process.env.PORT || '8001', 10);

// CORS: credentials=true is required so browsers send the session_token
// cookie back to the API. `origin: true` reflects the request origin
// which is fine for a same-app deployment (React & webosu2 are on the
// same host as the API through the Kubernetes ingress).
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['X-Client-Id'],
}));
app.use(cookieParser());
// JSON body cap stays at 1mb (.osz uploads use multipart and are handled
// separately by multer inside `/routes/imports.js`).
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const api = express.Router();
// Attach `req.user` on every /api/* request when the caller carries a
// valid session cookie or Authorization header. Routes can then check
// `req.user?.user_id` and fall back to `X-Client-Id` otherwise.
api.use(attachUserIfAuthed);

api.get('/', (req, res) => {
  res.json({ name: 'osu!web api', version: '0.3.0' });
});

api.get('/health', async (req, res) => {
  res.json({ ok: true });
});

const MENU_ITEMS = [
  { slug: 'solo',        title: 'Solo',        description: 'Play beatmaps on your own. Practice, grind, climb.',     icon: 'play',     accent: '#ff66aa', sort_order: 1 },
  { slug: 'multiplayer', title: 'Multiplayer', description: 'Challenge other players in real-time rooms.',             icon: 'users',    accent: '#66a8ff', sort_order: 2 },
  { slug: 'library',     title: 'Library',     description: 'Your beatmap collection. Manage, import, curate.',       icon: 'library',  accent: '#b388ff', sort_order: 3 },
  { slug: 'settings',    title: 'Settings',    description: 'Audio, input, skin, and gameplay preferences.',          icon: 'settings', accent: '#9aa0a6', sort_order: 4 },
];

api.get('/menu', async (req, res) => {
  res.json({ items: MENU_ITEMS });
});

api.use('/beatmaps', beatmapsRouter);
api.use('/users', usersRouter);
api.use('/imports', importsRouter);
api.use('/scores', scoresRouter);
api.use('/auth', authRouter);

app.use('/api', api);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[osuweb-backend] listening on 0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
