-- ================================================================
--  Supabase Schema — Hepatitis Screening System
--  วิธีใช้: วางใน Supabase SQL Editor แล้วกด Run
-- ================================================================

-- ── villages (กลุ่มเป้าหมาย) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS villages (
  id        BIGSERIAL PRIMARY KEY,
  moo       TEXT        NOT NULL,  -- ม.1, ม.2 ...
  no        TEXT        NOT NULL DEFAULT '',
  addr      TEXT        NOT NULL DEFAULT '',
  prefix    TEXT        NOT NULL DEFAULT '',
  fname     TEXT        NOT NULL DEFAULT '',
  lname     TEXT        NOT NULL DEFAULT '',
  gender    TEXT        NOT NULL DEFAULT '',
  age       TEXT        NOT NULL DEFAULT '',
  agem      TEXT        NOT NULL DEFAULT '',
  dob       TEXT        NOT NULL DEFAULT '',
  pid       TEXT        NOT NULL,
  "right"   TEXT        NOT NULL DEFAULT '',
  regis     TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- unique constraint: pid + moo (คนเดียวกันอยู่ได้หลายหมู่ถ้าข้อมูลซ้ำ แต่ในหมู่เดียวกันห้ามซ้ำ)
CREATE UNIQUE INDEX IF NOT EXISTS villages_pid_moo_idx ON villages (pid, moo);

-- index สำหรับ query เร็ว
CREATE INDEX IF NOT EXISTS villages_moo_idx ON villages (moo);
CREATE INDEX IF NOT EXISTS villages_pid_idx ON villages (pid);

-- ── screenings (ข้อมูลคัดกรอง) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS screenings (
  id          BIGSERIAL PRIMARY KEY,
  pid         TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('HBsAg', 'AntiHCV')),
  year        TEXT        NOT NULL,  -- '2567', '2568', '2569'
  date        TEXT        NOT NULL,  -- d/M/YYYY
  unit        TEXT        NOT NULL DEFAULT '',
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- ป้องกัน duplicate pid+date+type
CREATE UNIQUE INDEX IF NOT EXISTS screenings_pid_date_type_idx ON screenings (pid, date, type);

-- index สำหรับ lookup เร็ว
CREATE INDEX IF NOT EXISTS screenings_pid_idx  ON screenings (pid);
CREATE INDEX IF NOT EXISTS screenings_type_year_idx ON screenings (type, year);

-- ── app_settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- ================================================================
--  Row Level Security (RLS) — Public read/write (no auth)
-- ================================================================
ALTER TABLE villages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public app — no login required)
CREATE POLICY "public_all_villages"     ON villages     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all_screenings"   ON screenings   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all_app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);
