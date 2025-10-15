-- Migration: Add attachments column to markup_comments table
-- Date: 2025-10-14
-- Description: Adds support for comment attachments

-- Add attachments column to markup_comments
ALTER TABLE markup_comments 
ADD COLUMN IF NOT EXISTS attachments TEXT[];

-- Create an index for faster attachment queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_markup_comments_attachments 
ON markup_comments USING GIN (attachments);

-- Add a comment to document the column
COMMENT ON COLUMN markup_comments.attachments IS 'Array of attachment URLs for this comment';

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'markup_comments' 
    AND column_name = 'attachments';

-- Display success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully: attachments column added to markup_comments table';
END $$;
