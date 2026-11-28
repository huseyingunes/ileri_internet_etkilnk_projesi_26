-- Rollback for 20261128020000_media_alt_text.
BEGIN;
ALTER TABLE media_objects DROP COLUMN IF EXISTS alt;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128020000_media_alt_text';
COMMIT;
