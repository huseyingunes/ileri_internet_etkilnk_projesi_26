-- Rollback for 20261128000000_initial_schema.
-- Run only after a verified backup (docs/isletim-kilavuzu.md, "Göçler").
-- Drops every object created by migration.sql, in reverse dependency order,
-- and removes the migration record so `prisma migrate deploy` can re-apply it.

BEGIN;

DROP TABLE IF EXISTS
  data_requests,
  consents,
  notification_preferences,
  webhook_events,
  notification_deliveries,
  notifications,
  ratings,
  reason_answers,
  reason_prompts,
  leaderboard_snapshots,
  score_ledger,
  score_rules,
  seasons,
  excuses,
  attendances,
  attendance_scans,
  applications,
  voting_results,
  votes,
  daily_ballots,
  user_interests,
  event_tags,
  tags,
  event_photos,
  events,
  media_objects,
  community_advisors,
  community_members,
  communities,
  app_settings,
  audit_log,
  users;

DROP FUNCTION IF EXISTS daily_ballots_limit();
DROP FUNCTION IF EXISTS forbid_mutation();
DROP FUNCTION IF EXISTS set_updated_at();

DELETE FROM _prisma_migrations WHERE migration_name = '20261128000000_initial_schema';

COMMIT;
