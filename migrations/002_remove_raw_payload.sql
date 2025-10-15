-- ============================================================================
-- MIGRATION: Remove raw_payload Column
-- Date: October 15, 2025
-- Description: Removes the redundant raw_payload column from markup_projects
--              All data is already normalized, so this column is unnecessary
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop the raw_payload column
-- ============================================================================

ALTER TABLE markup_projects 
DROP COLUMN IF EXISTS raw_payload;

-- ============================================================================
-- STEP 2: Update the insert_markup_payload function (remove raw_payload)
-- ============================================================================

-- Drop the existing function
DROP FUNCTION IF EXISTS insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.insert_markup_payload(BIGINT, JSONB);

-- Recreate without raw_payload
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

    -- Insert project (without raw_payload)
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

-- Verify column was removed
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ raw_payload column successfully removed'
        ELSE '⚠️ raw_payload column still exists'
    END AS status
FROM information_schema.columns
WHERE table_name = 'markup_projects' 
    AND column_name = 'raw_payload';

-- Verify function was updated
SELECT 
    '✅ Function updated without raw_payload' AS status,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
    AND p.proname = 'insert_markup_payload';

-- Show current markup_projects schema
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'markup_projects'
ORDER BY ordinal_position;

SELECT '✅ Migration complete! raw_payload column removed.' AS status;
