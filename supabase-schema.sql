-- ================================================================
--  TRACER LIVE — Supabase SQL Schema + Seed
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  https://supabase.com/dashboard/project/wdankznjxsjlpcrcymzx/sql/new
-- ================================================================

-- ── Create tables ───────────────────────────────────────────────

-- USERS (passengers + drivers)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  role          TEXT DEFAULT 'passenger' CHECK (role IN ('passenger','driver','admin')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- BUSES
CREATE TABLE IF NOT EXISTS buses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id         TEXT UNIQUE NOT NULL,
  plate          TEXT NOT NULL,
  type           TEXT DEFAULT 'local' CHECK (type IN ('local','intercity')),
  operator       TEXT DEFAULT '',
  capacity       INT DEFAULT 50,
  status         TEXT DEFAULT 'inactive' CHECK (status IN ('active','inactive')),
  driver_id      UUID,
  current_route  TEXT DEFAULT '',
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  speed          DOUBLE PRECISION DEFAULT 0,
  heading        DOUBLE PRECISION DEFAULT 0,
  accuracy       DOUBLE PRECISION,
  last_seen      TIMESTAMPTZ,
  trip_start     TIMESTAMPTZ,
  route_locked   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ROUTE STOPS
CREATE TABLE IF NOT EXISTS route_stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id      TEXT NOT NULL,
  stop_order  INT NOT NULL,
  name        TEXT NOT NULL,
  stop_code   TEXT NOT NULL,
  arr_time    TEXT,
  dep_time    TEXT,
  dist_km     DOUBLE PRECISION DEFAULT 0,
  fare        INT DEFAULT 0,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  UNIQUE(bus_id, stop_order)
);

-- SEATS
CREATE TABLE IF NOT EXISTS seats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id     TEXT NOT NULL,
  seat_code  TEXT NOT NULL,
  status     TEXT DEFAULT 'available' CHECK (status IN ('available','booked','reserved')),
  booked_by  UUID,
  trip_date  DATE
);

-- GPS LOG
CREATE TABLE IF NOT EXISTS gps_log (
  id         BIGSERIAL PRIMARY KEY,
  bus_id     TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  speed      DOUBLE PRECISION DEFAULT 0,
  heading    DOUBLE PRECISION DEFAULT 0,
  accuracy   DOUBLE PRECISION,
  source     TEXT DEFAULT 'driver',
  timestamp  BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID,
  bus_id     TEXT NOT NULL,
  from_stop  TEXT,
  to_stop    TEXT,
  fare       INT NOT NULL,
  method     TEXT DEFAULT 'upi',
  pnr        TEXT UNIQUE,
  status     TEXT DEFAULT 'success',
  paid_at    TIMESTAMPTZ DEFAULT NOW()
);

-- EMERGENCY ALERTS
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id     TEXT NOT NULL,
  type       TEXT,
  label      TEXT,
  note       TEXT,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  driver_id  UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Disable RLS for server-side access ──────────────────────────
-- (The Node.js server uses service_role key which bypasses RLS anyway,
--  but disabling makes development easier. Re-enable + add policies in production.)
ALTER TABLE users            DISABLE ROW LEVEL SECURITY;
ALTER TABLE buses            DISABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops      DISABLE ROW LEVEL SECURITY;
ALTER TABLE seats            DISABLE ROW LEVEL SECURITY;
ALTER TABLE gps_log          DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments         DISABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts DISABLE ROW LEVEL SECURITY;

-- ── Seed buses ───────────────────────────────────────────────────
INSERT INTO buses (bus_id, plate, type, operator, capacity) VALUES
  ('DL-BUS-101',    'DL 1PA 4521',   'local',     'DTC',    50),
  ('DL-BUS-202',    'DL 4CB 9900',   'local',     'DTC',    50),
  ('DL-BUS-303',    'DL 7GH 1234',   'local',     'DTC',    45),
  ('UP-32-AT-4521', 'UP 32 AT 4521', 'intercity', 'UPSRTC', 54),
  ('HR-55-PA-2200', 'HR 55 PA 2200', 'intercity', 'HRTC',   54),
  ('RJ-09-CA-8800', 'RJ 09 CA 8800', 'intercity', 'RSRTC',  54)
