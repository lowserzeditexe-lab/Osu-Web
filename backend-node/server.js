const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const beatmapsRouter = require('./routes/beatmaps');

const app = express();
const PORT = parseInt(process.env.PORT || '8001', 10);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const api = express.Router();

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

app.use('/api', api);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[osuweb-backend] listening on 0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
