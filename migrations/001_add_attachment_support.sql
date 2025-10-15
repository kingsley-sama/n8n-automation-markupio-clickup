-- ============================================================================
-- MIGRATION: Add Attachment Support
-- Date: October 15, 2025
-- Description: Adds attachment columns to markup_threads and markup_comments
--              without affecting existing data
-- ============================================================================

-- ============================================================================
-- STEP 1: Add attachment column to markup_threads table
-- ============================================================================

-- Add has_attachments boolean to track if the thread has any attachments
ALTER TABLE markup_threads 
ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT FALSE;

-- Add comment to explain the column
COMMENT ON COLUMN markup_threads.has_attachments IS 
'Indicates if any comment in this thread has attachments';

-- ============================================================================
-- STEP 2: Add attachment column to markup_comments table
-- ============================================================================

-- Add attachments as JSONB array to store multiple attachment URLs
ALTER TABLE markup_comments 
ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}';

-- Add comment to explain the column
COMMENT ON COLUMN markup_comments.attachments IS 
'Array of attachment URLs associated with this comment';

-- ============================================================================
-- STEP 3: Create index for better query performance
-- ============================================================================

-- Index for finding threads with attachments
CREATE INDEX IF NOT EXISTS idx_markup_threads_has_attachments 
ON markup_threads(has_attachments) WHERE has_attachments = TRUE;

-- Index for finding comments with attachments (GIN index for array)
CREATE INDEX IF NOT EXISTS idx_markup_comments_attachments 
ON markup_comments USING GIN(attachments) WHERE array_length(attachments, 1) > 0;

-- ============================================================================
-- STEP 4: Create helper function to update thread attachment status
-- ============================================================================

