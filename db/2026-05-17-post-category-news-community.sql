CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		WHERE t.typname = 'post_category' AND e.enumlabel = 'factual'
	) THEN
		ALTER TYPE post_category RENAME VALUE 'factual' TO 'news';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		WHERE t.typname = 'post_category' AND e.enumlabel = 'personal'
	) THEN
		ALTER TYPE post_category RENAME VALUE 'personal' TO 'community';
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS post_images (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	data_url text NOT NULL,
	position integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_images_post
	ON post_images (post_id, position);

INSERT INTO post_images (post_id, data_url, position)
SELECT id, header_image_data_url, 0
FROM posts
WHERE header_image_data_url IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM post_images
		WHERE post_images.post_id = posts.id
	);
