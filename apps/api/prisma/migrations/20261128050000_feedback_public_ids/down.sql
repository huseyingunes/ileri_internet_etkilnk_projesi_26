-- Rollback for 20261128050000_feedback_public_ids.
BEGIN;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_public_id_key;
ALTER TABLE ratings DROP COLUMN IF EXISTS public_id;
ALTER TABLE reason_prompts DROP CONSTRAINT IF EXISTS reason_prompts_public_id_key;
ALTER TABLE reason_prompts DROP COLUMN IF EXISTS public_id;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128050000_feedback_public_ids';
COMMIT;
