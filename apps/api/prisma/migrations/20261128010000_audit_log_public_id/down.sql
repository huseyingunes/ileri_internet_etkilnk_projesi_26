-- Rollback for 20261128010000_audit_log_public_id.
BEGIN;
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_public_id_key;
ALTER TABLE audit_log DROP COLUMN IF EXISTS public_id;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128010000_audit_log_public_id';
COMMIT;
