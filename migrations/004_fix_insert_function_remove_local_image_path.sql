-- Migration: Fix insert_markup_payload function to remove local_image_path
-- Date: 2025-10-15
-- Description: Update the insert_markup_payload function to match the correct signature
--              that the JavaScript code expects (p_scraped_data_id BIGINT, p_payload JSONB)
--              and ensure it does NOT reference local_image_path column

-- ============================================================================
-- STEP 1: Ensure local_image_path column is removed
-- ============================================================================

ALTER TABLE markup_threads DROP COLUMN IF EXISTS local_image_path;

-- ============================================================================
-- STEP 2: Drop old function variations
-- ============================================================================

DROP FUNCTION IF EXISTS insert_markup_payload(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS insert_markup_payload(JSONB, BIGINT);
DROP FUNCTION IF EXISTS public.insert_markup_payload(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.insert_markup_payload(JSONB, BIGINT);

-- ============================================================================
-- STEP 3: Create the correct function WITHOUT local_image_path
-- ============================================================================

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
        -- Check if thread has attachments
        v_has_attachments := FALSE;
        IF jsonb_typeof(v_thread->'comments') = 'array' THEN
            SELECT EXISTS (
                SELECT 1 
                FROM jsonb_array_elements(v_thread->'comments') AS comment
                WHERE jsonb_typeof(comment->'attachments') = 'array' 
                AND jsonb_array_length(comment->'attachments') > 0
            ) INTO v_has_attachments;
        END IF;

        -- Insert thread WITHOUT local_image_path (only image_path)
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
GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO service_role;

-- ============================================================================
-- STEP 4: Verification
-- ============================================================================

-- Verify column was removed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'markup_threads' 
        AND column_name = 'local_image_path'
    ) THEN
        RAISE EXCEPTION 'Migration failed: local_image_path column still exists';
    END IF;
    
    -- Verify function exists with correct signature
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'insert_markup_payload'
    ) THEN
        RAISE EXCEPTION 'Migration failed: insert_markup_payload function does not exist';
    END IF;
    
    RAISE NOTICE '✅ Migration 004 completed successfully';
    RAISE NOTICE '✓ Removed local_image_path column from markup_threads';
    RAISE NOTICE '✓ Updated insert_markup_payload function (BIGINT, JSONB signature)';
    RAISE NOTICE '✓ Function no longer references local_image_path';
END $$;
