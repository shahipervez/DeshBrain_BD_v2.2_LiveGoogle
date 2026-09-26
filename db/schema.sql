CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS road_reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_hash TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('jam','accident','flood','roadblock','police','rickshaw','other')),
  severity SMALLINT NOT NULL CHECK(severity BETWEEN 1 AND 5),
  description TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
  confirmations INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS road_reports_live_idx ON road_reports (expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS road_reports_geo_idx ON road_reports (lat, lng);

CREATE TABLE IF NOT EXISTS fare_reports (
  id BIGSERIAL PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('cng','rickshaw')),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  amount_bdt INTEGER NOT NULL CHECK(amount_bdt > 0),
  traffic_level SMALLINT NOT NULL DEFAULT 2 CHECK(traffic_level BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fare_route_idx ON fare_reports (lower(origin), lower(destination), created_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  unit TEXT NOT NULL,
  category TEXT,
  image_url TEXT
);
CREATE TABLE IF NOT EXISTS price_observations (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  shop_area TEXT NOT NULL,
  price_bdt NUMERIC(10,2) NOT NULL CHECK(price_bdt > 0),
  source TEXT NOT NULL DEFAULT 'community',
  receipt_hash TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS price_product_time_idx ON price_observations (product_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS price_area_idx ON price_observations (lower(shop_area), observed_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_conversations_user_idx ON chat_conversations(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages(conversation_id,id);
