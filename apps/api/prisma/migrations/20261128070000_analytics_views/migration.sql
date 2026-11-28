-- Read-only reporting layer for the admin dashboard (ADR 0018). The views
-- aggregate across modules on purpose; only the analytics module reads them.
-- Every view has a unique index so the worker can REFRESH ... CONCURRENTLY.

-- One row per completed event.
CREATE MATERIALIZED VIEW analytics_event_facts AS
SELECT
  e.id                                                              AS event_id,
  e.category,
  e.organizer_community_id                                          AS community_id,
  e.advisor_user_id,
  e.ends_at,
  EXTRACT(HOUR FROM e.starts_at AT TIME ZONE 'Europe/Istanbul')::int AS start_hour,
  COALESCE(att.attendees, 0)::int                                   AS attendees,
  rat.average_rating,
  COALESCE(rat.rating_count, 0)::int                                AS rating_count,
  COALESCE(rat.rating_sum, 0)::int                                  AS rating_sum,
  EXISTS (
    SELECT 1 FROM voting_results vr
    JOIN daily_ballots b ON b.id = vr.winning_ballot_id
    WHERE b.event_id = e.id AND vr.status = 'winner'
  )                                                                 AS won
FROM events e
LEFT JOIN (
  SELECT event_id, count(*) AS attendees
  FROM attendances WHERE status = 'attended' GROUP BY event_id
) att ON att.event_id = e.id
LEFT JOIN (
  SELECT event_id, avg(score)::numeric(4, 2) AS average_rating, count(*) AS rating_count,
         sum(score) AS rating_sum
  FROM ratings GROUP BY event_id
) rat ON rat.event_id = e.id
WHERE e.status = 'completed';
CREATE UNIQUE INDEX analytics_event_facts_event_idx ON analytics_event_facts (event_id);

-- Votes per ballot entry (day, category, event).
CREATE MATERIALIZED VIEW analytics_ballot_votes AS
SELECT
  b.id               AS ballot_id,
  b.voting_date,
  b.category,
  b.event_id,
  e.advisor_user_id,
  count(v.id)::int   AS votes
FROM daily_ballots b
JOIN events e ON e.id = b.event_id
LEFT JOIN votes v ON v.daily_ballot_id = b.id
GROUP BY b.id, e.advisor_user_id;
CREATE UNIQUE INDEX analytics_ballot_votes_ballot_idx ON analytics_ballot_votes (ballot_id);

-- Students who voted for a winning event that took place, with their final attendance.
CREATE MATERIALIZED VIEW analytics_winner_voters AS
SELECT
  b.event_id,
  e.advisor_user_id,
  e.category,
  e.ends_at,
  v.student_user_id,
  COALESCE(a.status, 'absent') AS attendance
FROM voting_results vr
JOIN daily_ballots b ON b.id = vr.winning_ballot_id
JOIN events e ON e.id = b.event_id AND e.status = 'completed'
JOIN votes v ON v.daily_ballot_id = b.id
LEFT JOIN attendances a ON a.event_id = b.event_id AND a.student_user_id = v.student_user_id
WHERE vr.status = 'winner';
CREATE UNIQUE INDEX analytics_winner_voters_idx ON analytics_winner_voters (event_id, student_user_id);

-- Classified answers to "why did you not attend?" (no free text in the view).
CREATE MATERIALIZED VIEW analytics_non_attendance_reasons AS
SELECT
  p.event_id,
  e.advisor_user_id,
  e.category,
  e.ends_at,
  COALESCE(ra.classification, 'unclassified') AS label,
  count(*)::int                                 AS answers
FROM reason_answers ra
JOIN reason_prompts p ON p.id = ra.reason_prompt_id
JOIN events e ON e.id = p.event_id
WHERE p.kind = 'why_not_attended'
GROUP BY p.event_id, e.advisor_user_id, e.category, e.ends_at, COALESCE(ra.classification, 'unclassified');
CREATE UNIQUE INDEX analytics_non_attendance_reasons_idx
  ON analytics_non_attendance_reasons (event_id, label);