-- Function to automatically update has_attachments on the thread 
-- when a comment's attachments are added or modified
CREATE OR REPLACE FUNCTION update_thread_has_attachments()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the parent thread's has_attachments flag
    UPDATE markup_threads
    SET has_attachments = EXISTS (
        SELECT 1 
        FROM markup_comments 
        WHERE thread_id = COALESCE(NEW.thread_id, OLD.thread_id)
        AND attachments IS NOT NULL 
        AND array_length(attachments, 1) > 0
    )
    WHERE id = COALESCE(NEW.thread_id, OLD.thread_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Create trigger to auto-update thread attachment status
-- ============================================================================

-- Drop trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_update_thread_has_attachments ON markup_comments;

-- Create trigger that fires when attachments are added/updated/deleted
CREATE TRIGGER trigger_update_thread_has_attachments
    AFTER INSERT OR UPDATE OF attachments OR DELETE ON markup_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_has_attachments();

-- ============================================================================
-- STEP 6: Update existing data (if any threads already have attachments)
-- ============================================================================

-- This will scan existing comments and update thread flags accordingly
-- Safe to run even if no data exists
UPDATE markup_threads t
SET has_attachments = TRUE
WHERE EXISTS (
    SELECT 1 
    FROM markup_comments c 
    WHERE c.thread_id = t.id 
    AND c.attachments IS NOT NULL 
    AND array_length(c.attachments, 1) > 0
);

-- ============================================================================
-- STEP 7: Update the insert_markup_payload function to handle attachments
-- ============================================================================

-- Drop the existing function (both possible signatures)
DROP FUNCTION IF EXISTS insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.insert_markup_payload(BIGINT, JSONB);

-- Recreate with attachment support
CREATE FUNCTION public.insert_markup_payload(
    p_scraped_data_id BIGINT,
    p_payload JSONB
)
RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_project_id UUID;
    v_thread_id UUID;
    v_thread JSONB;
    v_comment JSONB;
    v_has_attachments BOOLEAN;
    v_attachments TEXT[];
BEGIN
    -- Validate inputs
    IF p_scraped_data_id IS NULL THEN
        RAISE EXCEPTION 'p_scraped_data_id cannot be NULL';
    END IF;
    
    IF p_payload IS NULL THEN
        RAISE EXCEPTION 'p_payload cannot be NULL';
    END IF;

    -- Insert project
    INSERT INTO public.markup_projects (
        scraped_data_id,
        project_name,
        markup_url,
        total_threads,
        total_screenshots,
        extraction_timestamp,
        raw_payload
    )
    VALUES (
        p_scraped_data_id,
        p_payload->'data'->>'projectName',
        p_payload->'data'->>'url',
        (p_payload->'data'->>'totalThreads')::INTEGER,
        (p_payload->'data'->>'totalScreenshots')::INTEGER,
        (p_payload->'data'->>'timestamp')::TIMESTAMP WITH TIME ZONE,
        p_payload
    )
    RETURNING id INTO v_project_id;

    -- Insert threads and comments
    FOR v_thread IN SELECT * FROM jsonb_array_elements(p_payload->'data'->'threads')
    LOOP
        -- Check if any comment in this thread has attachments
        v_has_attachments := FALSE;
        IF jsonb_typeof(v_thread->'comments') = 'array' THEN
            SELECT COUNT(*) > 0 INTO v_has_attachments
            FROM jsonb_array_elements(v_thread->'comments') AS comment
            WHERE jsonb_typeof(comment->'attachments') = 'array' 
            AND jsonb_array_length(comment->'attachments') > 0;
        END IF;

        INSERT INTO public.markup_threads (
            project_id,
            thread_name,
            image_index,
            image_path,
            image_filename,
            local_image_path,
            has_attachments
        )
        VALUES (
            v_project_id,
            v_thread->>'threadName',
            (v_thread->>'imageIndex')::INTEGER,
            v_thread->>'imagePath',
            v_thread->>'imageFilename',
            v_thread->>'localImagePath',
            v_has_attachments
        )
        RETURNING id INTO v_thread_id;

        -- Insert comments for this thread
        IF jsonb_typeof(v_thread->'comments') = 'array' THEN
            FOR v_comment IN SELECT * FROM jsonb_array_elements(v_thread->'comments')
            LOOP
                -- Extract attachments array if present
                v_attachments := '{}';
                IF jsonb_typeof(v_comment->'attachments') = 'array' THEN
                    SELECT ARRAY(
                        SELECT jsonb_array_elements_text(v_comment->'attachments')
                    ) INTO v_attachments;
                END IF;

                INSERT INTO public.markup_comments (
                    thread_id,
                    comment_index,
                    pin_number,
                    content,
                    user_name,
                    attachments
                )
                VALUES (
                    v_thread_id,
                    (v_comment->>'index')::INTEGER,
                    (v_comment->>'pinNumber')::INTEGER,
                    v_comment->>'content',
                    v_comment->>'user',
                    v_attachments
                );
            END LOOP;
        END IF;
    END LOOP;

    RETURN v_project_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error in insert_markup_payload: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify columns were added
SELECT 
    'Column added to markup_threads:' AS status,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'markup_threads' 
    AND column_name = 'has_attachments';

SELECT 
    'Column added to markup_comments:' AS status,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'markup_comments' 
    AND column_name = 'attachments';

-- Verify indexes were created
SELECT 
    'Indexes created:' AS status,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('markup_threads', 'markup_comments')
    AND indexname LIKE '%attachment%';

-- Verify function was updated
SELECT 
    'Function updated:' AS status,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
    AND p.proname = 'insert_markup_payload';

-- Show sample data (if any exists)
SELECT 
    '✅ Migration complete!' AS status,
    (SELECT COUNT(*) FROM markup_threads) AS total_threads,
    (SELECT COUNT(*) FROM markup_threads WHERE has_attachments = TRUE) AS threads_with_attachments,
    (SELECT COUNT(*) FROM markup_comments) AS total_comments,
    (SELECT COUNT(*) FROM markup_comments WHERE array_length(attachments, 1) > 0) AS comments_with_attachments;
