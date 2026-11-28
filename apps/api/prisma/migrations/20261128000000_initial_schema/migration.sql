-- Phase 1: complete initial schema.
-- SQL is the source of truth; prisma/schema.prisma is generated from the
-- migrated database with `prisma db pull` and checked for drift in tests.
--
-- Conventions
--   * Primary keys: bigint GENERATED ALWAYS AS IDENTITY.
--   * Externally visible ids: public_id uuid DEFAULT uuidv7() (PostgreSQL 18).
--   * Time: timestamptz. Enumerations: text + CHECK.
--   * Every required column is NOT NULL; every foreign key column is indexed.
--   * Raw coordinates of students are never stored (KVKK).

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- ---------------------------------------------------------------------------
-- Identity and authorization
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id      uuid        NOT NULL DEFAULT uuidv7() UNIQUE,
  oidc_subject   text        NOT NULL UNIQUE CHECK (length(oidc_subject) BETWEEN 1 AND 255),
  email          text        NOT NULL UNIQUE
                   CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND length(email) <= 254),
  display_name   text        NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  role           text        NOT NULL CHECK (role IN ('student', 'advisor', 'admin')),
  student_number text        UNIQUE CHECK (student_number ~ '^[0-9A-Za-z]{4,20}$'),
  phone          text        CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  is_active      boolean     NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  anonymized_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Only students carry a student number.
  CONSTRAINT users_student_number_role CHECK (student_number IS NULL OR role = 'student')
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Administrative actions (rule changes, tie decisions, role assignments, ...).
CREATE TABLE audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id bigint      REFERENCES users (id),
  action        text        NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]{2,79}$'),
  entity_type   text        NOT NULL CHECK (length(entity_type) BETWEEN 1 AND 80),
  entity_id     bigint,
  details       jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  request_id    text        CHECK (length(request_id) <= 64),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_actor_user_id_idx ON audit_log (actor_user_id);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Validated, admin-editable settings (minimum vote threshold, defaults, ...).
