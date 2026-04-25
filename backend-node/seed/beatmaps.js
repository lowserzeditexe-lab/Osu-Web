// Demo beatmap catalogue. Covers use picsum.photos with deterministic seeds so
// the dev experience is consistent without requiring external uploads.
function cover(seed) {
  return `https://picsum.photos/seed/osu-${seed}/600/600`;
}

const items = [
  { title: 'Blue Zenith', artist: 'xi', mapper: 'Asphyxia', bpm: 200, duration_sec: 257, difficulty: 6.48, genre: 'Electronic', plays_count: 18234102, favorites_count: 74210, age_hours: 12 },
  { title: 'FREEDOM DiVE', artist: 'xi', mapper: 'Nakagawa-Kanon', bpm: 222, duration_sec: 235, difficulty: 7.11, genre: 'Electronic', plays_count: 29100000, favorites_count: 103400, age_hours: 30 },
  { title: 'Through the Fire and Flames', artist: 'DragonForce', mapper: 'jesse1412', bpm: 200, duration_sec: 440, difficulty: 6.92, genre: 'Rock', plays_count: 15203000, favorites_count: 61200, age_hours: 48 },
  { title: 'Harumachi Clover', artist: 'Will Stetson', mapper: 'Sotarks', bpm: 175, duration_sec: 251, difficulty: 5.81, genre: 'Anime', plays_count: 9400000, favorites_count: 43010, age_hours: 72 },
  { title: 'Gurenge', artist: 'LiSA', mapper: 'pishifat', bpm: 135, duration_sec: 253, difficulty: 5.23, genre: 'Anime', plays_count: 12800000, favorites_count: 58500, age_hours: 96 },
  { title: 'Renai Circulation', artist: 'Kana Hanazawa', mapper: 'Nathan', bpm: 177, duration_sec: 246, difficulty: 4.95, genre: 'Anime', plays_count: 7310000, favorites_count: 36200, age_hours: 120 },
  { title: 'Night of Knights', artist: 'ChouCho', mapper: 'Lasse', bpm: 190, duration_sec: 220, difficulty: 6.04, genre: 'Video Game', plays_count: 5400000, favorites_count: 22100, age_hours: 144 },
  { title: 'Bad Apple!!', artist: 'nomico', mapper: 'Mafiamaster', bpm: 138, duration_sec: 219, difficulty: 3.98, genre: 'Electronic', plays_count: 11700000, favorites_count: 52000, age_hours: 168 },
  { title: 'Big Black', artist: 'The Quick Brown Fox', mapper: 'Blue Dragon', bpm: 360, duration_sec: 121, difficulty: 8.55, genre: 'Electronic', plays_count: 22000000, favorites_count: 94000, age_hours: 192 },
  { title: 'Souzou Forest', artist: 'Jin feat. IA', mapper: 'Frostmourne', bpm: 200, duration_sec: 234, difficulty: 5.72, genre: 'Anime', plays_count: 4800000, favorites_count: 19800, age_hours: 220 },
  { title: 'Airman', artist: 'TEAM Grimoire', mapper: 'qoot8123', bpm: 180, duration_sec: 194, difficulty: 6.35, genre: 'Electronic', plays_count: 6200000, favorites_count: 28500, age_hours: 260 },
  { title: 'Resurrection', artist: 'Yousei Teikoku', mapper: 'pishifat', bpm: 205, duration_sec: 255, difficulty: 6.12, genre: 'Rock', plays_count: 3900000, favorites_count: 15400, age_hours: 300 },
  { title: 'Starstruck', artist: 'Years & Years', mapper: 'Monstrata', bpm: 114, duration_sec: 171, difficulty: 4.21, genre: 'Pop', plays_count: 2100000, favorites_count: 9800, age_hours: 360 },
  { title: 'Platina', artist: 'KOKIA', mapper: 'ignorethis', bpm: 140, duration_sec: 268, difficulty: 3.45, genre: 'Anime', plays_count: 1800000, favorites_count: 7200, age_hours: 420 },
  { title: 'Necrofantasia', artist: 'ZUN', mapper: 'thelewa', bpm: 165, duration_sec: 321, difficulty: 7.04, genre: 'Video Game', plays_count: 8600000, favorites_count: 39400, age_hours: 500 },
  { title: 'Image Material', artist: 'sakuzyo', mapper: 'handsome', bpm: 186, duration_sec: 204, difficulty: 6.67, genre: 'Electronic', plays_count: 5200000, favorites_count: 21800, age_hours: 600 },
  { title: 'Tower of Heaven', artist: 'Flashygoodness', mapper: 'Deif', bpm: 140, duration_sec: 122, difficulty: 4.67, genre: 'Video Game', plays_count: 1500000, favorites_count: 5700, age_hours: 720 },
  { title: 'Sidetracked Day', artist: 'VINXIS', mapper: 'Hollow Delta', bpm: 180, duration_sec: 266, difficulty: 7.25, genre: 'Electronic', plays_count: 9100000, favorites_count: 44800, age_hours: 820 },
  { title: 'The Big Black', artist: 'Jishin', mapper: 'Loctav', bpm: 188, duration_sec: 168, difficulty: 8.22, genre: 'Electronic', plays_count: 3100000, favorites_count: 13900, age_hours: 960 },
  { title: 'Mirror', artist: 'Hige Driver', mapper: 'Lesjuh', bpm: 220, duration_sec: 198, difficulty: 6.88, genre: 'Electronic', plays_count: 2400000, favorites_count: 11100, age_hours: 1100 },
  { title: 'Hunter', artist: 'Pendulum', mapper: 'Doomsday', bpm: 175, duration_sec: 290, difficulty: 5.45, genre: 'Electronic', plays_count: 4100000, favorites_count: 18600, age_hours: 1300 },
  { title: 'Colorful', artist: 'Kanon Wakeshima', mapper: 'happy30', bpm: 150, duration_sec: 234, difficulty: 4.08, genre: 'Anime', plays_count: 2700000, favorites_count: 11800, age_hours: 1500 },
  { title: 'Ascension to Heaven', artist: 'Yuki Kajiura', mapper: 'Nara', bpm: 128, duration_sec: 312, difficulty: 5.92, genre: 'Classical', plays_count: 1900000, favorites_count: 8300, age_hours: 1700 },
  { title: 'Exit This Earth’s Atomosphere', artist: 'Camellia', mapper: 'Kroytz', bpm: 185, duration_sec: 206, difficulty: 7.62, genre: 'Electronic', plays_count: 7800000, favorites_count: 34500, age_hours: 1900 },
];

module.exports = items.map((b, i) => ({
  ...b,
  cover_url: cover(i + 1),
}));
