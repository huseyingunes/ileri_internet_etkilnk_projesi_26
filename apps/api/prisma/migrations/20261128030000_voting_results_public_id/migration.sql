-- Public id for voting results (PUT /voting-results/{id}/tie-decision).
ALTER TABLE voting_results ADD COLUMN public_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE voting_results ADD CONSTRAINT voting_results_public_id_key UNIQUE (public_id);
-- Tied entries, recorded when voting closes, so the admin can only pick one of them.
ALTER TABLE voting_results ADD COLUMN tied_ballot_ids bigint[] NOT NULL DEFAULT '{}';
