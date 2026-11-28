-- Public ids for reason prompts (PUT /reason-prompts/{id}/answer) and ratings (cursor).
ALTER TABLE reason_prompts ADD COLUMN public_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE reason_prompts ADD CONSTRAINT reason_prompts_public_id_key UNIQUE (public_id);
ALTER TABLE ratings ADD COLUMN public_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE ratings ADD CONSTRAINT ratings_public_id_key UNIQUE (public_id);
