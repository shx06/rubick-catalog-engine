import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });

const migrationSQL = `
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    brand VARCHAR(120) NOT NULL,
    category JSONB NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
    enrichment_status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON products USING GIN (title gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS idx_products_category_path ON products USING GIN (category jsonb_path_ops);

  CREATE TABLE IF NOT EXISTS price_history (
    id BIGSERIAL,
    product_id VARCHAR(64) NOT NULL,
    platform VARCHAR(64) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    availability VARCHAR(32) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
  ) PARTITION BY RANGE (recorded_at);

  CREATE TABLE IF NOT EXISTS price_history_y2026m06 PARTITION OF price_history
    FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
`;

async function run() {
  await client.connect();
  await client.query(migrationSQL);
  console.log("Migration executed successfully with pg_trgm indices and partitions setup.");
  await client.end();
}
run();