-- Values are validated by Zod schemas in the application before writing.
CREATE TABLE app_settings (
  key                text        PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  value              jsonb       NOT NULL,
  updated_by_user_id bigint      REFERENCES users (id),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_settings_updated_by_user_id_idx ON app_settings (updated_by_user_id);
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Student communities
-- ---------------------------------------------------------------------------

CREATE TABLE communities (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id   uuid        NOT NULL DEFAULT uuidv7() UNIQUE,
  name        text        NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 120),
  description text        NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER communities_updated_at BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE community_members (
  community_id bigint      NOT NULL REFERENCES communities (id),
  user_id      bigint      NOT NULL REFERENCES users (id),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user_id_idx ON community_members (user_id);

CREATE TABLE community_advisors (
  community_id    bigint      NOT NULL REFERENCES communities (id),
  advisor_user_id bigint      NOT NULL REFERENCES users (id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, advisor_user_id)
);
CREATE INDEX community_advisors_advisor_user_id_idx ON community_advisors (advisor_user_id);

-- ---------------------------------------------------------------------------
-- Media (cover images, event photos, data exports)
-- ---------------------------------------------------------------------------

CREATE TABLE media_objects (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id           uuid        NOT NULL DEFAULT uuidv7() UNIQUE,
  storage_key         text        NOT NULL UNIQUE CHECK (length(storage_key) BETWEEN 1 AND 512),
  content_type        text        NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  byte_size           bigint      NOT NULL CHECK (byte_size > 0),
  width               integer     CHECK (width > 0),
  height              integer     CHECK (height > 0),
  status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  -- Generated derivatives: [{ "format": "avif", "width": 640, "height": 360, "key": "..." }, ...]
  variants            jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variants) = 'array'),
  uploaded_by_user_id bigint      NOT NULL REFERENCES users (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_objects_ready_has_dimensions
    CHECK (status <> 'ready' OR (width IS NOT NULL AND height IS NOT NULL))
);
CREATE INDEX media_objects_uploaded_by_user_id_idx ON media_objects (uploaded_by_user_id);
CREATE TRIGGER media_objects_updated_at BEFORE UPDATE ON media_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

CREATE TABLE events (
  id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id                  uuid             NOT NULL DEFAULT uuidv7() UNIQUE,
  title                      text             NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  description                text             NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  category                   text             NOT NULL CHECK (category IN ('science', 'culture', 'sports')),
  status                     text             NOT NULL DEFAULT 'pending_approval'
                               CHECK (status IN ('pending_approval', 'rejected', 'pool', 'scheduled', 'completed', 'cancelled')),
  -- Organizer is either a person or a community, never both.
  organizer_user_id          bigint           REFERENCES users (id),
  organizer_community_id     bigint           REFERENCES communities (id),
  created_by_user_id         bigint           NOT NULL REFERENCES users (id),
  advisor_user_id            bigint           REFERENCES users (id),
  -- Events may span several days.
  starts_at                  timestamptz      NOT NULL,
  ends_at                    timestamptz      NOT NULL,
  location_name              text             NOT NULL CHECK (length(location_name) BETWEEN 1 AND 200),
  latitude                   double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude                  double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  attendance_radius_m        integer          NOT NULL CHECK (attendance_radius_m BETWEEN 1 AND 5000),
  qr_refresh_seconds         integer          NOT NULL CHECK (qr_refresh_seconds BETWEEN 20 AND 30),
  capacity                   integer          NOT NULL CHECK (capacity > 0),
  cover_media_id             bigint           REFERENCES media_objects (id),
  participation_requirements text             NOT NULL DEFAULT '' CHECK (length(participation_requirements) <= 2000),
  approved_by_user_id        bigint           REFERENCES users (id),
  approved_at                timestamptz,
  rejection_reason           text             CHECK (length(rejection_reason) BETWEEN 1 AND 2000),
  cancelled_at               timestamptz,
  cancellation_reason        text             CHECK (length(cancellation_reason) BETWEEN 1 AND 2000),
  created_at                 timestamptz      NOT NULL DEFAULT now(),
  updated_at                 timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT events_single_organizer CHECK (num_nonnulls(organizer_user_id, organizer_community_id) = 1),
  CONSTRAINT events_time_order CHECK (ends_at > starts_at),
  CONSTRAINT events_cancelled_consistent CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT events_rejected_has_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);
CREATE INDEX events_organizer_user_id_idx ON events (organizer_user_id);
CREATE INDEX events_organizer_community_id_idx ON events (organizer_community_id);
CREATE INDEX events_created_by_user_id_idx ON events (created_by_user_id);
CREATE INDEX events_advisor_user_id_idx ON events (advisor_user_id);
CREATE INDEX events_cover_media_id_idx ON events (cover_media_id);
CREATE INDEX events_approved_by_user_id_idx ON events (approved_by_user_id);
CREATE INDEX events_status_category_idx ON events (status, category);
CREATE INDEX events_starts_at_idx ON events (starts_at);
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE event_photos (
  event_id   bigint  NOT NULL REFERENCES events (id),
  media_id   bigint  NOT NULL REFERENCES media_objects (id),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (event_id, media_id)
);
CREATE INDEX event_photos_media_id_idx ON event_photos (media_id);

-- Keywords of events and interests of students share one tag vocabulary so
-- interest matching is a simple SQL intersection (Phase 10).
CREATE TABLE tags (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (name = lower(name) AND length(name) BETWEEN 1 AND 50)
);

CREATE TABLE event_tags (
  event_id bigint NOT NULL REFERENCES events (id),
  tag_id   bigint NOT NULL REFERENCES tags (id),
  PRIMARY KEY (event_id, tag_id)
);
CREATE INDEX event_tags_tag_id_idx ON event_tags (tag_id);

CREATE TABLE user_interests (
  user_id    bigint      NOT NULL REFERENCES users (id),
  tag_id     bigint      NOT NULL REFERENCES tags (id),
  -- 'selected' by the student, or 'inferred' from votes/attendance/ratings.
  source     text        NOT NULL CHECK (source IN ('selected', 'inferred')),
  weight     integer     NOT NULL DEFAULT 1 CHECK (weight > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_id)
);
CREATE INDEX user_interests_tag_id_idx ON user_interests (tag_id);
CREATE TRIGGER user_interests_updated_at BEFORE UPDATE ON user_interests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily selection and voting
-- ---------------------------------------------------------------------------

CREATE TABLE daily_ballots (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  voting_date         date        NOT NULL,
  category            text        NOT NULL CHECK (category IN ('science', 'culture', 'sports')),
  event_id            bigint      NOT NULL REFERENCES events (id),
  selected_by_user_id bigint      NOT NULL REFERENCES users (id),
  -- Filled when voting closes; kept for the archive page.
  final_vote_count    integer     CHECK (final_vote_count >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_ballots_unique UNIQUE (voting_date, category, event_id),
  CONSTRAINT daily_ballots_event_once_per_day UNIQUE (voting_date, event_id),
  -- Target of the composite foreign key from votes.
  CONSTRAINT daily_ballots_id_date_category UNIQUE (id, voting_date, category)
);
CREATE INDEX daily_ballots_event_id_idx ON daily_ballots (event_id);
CREATE INDEX daily_ballots_selected_by_user_id_idx ON daily_ballots (selected_by_user_id);

-- At most three events per category per day.
CREATE FUNCTION daily_ballots_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('daily_ballots:' || NEW.voting_date || ':' || NEW.category, 0));
  IF (SELECT count(*) FROM daily_ballots
      WHERE voting_date = NEW.voting_date AND category = NEW.category) >= 3 THEN
    RAISE EXCEPTION 'at most 3 events per category per day'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER daily_ballots_limit BEFORE INSERT ON daily_ballots
  FOR EACH ROW EXECUTE FUNCTION daily_ballots_limit();

CREATE TABLE votes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_user_id bigint      NOT NULL REFERENCES users (id),
  daily_ballot_id bigint      NOT NULL,
  voting_date     date        NOT NULL,
  category        text        NOT NULL CHECK (category IN ('science', 'culture', 'sports')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- One vote per student, day and category.
  CONSTRAINT votes_one_per_day_category UNIQUE (student_user_id, voting_date, category),
  -- Date and category must match the ballot entry voted for.
  CONSTRAINT votes_ballot_fk FOREIGN KEY (daily_ballot_id, voting_date, category)
    REFERENCES daily_ballots (id, voting_date, category)
);
CREATE INDEX votes_daily_ballot_id_idx ON votes (daily_ballot_id, voting_date, category);

CREATE TABLE voting_results (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  voting_date            date        NOT NULL,
  category               text        NOT NULL CHECK (category IN ('science', 'culture', 'sports')),
  status                 text        NOT NULL CHECK (status IN ('winner', 'tie_pending', 'below_threshold', 'no_votes')),
  winning_ballot_id      bigint      REFERENCES daily_ballots (id),
  total_votes            integer     NOT NULL CHECK (total_votes >= 0),
  tie_decided_by_user_id bigint      REFERENCES users (id),
  decided_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voting_results_unique UNIQUE (voting_date, category),
  CONSTRAINT voting_results_winner_consistent CHECK ((status = 'winner') = (winning_ballot_id IS NOT NULL))
);
CREATE INDEX voting_results_winning_ballot_id_idx ON voting_results (winning_ballot_id);
CREATE INDEX voting_results_tie_decided_by_user_id_idx ON voting_results (tie_decided_by_user_id);

-- ---------------------------------------------------------------------------
-- Applications, capacity and waiting list
-- ---------------------------------------------------------------------------

CREATE TABLE applications (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id        uuid        NOT NULL DEFAULT uuidv7() UNIQUE,
  event_id         bigint      NOT NULL REFERENCES events (id),
  student_user_id  bigint      NOT NULL REFERENCES users (id),
  status           text        NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
  waitlist_position integer    CHECK (waitlist_position > 0),
  applied_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz,
  cancelled_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_one_per_event UNIQUE (student_user_id, event_id),
  CONSTRAINT applications_waitlist_consistent CHECK ((status = 'waitlisted') = (waitlist_position IS NOT NULL)),
  CONSTRAINT applications_confirmed_consistent CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  CONSTRAINT applications_cancelled_consistent CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX applications_event_id_idx ON applications (event_id);
-- Partial indexes for active applications and the waiting list.
CREATE INDEX applications_confirmed_idx ON applications (event_id) WHERE status = 'confirmed';
CREATE UNIQUE INDEX applications_waitlist_position_idx
  ON applications (event_id, waitlist_position) WHERE status = 'waitlisted';
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Attendance verification (no raw coordinates are stored)
-- ---------------------------------------------------------------------------

CREATE TABLE attendance_scans (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id         bigint       NOT NULL REFERENCES events (id),
  student_user_id  bigint       NOT NULL REFERENCES users (id),
  kind             text         NOT NULL CHECK (kind IN ('entry', 'exit', 'spot_check')),
  -- Identifier (jti) of the short-lived signed QR token; the token itself is not stored.
  token_id         text         NOT NULL CHECK (length(token_id) BETWEEN 8 AND 64),
  scanned_at       timestamptz  NOT NULL DEFAULT now(),
  distance_m       numeric(9,1) CHECK (distance_m >= 0),
  within_radius    boolean      NOT NULL,
  accepted         boolean      NOT NULL,
  rejection_reason text         CHECK (rejection_reason IN ('token_expired', 'token_wrong_event', 'outside_radius', 'location_unavailable', 'outside_event_time')),
  -- Re-scanning the same token returns the same result (idempotency).
  CONSTRAINT attendance_scans_idempotent UNIQUE (student_user_id, token_id),
  CONSTRAINT attendance_scans_rejection_consistent CHECK (accepted = (rejection_reason IS NULL))
);
CREATE INDEX attendance_scans_event_student_idx ON attendance_scans (event_id, student_user_id, scanned_at);
CREATE INDEX attendance_scans_student_user_id_idx ON attendance_scans (student_user_id);

-- Final attendance per student and event, written when the event is finalized.
CREATE TABLE attendances (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id            bigint      NOT NULL REFERENCES events (id),
  student_user_id     bigint      NOT NULL REFERENCES users (id),
  status              text        NOT NULL CHECK (status IN ('attended', 'absent', 'excused', 'blocked_by_capacity')),
  first_valid_scan_at timestamptz,
  last_valid_scan_at  timestamptz,
  present_seconds     integer     NOT NULL DEFAULT 0 CHECK (present_seconds >= 0),
  finalized_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendances_unique UNIQUE (event_id, student_user_id),
  CONSTRAINT attendances_scan_order CHECK (last_valid_scan_at >= first_valid_scan_at),
  CONSTRAINT attendances_attended_has_scans
    CHECK (status <> 'attended' OR (first_valid_scan_at IS NOT NULL AND last_valid_scan_at IS NOT NULL))
);
CREATE INDEX attendances_student_user_id_idx ON attendances (student_user_id);

-- Excuses approved by the advisor prevent point loss.
CREATE TABLE excuses (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id            bigint      NOT NULL REFERENCES events (id),
  student_user_id     bigint      NOT NULL REFERENCES users (id),
  reason              text        NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_user_id bigint      REFERENCES users (id),
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT excuses_unique UNIQUE (event_id, student_user_id),
  CONSTRAINT excuses_review_consistent
    CHECK ((status = 'pending') = (reviewed_by_user_id IS NULL AND reviewed_at IS NULL))
);
CREATE INDEX excuses_student_user_id_idx ON excuses (student_user_id);
CREATE INDEX excuses_reviewed_by_user_id_idx ON excuses (reviewed_by_user_id);

-- ---------------------------------------------------------------------------
-- Scoring, seasons and leaderboard
-- ---------------------------------------------------------------------------

-- An academic year (1 September - 31 August). Seasons never overlap.
CREATE TABLE seasons (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text        NOT NULL UNIQUE CHECK (name ~ '^[0-9]{4}-[0-9]{4}$'),
  starts_on       date        NOT NULL,
  ends_on         date        NOT NULL,
  starting_points integer     NOT NULL DEFAULT 1500 CHECK (starting_points > 0),
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seasons_date_order CHECK (ends_on > starts_on),
  CONSTRAINT seasons_closed_consistent CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT seasons_no_overlap EXCLUDE USING gist (daterange(starts_on, ends_on, '[]') WITH &&)
);
CREATE UNIQUE INDEX seasons_single_active_idx ON seasons ((true)) WHERE status = 'active';

-- Point values per situation; admins change them by closing the current
-- version (valid_to) and inserting a new one, so history is preserved.
CREATE TABLE score_rules (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code               text        NOT NULL CHECK (code IN (
                       'voted_winner_attended',
                       'voted_winner_absent',
                       'no_vote_attended',
                       'voted_other_attended',
                       'voted_other_absent',
                       'no_vote_absent')),
  points             integer     NOT NULL CHECK (points BETWEEN -1000 AND 1000),
  valid_from         timestamptz NOT NULL DEFAULT now(),
  valid_to           timestamptz,
  created_by_user_id bigint      REFERENCES users (id),
  CONSTRAINT score_rules_validity CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX score_rules_current_idx ON score_rules (code) WHERE valid_to IS NULL;
CREATE INDEX score_rules_created_by_user_id_idx ON score_rules (created_by_user_id);

-- Immutable point ledger; totals are derived from it (starting_points + sum).
CREATE TABLE score_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id       bigint      NOT NULL REFERENCES seasons (id),
  student_user_id bigint      NOT NULL REFERENCES users (id),
  event_id        bigint      NOT NULL REFERENCES events (id),
  score_rule_id   bigint      REFERENCES score_rules (id),
  -- 'excuse_reversal' compensates an earlier entry when an excuse is approved late.
  rule_code       text        NOT NULL CHECK (rule_code IN (
                    'voted_winner_attended',
                    'voted_winner_absent',
                    'no_vote_attended',
                    'voted_other_attended',
                    'voted_other_absent',
                    'no_vote_absent',
                    'excuse_reversal')),
  points          integer     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- An event is never scored twice for the same student and rule.
  CONSTRAINT score_ledger_unique UNIQUE (student_user_id, event_id, rule_code),
  -- Regular entries reference the rule version applied; reversals reference none.
  CONSTRAINT score_ledger_rule_consistent CHECK ((rule_code = 'excuse_reversal') = (score_rule_id IS NULL))
);
CREATE INDEX score_ledger_season_student_idx ON score_ledger (season_id, student_user_id);
CREATE INDEX score_ledger_student_user_id_idx ON score_ledger (student_user_id);
CREATE INDEX score_ledger_event_id_idx ON score_ledger (event_id);
CREATE INDEX score_ledger_score_rule_id_idx ON score_ledger (score_rule_id);
CREATE TRIGGER score_ledger_append_only BEFORE UPDATE OR DELETE ON score_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Archived top-10 of each closed season.
CREATE TABLE leaderboard_snapshots (
  season_id       bigint      NOT NULL REFERENCES seasons (id),
  rank            integer     NOT NULL CHECK (rank BETWEEN 1 AND 10),
  student_user_id bigint      NOT NULL REFERENCES users (id),
  total_points    integer     NOT NULL,
  attended_count  integer     NOT NULL CHECK (attended_count >= 0),
  captured_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, rank),
  CONSTRAINT leaderboard_snapshots_student_once UNIQUE (season_id, student_user_id)
);
CREATE INDEX leaderboard_snapshots_student_user_id_idx ON leaderboard_snapshots (student_user_id);

-- ---------------------------------------------------------------------------
-- Feedback: "why" questions and ratings
-- ---------------------------------------------------------------------------

CREATE TABLE reason_prompts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        bigint      NOT NULL REFERENCES events (id),
  student_user_id bigint      NOT NULL REFERENCES users (id),
  kind            text        NOT NULL CHECK (kind IN ('why_attended', 'why_not_attended')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reason_prompts_unique UNIQUE (event_id, student_user_id)
);
CREATE INDEX reason_prompts_student_user_id_idx ON reason_prompts (student_user_id);

CREATE TABLE reason_answers (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reason_prompt_id bigint      NOT NULL UNIQUE REFERENCES reason_prompts (id),
  answer           text        NOT NULL CHECK (length(answer) BETWEEN 1 AND 2000),
  answered_at      timestamptz NOT NULL DEFAULT now(),
  -- Filled by the (later) AI classification behind an interface.
  classification   text        CHECK (length(classification) BETWEEN 1 AND 80),
  classified_at    timestamptz,
  CONSTRAINT reason_answers_classified_consistent CHECK ((classification IS NULL) = (classified_at IS NULL))
);

CREATE TABLE ratings (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        bigint      NOT NULL REFERENCES events (id),
  student_user_id bigint      NOT NULL REFERENCES users (id),
  score           smallint    NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment         text        CHECK (length(comment) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ratings_unique UNIQUE (event_id, student_user_id)
);
CREATE INDEX ratings_student_user_id_idx ON ratings (student_user_id);

-- ---------------------------------------------------------------------------
-- Notifications, preferences and consent
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id  uuid        NOT NULL DEFAULT uuidv7() UNIQUE,
  user_id    bigint      NOT NULL REFERENCES users (id),
  type       text        NOT NULL CHECK (type IN (
               'vote_result', 'vote_invitation', 'application_confirmed', 'application_promoted',
               'event_reminder', 'rating_request', 'reason_request', 'points_changed')),
  title      text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body       text        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  data       jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE notification_deliveries (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id     bigint      NOT NULL REFERENCES notifications (id),
  channel             text        NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp')),
  status              text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  provider_message_id text        CHECK (length(provider_message_id) BETWEEN 1 AND 255),
  attempt_count       integer     NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error          text        CHECK (length(last_error) <= 1000),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_unique UNIQUE (notification_id, channel)
);
CREATE UNIQUE INDEX notification_deliveries_provider_message_idx
  ON notification_deliveries (channel, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE TRIGGER notification_deliveries_updated_at BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- WhatsApp webhook events; the primary key de-duplicates redelivered events.
CREATE TABLE webhook_events (
  provider          text        NOT NULL CHECK (provider IN ('whatsapp')),
  provider_event_id text        NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 255),
  payload           jsonb       NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  PRIMARY KEY (provider, provider_event_id)
);
CREATE INDEX webhook_events_unprocessed_idx ON webhook_events (received_at) WHERE processed_at IS NULL;

CREATE TABLE notification_preferences (
  user_id    bigint      NOT NULL REFERENCES users (id),
  channel    text        NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  type       text        NOT NULL CHECK (type IN (
               'vote_result', 'vote_invitation', 'application_confirmed', 'application_promoted',
               'event_reminder', 'rating_request', 'reason_request', 'points_changed')),
  enabled    boolean     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel, type)
);
CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Explicit, revocable consent records (KVKK). History is kept: revoking sets
-- revoked_at; granting again inserts a new row.
CREATE TABLE consents (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users (id),
  kind       text        NOT NULL CHECK (kind IN ('location', 'whatsapp', 'photo')),
  -- Version of the consent text the user agreed to.
  text_version text      NOT NULL CHECK (length(text_version) BETWEEN 1 AND 40),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT consents_revocation_order CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE UNIQUE INDEX consents_active_idx ON consents (user_id, kind) WHERE revoked_at IS NULL;

-- "Download my data" / "delete my data" requests.
CREATE TABLE data_requests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id       uuid        NOT NULL DEFAULT uuidv7() UNIQUE,
  user_id         bigint      NOT NULL REFERENCES users (id),
  kind            text        NOT NULL CHECK (kind IN ('export', 'delete')),
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_media_id bigint      REFERENCES media_objects (id),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CONSTRAINT data_requests_completed_consistent CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX data_requests_user_id_idx ON data_requests (user_id);
CREATE INDEX data_requests_result_media_id_idx ON data_requests (result_media_id);
CREATE UNIQUE INDEX data_requests_open_idx ON data_requests (user_id, kind)
  WHERE status IN ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

-- Default point table (prompt section 3); admins can change it later.
INSERT INTO score_rules (code, points) VALUES
  ('voted_winner_attended', 20),
  ('voted_winner_absent', -20),
  ('no_vote_attended', 10),
  ('voted_other_attended', 30),
  ('voted_other_absent', 0),
  ('no_vote_absent', 0);
