-- Rollback for 20261128040000_scoring_public_ids.
BEGIN;
ALTER TABLE score_ledger DROP CONSTRAINT IF EXISTS score_ledger_public_id_key;
ALTER TABLE score_ledger DROP COLUMN IF EXISTS public_id;
ALTER TABLE excuses DROP CONSTRAINT IF EXISTS excuses_public_id_key;
ALTER TABLE excuses DROP COLUMN IF EXISTS public_id;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128040000_scoring_public_ids';
COMMIT;
