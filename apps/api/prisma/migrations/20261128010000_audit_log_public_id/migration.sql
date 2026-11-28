-- Gives audit entries a public UUIDv7 id for cursor pagination (GET /audit-log).
-- ADD COLUMN with a volatile default rewrites the table without firing the
-- append-only row trigger, so existing entries get ids too.
ALTER TABLE audit_log ADD COLUMN public_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE audit_log ADD CONSTRAINT audit_log_public_id_key UNIQUE (public_id);
