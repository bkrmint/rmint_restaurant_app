-- Neon analytics schema — run in Neon SQL Editor after provisioning.
-- See docs/architecture/06-DATA-LAYER.md Section 4.

-- analytics_sessions: one row per published meal session
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id              TEXT PRIMARY KEY,
  restaurant_id   TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  chain_id        TEXT NOT NULL,
  chain_name      TEXT NOT NULL,
  date            DATE NOT NULL,
  meal_type       TEXT NOT NULL,
  expected_headcount INTEGER NOT NULL,
  actual_headcount   INTEGER,
  dish_count      INTEGER NOT NULL,
  total_revenue   NUMERIC(12,2) NOT NULL,
  total_cost      NUMERIC(12,2) NOT NULL,
  labor_cost      NUMERIC(12,2) NOT NULL,
  ingredient_cost NUMERIC(12,2) NOT NULL,
  overhead_cost   NUMERIC(12,2) NOT NULL,
  profit          NUMERIC(12,2) NOT NULL,
  prime_cost_pct  NUMERIC(5,2) NOT NULL,
  food_cost_pct   NUMERIC(5,2) NOT NULL,
  avg_revenue_per_cover NUMERIC(8,2) NOT NULL,
  published_at    TIMESTAMPTZ NOT NULL,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_restaurant_date ON analytics_sessions (restaurant_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_chain_date ON analytics_sessions (chain_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON analytics_sessions (date);
CREATE INDEX IF NOT EXISTS idx_sessions_meal ON analytics_sessions (meal_type);

-- analytics_dish_performance: one row per dish per session
CREATE TABLE IF NOT EXISTS analytics_dish_performance (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES analytics_sessions(id),
  restaurant_id   TEXT NOT NULL,
  dish_id         TEXT NOT NULL,
  dish_name       TEXT NOT NULL,
  dish_category   TEXT NOT NULL,
  cuisine_type    TEXT NOT NULL,
  date            DATE NOT NULL,
  meal_type       TEXT NOT NULL,
  price           NUMERIC(8,2) NOT NULL,
  cost_per_serving NUMERIC(8,2) NOT NULL,
  quantity        INTEGER NOT NULL,
  revenue         NUMERIC(12,2) NOT NULL,
  cost            NUMERIC(12,2) NOT NULL,
  margin_pct      NUMERIC(5,2) NOT NULL,
  was_ai_suggested BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dish_perf_restaurant ON analytics_dish_performance (restaurant_id, date);
CREATE INDEX IF NOT EXISTS idx_dish_perf_dish ON analytics_dish_performance (dish_id, date);
CREATE INDEX IF NOT EXISTS idx_dish_perf_category ON analytics_dish_performance (dish_category, date);
CREATE INDEX IF NOT EXISTS idx_dish_perf_cuisine ON analytics_dish_performance (cuisine_type, date);
CREATE INDEX IF NOT EXISTS idx_dish_perf_session ON analytics_dish_performance (session_id);

-- analytics_ingredient_costs: time-series of ingredient price changes
CREATE TABLE IF NOT EXISTS analytics_ingredient_costs (
  id              SERIAL PRIMARY KEY,
  restaurant_id   TEXT NOT NULL,
  ingredient_id   TEXT NOT NULL,
  ingredient_name TEXT NOT NULL,
  category        TEXT NOT NULL,
  unit            TEXT NOT NULL,
  price_per_unit  NUMERIC(10,4) NOT NULL,
  previous_price  NUMERIC(10,4),
  price_change_pct NUMERIC(6,2),
  supplier        TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_costs_restaurant ON analytics_ingredient_costs (restaurant_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_ingredient_costs_ingredient ON analytics_ingredient_costs (ingredient_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_ingredient_costs_category ON analytics_ingredient_costs (category, recorded_at);

-- analytics_daily_summary: one row per restaurant per day
CREATE TABLE IF NOT EXISTS analytics_daily_summary (
  id              SERIAL PRIMARY KEY,
  restaurant_id   TEXT NOT NULL,
  chain_id        TEXT NOT NULL,
  date            DATE NOT NULL,
  total_sessions  INTEGER NOT NULL,
  total_revenue   NUMERIC(12,2) NOT NULL,
  total_cost      NUMERIC(12,2) NOT NULL,
  total_profit    NUMERIC(12,2) NOT NULL,
  avg_prime_cost_pct NUMERIC(5,2) NOT NULL,
  total_covers    INTEGER NOT NULL,
  avg_revenue_per_cover NUMERIC(8,2) NOT NULL,
  top_dish_id     TEXT,
  top_dish_name   TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_restaurant ON analytics_daily_summary (restaurant_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_summary_chain ON analytics_daily_summary (chain_id, date);
