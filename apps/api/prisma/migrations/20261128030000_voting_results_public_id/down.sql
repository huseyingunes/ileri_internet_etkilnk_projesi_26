-- Rollback for 20261128030000_voting_results_public_id.
BEGIN;
ALTER TABLE voting_results DROP COLUMN IF EXISTS tied_ballot_ids;
ALTER TABLE voting_results DROP CONSTRAINT IF EXISTS voting_results_public_id_key;
ALTER TABLE voting_results DROP COLUMN IF EXISTS public_id;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128030000_voting_results_public_id';
COMMIT;
