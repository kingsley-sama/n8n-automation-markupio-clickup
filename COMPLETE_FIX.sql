-- ============================================================================
-- COMPLETE FIX: Add Attachments + Remove local_image_path
-- ============================================================================
-- This combines all necessary migrations into one clean script
-- Run this in Supabase SQL Editor to fix all issues at once!

-- ============================================================================
-- STEP 1: Add attachment columns if they don't exist
-- ============================================================================

-- Add has_attachments to markup_threads
ALTER TABLE markup_threads 
ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN markup_threads.has_attachments IS 
'Indicates if any comment in this thread has attachments';

-- Add attachments array to markup_comments
ALTER TABLE markup_comments 
ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}';

COMMENT ON COLUMN markup_comments.attachments IS 
'Array of attachment URLs associated with this comment';

-- ============================================================================
-- STEP 2: Remove local_image_path column (if it exists)
-- ============================================================================

ALTER TABLE markup_threads DROP COLUMN IF EXISTS local_image_path;

-- ============================================================================
-- STEP 3: Create indexes for better performance
-- ============================================================================

-- Index for finding threads with attachments
CREATE INDEX IF NOT EXISTS idx_markup_threads_has_attachments 
ON markup_threads(has_attachments) WHERE has_attachments = TRUE;

-- Index for finding comments with attachments (GIN index for array)
CREATE INDEX IF NOT EXISTS idx_markup_comments_attachments 
ON markup_comments USING GIN(attachments) WHERE array_length(attachments, 1) > 0;

-- ============================================================================
-- STEP 4: Create helper function to auto-update thread attachment status
-- ============================================================================

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

DROP TRIGGER IF EXISTS trigger_update_thread_has_attachments ON markup_comments;

CREATE TRIGGER trigger_update_thread_has_attachments
    AFTER INSERT OR UPDATE OF attachments OR DELETE ON markup_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_has_attachments();

-- ============================================================================
-- STEP 6: Update existing data (if any threads already have attachments)
-- ============================================================================

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
-- STEP 7: Drop all old function variations
-- ============================================================================

DROP FUNCTION IF EXISTS insert_markup_payload(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS insert_markup_payload(JSONB, BIGINT);
DROP FUNCTION IF EXISTS public.insert_markup_payload(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.insert_markup_payload(JSONB, BIGINT);

-- ============================================================================
-- STEP 8: Create the CORRECT insert_markup_payload function
-- ============================================================================
-- With attachments support, WITHOUT local_image_path, WITHOUT raw_payload

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
        extraction_timestamp
    )
    VALUES (
        p_scraped_data_id,
        p_payload->'data'->>'projectName',
        p_payload->'data'->>'url',
        (p_payload->'data'->>'totalThreads')::INTEGER,
        (p_payload->'data'->>'totalScreenshots')::INTEGER,
        (p_payload->'data'->>'timestamp')::TIMESTAMP WITH TIME ZONE
    )
    RETURNING id INTO v_project_id;

    -- Insert threads and comments
    FOR v_thread IN SELECT * FROM jsonb_array_elements(p_payload->'data'->'threads')
    LOOP
        -- Check if any comment in this thread has attachments
        v_has_attachments := FALSE;
        IF jsonb_typeof(v_thread->'comments') = 'array' THEN
            SELECT EXISTS (
                SELECT 1 
                FROM jsonb_array_elements(v_thread->'comments') AS comment
                WHERE jsonb_typeof(comment->'attachments') = 'array' 
                AND jsonb_array_length(comment->'attachments') > 0
            ) INTO v_has_attachments;
        END IF;

        -- Insert thread - ONLY image_path (NO local_image_path!)
        INSERT INTO public.markup_threads (
            project_id,
            thread_name,
            image_index,
            image_path,
            image_filename,
            has_attachments
        )
        VALUES (
            v_project_id,
            v_thread->>'threadName',
            (v_thread->>'imageIndex')::INTEGER,
            v_thread->>'imagePath',
            v_thread->>'imageFilename',
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

                -- Insert comment with attachments (NO has_attachments column in comments!)
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

-- ============================================================================
-- STEP 9: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO service_role;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    -- Check local_image_path is gone
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'markup_threads' 
        AND column_name = 'local_image_path'
    ) THEN
        RAISE EXCEPTION '❌ Migration failed: local_image_path column still exists';
    END IF;
    
    -- Check has_attachments exists on threads
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'markup_threads' 
        AND column_name = 'has_attachments'
    ) THEN
        RAISE EXCEPTION '❌ Migration failed: has_attachments column missing from markup_threads';
    END IF;
    
    -- Check attachments exists on comments
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'markup_comments' 
        AND column_name = 'attachments'
    ) THEN
        RAISE EXCEPTION '❌ Migration failed: attachments column missing from markup_comments';
    END IF;
    
    -- Check function exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'insert_markup_payload'
    ) THEN
        RAISE EXCEPTION '❌ Migration failed: insert_markup_payload function does not exist';
    END IF;
    
    RAISE NOTICE '✅✅✅ MIGRATION COMPLETE! ✅✅✅';
    RAISE NOTICE '✅ Removed local_image_path column';
    RAISE NOTICE '✅ Added has_attachments to markup_threads';
    RAISE NOTICE '✅ Added attachments to markup_comments';
    RAISE NOTICE '✅ Created attachment indexes';
    RAISE NOTICE '✅ Created auto-update trigger';
    RAISE NOTICE '✅ Updated insert_markup_payload function';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 Your database is ready! Test your application now!';
END $$;
