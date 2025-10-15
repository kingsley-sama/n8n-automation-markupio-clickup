-- Migration: Remove redundant local_image_path column
-- Date: 2025-10-15
-- Description: Remove local_image_path column from markup_threads table as it stores
--              the same value as image_path. This eliminates data duplication.

-- ============================================================================
-- DROP COLUMN
-- ============================================================================

-- Remove the redundant local_image_path column
ALTER TABLE markup_threads DROP COLUMN IF EXISTS local_image_path;

-- ============================================================================
-- UPDATE insert_markup_payload FUNCTION
-- ============================================================================

-- Recreate the function without local_image_path references
CREATE OR REPLACE FUNCTION insert_markup_payload(
    p_scraped_data_id UUID,
    p_project_name TEXT,
    p_threads JSONB
)
RETURNS UUID AS $$
DECLARE
    v_project_id UUID;
    v_thread JSONB;
    v_thread_id UUID;
    v_comment JSONB;
BEGIN
    -- Insert or update project
    INSERT INTO markup_projects (scraped_data_id, project_name, has_attachments)
    VALUES (p_scraped_data_id, p_project_name, FALSE)
    ON CONFLICT (scraped_data_id) 
    DO UPDATE SET 
        project_name = EXCLUDED.project_name,
        updated_at = NOW()
    RETURNING id INTO v_project_id;

    -- Process each thread
    FOR v_thread IN SELECT * FROM jsonb_array_elements(p_threads)
    LOOP
        -- Insert thread (only image_path, no local_image_path)
        INSERT INTO markup_threads (
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
            NULLIF(v_thread->>'imageIndex', '')::INTEGER,
            v_thread->>'imagePath',
            v_thread->>'imageFilename',
            FALSE
        )
        RETURNING id INTO v_thread_id;

        -- Insert comments for this thread
        IF v_thread->'comments' IS NOT NULL THEN
            FOR v_comment IN SELECT * FROM jsonb_array_elements(v_thread->'comments')
            LOOP
                INSERT INTO markup_comments (
                    id,
                    thread_id,
                    comment_index,
                    pin_number,
                    content,
                    user_name,
                    has_attachments,
                    attachments
                )
                VALUES (
                    gen_random_uuid(),
                    v_thread_id,
                    (v_comment->>'index')::INTEGER,
                    COALESCE((v_comment->>'pinNumber')::INTEGER, (v_comment->>'index')::INTEGER),
                    v_comment->>'content',
                    v_comment->>'user',
                    COALESCE((v_comment->>'hasAttachments')::BOOLEAN, FALSE),
                    COALESCE(
                        (
                            SELECT array_agg(elem::TEXT)
                            FROM jsonb_array_elements_text(v_comment->'attachments') elem
                        ),
                        ARRAY[]::TEXT[]
                    )
                );
            END LOOP;
        END IF;
    END LOOP;

    RETURN v_project_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
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
    
    RAISE NOTICE 'Migration 003 completed successfully';
    RAISE NOTICE '✓ Removed local_image_path column from markup_threads';
    RAISE NOTICE '✓ Updated insert_markup_payload function';
END $$;
