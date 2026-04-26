// Centralised MongoDB connection + GridFS bucket helpers.
//
// We lazily connect on first call so nothing happens at module-load time
// (the OSU API service can boot without Mongo if Mongo is briefly down).
// Two GridFS buckets:
//   * `osz_files`  → raw .osz uploads, served back to play.html for gameplay
//   * `covers`     → background image extracted from each .osz, served as
//                    the beatmap thumbnail in the UI
const { MongoClient, GridFSBucket } = require('mongodb');

let _client = null;
let _db = null;
let _oszBucket = null;
let _coverBucket = null;
let _connectingPromise = null;

async function getDb() {
  if (_db) return _db;
  if (_connectingPromise) return _connectingPromise;
  _connectingPromise = (async () => {
    const url = process.env.MONGO_URL || 'mongodb://localhost:27017';
    const dbName = process.env.DB_NAME || 'osuweb';
    const client = new MongoClient(url, { ignoreUndefined: true });
    await client.connect();
    _client = client;
    _db = client.db(dbName);
    // Indexes — idempotent.
    await _db.collection('users').createIndex({ id: 1 }, { unique: true });
    await _db.collection('imports').createIndex({ id: 1 }, { unique: true });
    await _db.collection('imports').createIndex({ owner_id: 1, created_at: -1 });
    return _db;
  })();
  try {
    return await _connectingPromise;
  } finally {
    _connectingPromise = null;
  }
}

async function getOszBucket() {
  if (_oszBucket) return _oszBucket;
  const db = await getDb();
  _oszBucket = new GridFSBucket(db, { bucketName: 'osz_files' });
  return _oszBucket;
}

async function getCoverBucket() {
  if (_coverBucket) return _coverBucket;
  const db = await getDb();
  _coverBucket = new GridFSBucket(db, { bucketName: 'covers' });
  return _coverBucket;
}

module.exports = { getDb, getOszBucket, getCoverBucket };
