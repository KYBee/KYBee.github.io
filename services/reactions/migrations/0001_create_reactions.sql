CREATE TABLE reactions (
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (target_id, emoji, visitor_hash)
);

CREATE INDEX reactions_target_emoji
  ON reactions (target_id, emoji);
