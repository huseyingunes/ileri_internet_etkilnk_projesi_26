-- Alternative text for images (WCAG 1.1.1); plain text, optional.
ALTER TABLE media_objects ADD COLUMN alt text NOT NULL DEFAULT '' CHECK (length(alt) <= 300);
