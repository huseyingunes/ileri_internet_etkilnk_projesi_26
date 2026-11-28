-- Idempotent notifications: a retried job does not notify a user twice about the same thing.
ALTER TABLE notifications ADD COLUMN dedupe_key text CHECK (length(dedupe_key) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
