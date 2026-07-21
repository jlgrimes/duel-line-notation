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
  manifest JSONB NOT NULL,
  line TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deck_slug, line_slug)
);

CREATE INDEX IF NOT EXISTS combos_deck_name_idx ON combos (deck_name);
CREATE INDEX IF NOT EXISTS combos_title_idx ON combos (title);
