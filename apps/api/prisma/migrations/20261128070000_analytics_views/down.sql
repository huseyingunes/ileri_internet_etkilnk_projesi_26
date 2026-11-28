-- Rollback for 20261128070000_analytics_views.
BEGIN;
DROP MATERIALIZED VIEW IF EXISTS analytics_non_attendance_reasons;
DROP MATERIALIZED VIEW IF EXISTS analytics_winner_voters;
DROP MATERIALIZED VIEW IF EXISTS analytics_ballot_votes;
DROP MATERIALIZED VIEW IF EXISTS analytics_event_facts;
DELETE FROM _prisma_migrations WHERE migration_name = '20261128070000_analytics_views';
COMMIT;
