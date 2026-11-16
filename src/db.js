// D1 схем + туслах функцүүд
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  role TEXT DEFAULT 'member',
  member_id INTEGER,
  password TEXT DEFAULT '',
  salt TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires INTEGER NOT NULL,
  via TEXT DEFAULT 'auto'
);
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sex TEXT DEFAULT '?',
  birth_year TEXT DEFAULT '',
  birth_date TEXT DEFAULT '',
  birth_place TEXT DEFAULT '',
  clan TEXT DEFAULT '',
  alive INTEGER DEFAULT 1,
  phone TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  honors TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  death_date TEXT DEFAULT '',
  emoji TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  father_id INTEGER,
  mother_id INTEGER,
  child_id INTEGER NOT NULL,
  rel_type TEXT DEFAULT 'Төрсөн',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS unions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id INTEGER NOT NULL,
  b_id INTEGER NOT NULL,
  status TEXT DEFAULT 'гэрлэсэн',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  detail TEXT,
  at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS design (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  visibility TEXT DEFAULT 'all',
  members TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS album_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  url TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS link_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  handled_by INTEGER,
  handled_at TEXT
);
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS field_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, field_key)
);
CREATE TABLE IF NOT EXISTS member_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  url TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS member_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  event_date TEXT DEFAULT '',
  title TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS layout_locks (
  viewer_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS score_ranks (
  user_id INTEGER PRIMARY KEY,
  rank INTEGER,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS default_avatars (
  slot TEXT PRIMARY KEY,
  url TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS photo_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL DEFAULT 0,   -- 0 = нүүр зураг, >0 = member_photos.id
  member_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

let ready = false;

// Хуучин локал DB-д шинэ багана нэмэх (байвал алгасна)
export const MIGRATIONS = [
  "ALTER TABLE users ADD COLUMN password TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN salt TEXT DEFAULT ''",
  "ALTER TABLE otps ADD COLUMN via TEXT DEFAULT 'auto'",
  "ALTER TABLE members ADD COLUMN death_date TEXT DEFAULT ''",
  "ALTER TABLE members ADD COLUMN emoji TEXT DEFAULT ''",
  "ALTER TABLE members ADD COLUMN honors TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN level_seen INTEGER DEFAULT NULL",
  "ALTER TABLE member_events ADD COLUMN photo TEXT DEFAULT ''",
  "DELETE FROM default_avatars WHERE slot='n_any'"
];

export async function initDb(env) {
  if (ready) return;
  // D1 exec олон мөртэй statement-ийг зөв хуваадаггүй тул statement тус бүрийг
  // тусад нь биелүүлнэ (схемд ';' орсон утга байхгүй)
  const stmts = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
  for (const s of stmts) await env.DB.prepare(s).run();
  for (const m of MIGRATIONS) {
    try { await env.DB.prepare(m).run(); } catch (e) { /* багана аль хэдийн байна */ }
  }
  ready = true;
}

export async function all(env, sql, ...binds) {
  let st = env.DB.prepare(sql);
  if (binds.length) st = st.bind(...binds);
  const r = await st.all();
  return r.results || [];
}

export async function get(env, sql, ...binds) {
  let st = env.DB.prepare(sql);
  if (binds.length) st = st.bind(...binds);
  return (await st.first()) || null;
}

export async function run(env, sql, ...binds) {
  let st = env.DB.prepare(sql);
  if (binds.length) st = st.bind(...binds);
  return st.run();
}

export async function insert(env, sql, ...binds) {
  const r = await run(env, sql, ...binds);
  return (r && r.meta && r.meta.last_row_id) || 0;
}
