CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  deck_slug TEXT NOT NULL,
  line_slug TEXT NOT NULL,
  deck_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  summon TEXT NOT NULL,
  accent TEXT NOT NULL,
  format TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  representative_card_name TEXT NOT NULL,
  hand_size INTEGER NOT NULL,
  step_count INTEGER NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'dln' CHECK (content_type IN ('dln', 'guide')),
  difficulty TEXT,
  source_license TEXT,
  manifest JSONB NOT NULL,
  line TEXT,
  guide JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deck_slug, line_slug)
);

CREATE INDEX IF NOT EXISTS combos_deck_name_idx ON combos (deck_name);
CREATE INDEX IF NOT EXISTS combos_title_idx ON combos (title);

ALTER TABLE combos ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'dln';
ALTER TABLE combos ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE combos ADD COLUMN IF NOT EXISTS source_license TEXT;
ALTER TABLE combos ADD COLUMN IF NOT EXISTS guide JSONB;
ALTER TABLE combos ALTER COLUMN line DROP NOT NULL;
