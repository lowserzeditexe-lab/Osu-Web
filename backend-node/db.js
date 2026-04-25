const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[pg] unexpected error on idle client', err);
});

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      accent TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function seedMenu() {
  const items = [
    { slug: 'solo', title: 'Solo', description: 'Play beatmaps on your own. Practice, grind, climb.', icon: 'play', accent: '#ff66aa', sort_order: 1 },
    { slug: 'multiplayer', title: 'Multiplayer', description: 'Challenge other players in real-time rooms.', icon: 'users', accent: '#66a8ff', sort_order: 2 },
    { slug: 'library', title: 'Library', description: 'Your beatmap collection. Manage, import, curate.', icon: 'library', accent: '#b388ff', sort_order: 3 },
    { slug: 'settings', title: 'Settings', description: 'Audio, input, skin, and gameplay preferences.', icon: 'settings', accent: '#9aa0a6', sort_order: 4 },
  ];
  for (const it of items) {
    await query(
      `INSERT INTO menu_items (slug, title, description, icon, accent, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         accent = EXCLUDED.accent,
         sort_order = EXCLUDED.sort_order;`,
      [it.slug, it.title, it.description, it.icon, it.accent, it.sort_order]
    );
  }
}

async function migrateAndSeed() {
  await migrate();
  await seedMenu();
}

module.exports = { pool, query, migrateAndSeed };