ON CONFLICT (bus_id) DO NOTHING;

-- ── Seed route stops for DL-BUS-101 ─────────────────────────────
INSERT INTO route_stops (bus_id, stop_order, name, stop_code, arr_time, dep_time, dist_km, lat, lng) VALUES
  ('DL-BUS-101', 1, 'ISBT Kashmiri Gate', 'ISBT-KG', '06:00', '06:00',  0.0, 28.6672, 77.2246),
  ('DL-BUS-101', 2, 'Sadar Bazar',        'SDB',     '06:10', '06:11',  3.2, 28.6584, 77.2060),
  ('DL-BUS-101', 3, 'Karol Bagh',         'KBG',     '06:22', '06:23',  7.8, 28.6514, 77.1903),
  ('DL-BUS-101', 4, 'Rajouri Garden',     'RAJ',     '06:35', '06:36', 14.1, 28.6474, 77.1231),
  ('DL-BUS-101', 5, 'Janakpuri',          'JNK',     '06:48', '06:49', 19.5, 28.6290, 77.0832),
  ('DL-BUS-101', 6, 'Uttam Nagar',        'UTN',     '07:02', '07:03', 24.8, 28.6155, 77.0589),
  ('DL-BUS-101', 7, 'Saket',              'SKT',     '07:28', '07:28', 38.0, 28.5245, 77.2066)
ON CONFLICT (bus_id, stop_order) DO NOTHING;

-- ── Seed route stops for UP-32-AT-4521 ──────────────────────────
INSERT INTO route_stops (bus_id, stop_order, name, stop_code, arr_time, dep_time, dist_km, lat, lng) VALUES
  ('UP-32-AT-4521', 1, 'ISBT Delhi',         'ISBT-D',  '06:00', '06:00',   0, 28.6580, 77.2300),
  ('UP-32-AT-4521', 2, 'NH-48 Toll Plaza',   'NH48-T',  '06:40', '06:42',  28, 28.4900, 77.0700),
  ('UP-32-AT-4521', 3, 'Manesar',            'MNS',     '07:10', '07:12',  52, 28.3590, 76.9380),
  ('UP-32-AT-4521', 4, 'Dharuhera',          'DHR',     '07:45', '07:47',  79, 28.2110, 76.8080),
  ('UP-32-AT-4521', 5, 'Rewari',             'RWR',     '08:10', '08:12',  95, 28.1980, 76.6200),
  ('UP-32-AT-4521', 6, 'Alwar',              'AWR',     '09:05', '09:08', 148, 27.5620, 76.6350),
  ('UP-32-AT-4521', 7, 'Sindhi Camp Jaipur', 'JP-SC',   '10:45', '10:45', 268, 26.9124, 75.7873)
ON CONFLICT (bus_id, stop_order) DO NOTHING;

-- ── Seed route stops for HR-55-PA-2200 ──────────────────────────
INSERT INTO route_stops (bus_id, stop_order, name, stop_code, arr_time, dep_time, dist_km, lat, lng) VALUES
  ('HR-55-PA-2200', 1, 'ISBT Delhi',          'ISBT-D',   '07:00', '07:00',   0, 28.6580, 77.2300),
  ('HR-55-PA-2200', 2, 'Mukarba Chowk',       'MKC',      '07:20', '07:21',  14, 28.7390, 77.1450),
  ('HR-55-PA-2200', 3, 'Panipat',             'PNP',      '08:30', '08:33',  88, 29.3909, 76.9635),
  ('HR-55-PA-2200', 4, 'Karnal',              'KNL',      '09:00', '09:02', 120, 29.6857, 76.9905),
  ('HR-55-PA-2200', 5, 'Ambala',              'ABL',      '09:50', '09:53', 197, 30.3782, 76.7767),
  ('HR-55-PA-2200', 6, 'ISBT Sector 43 CHD',  'CHD-43',   '10:50', '10:50', 260, 30.7046, 76.7179)
ON CONFLICT (bus_id, stop_order) DO NOTHING;

-- ── Done! ────────────────────────────────────────────────────────
SELECT 'Schema + seed complete!' AS status;
SELECT bus_id, type, operator, capacity FROM buses ORDER BY bus_id;
