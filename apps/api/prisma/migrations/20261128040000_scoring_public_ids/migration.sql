-- Public ids for excuses (PATCH /excuses/{id}) and ledger entries (history cursor).
-- Adding a column does not fire the ledger's append-only row trigger.
ALTER TABLE excuses ADD COLUMN public_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE excuses ADD CONSTRAINT excuses_public_id_key UNIQUE (public_id);
ALTER TABLE score_ledger ADD COLUMN public_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE score_ledger ADD CONSTRAINT score_ledger_public_id_key UNIQUE (public_id);
