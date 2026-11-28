-- Rollback for 20261128060000_notification_dedupe.
BEGIN;
DROP INDEX IF EXISTS notifications_dedupe_idx;
ALTER TABLE notifications DROP COLUMN IF EXISTS dedupe_key;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128060000_notification_dedupe';
COMMIT;
