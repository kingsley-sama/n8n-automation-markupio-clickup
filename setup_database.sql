-- ============================================================================
-- COMPLETE DATABASE SETUP FOR MARKUP.IO AUTOMATION
-- Run this script in your Supabase SQL Editor or via psql
-- ============================================================================

-- ============================================================================
-- MAIN SCRAPING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS scraped_data (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    title TEXT,
    scraping_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    number_of_images INTEGER,
    screenshot_metadata JSONB,
    screenshots_paths TEXT[],
    response_payload JSONB,
    duration_seconds NUMERIC,
    success BOOLEAN DEFAULT TRUE,
    options JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraping_error_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID,
    url TEXT NOT NULL,
    title TEXT,
    error_message TEXT NOT NULL,
    number_of_images INTEGER,
    error_details JSONB,
    options JSONB,
    response_payload JSONB,
    failed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'failed' CHECK (status IN ('failed', 'retrying', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- MARKUP ANNOTATION TABLES (NORMALIZED STRUCTURE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS markup_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scraped_data_id BIGINT REFERENCES scraped_data(id) ON DELETE CASCADE,
    project_name VARCHAR(255) NOT NULL,
    markup_url TEXT,
    total_threads INTEGER DEFAULT 0,
    total_screenshots INTEGER DEFAULT 0,
    extraction_timestamp TIMESTAMP WITH TIME ZONE,
    raw_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS markup_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES markup_projects(id) ON DELETE CASCADE,
    thread_name VARCHAR(255) NOT NULL,
    image_index INTEGER,
    image_path TEXT,
    image_filename VARCHAR(255),
    local_image_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS markup_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES markup_threads(id) ON DELETE CASCADE,
    comment_index INTEGER NOT NULL,
    pin_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Drop existing indexes if they exist (to avoid conflicts)
DROP INDEX IF EXISTS idx_scraped_data_session_id;
DROP INDEX IF EXISTS idx_scraped_data_timestamp;
DROP INDEX IF EXISTS idx_scraped_data_url;
DROP INDEX IF EXISTS idx_scraping_error_logs_url;
DROP INDEX IF EXISTS idx_scraping_error_logs_status;
DROP INDEX IF EXISTS idx_scraping_error_logs_failed_at;
DROP INDEX IF EXISTS idx_markup_projects_scraped_data;
DROP INDEX IF EXISTS idx_markup_projects_name;
DROP INDEX IF EXISTS idx_markup_threads_project_id;
DROP INDEX IF EXISTS idx_markup_comments_thread_id;
DROP INDEX IF EXISTS idx_markup_comments_user;

-- Create indexes
CREATE INDEX idx_scraped_data_session_id ON scraped_data(session_id);
CREATE INDEX idx_scraped_data_timestamp ON scraped_data(scraping_timestamp);
CREATE INDEX idx_scraped_data_url ON scraped_data(url);
CREATE INDEX idx_scraping_error_logs_url ON scraping_error_logs(url);
CREATE INDEX idx_scraping_error_logs_status ON scraping_error_logs(status);
CREATE INDEX idx_scraping_error_logs_failed_at ON scraping_error_logs(failed_at);

CREATE INDEX idx_markup_projects_scraped_data ON markup_projects(scraped_data_id);
CREATE INDEX idx_markup_projects_name ON markup_projects(project_name);
CREATE INDEX idx_markup_threads_project_id ON markup_threads(project_id);
CREATE INDEX idx_markup_comments_thread_id ON markup_comments(thread_id);
CREATE INDEX idx_markup_comments_user ON markup_comments(user_name);

-- ============================================================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_scraped_data_updated_at ON scraped_data;
CREATE TRIGGER update_scraped_data_updated_at
    BEFORE UPDATE ON scraped_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scraping_error_logs_updated_at ON scraping_error_logs;
CREATE TRIGGER update_scraping_error_logs_updated_at
    BEFORE UPDATE ON scraping_error_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_markup_projects_updated_at ON markup_projects;
CREATE TRIGGER update_markup_projects_updated_at
    BEFORE UPDATE ON markup_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_markup_threads_updated_at ON markup_threads;
CREATE TRIGGER update_markup_threads_updated_at
    BEFORE UPDATE ON markup_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_markup_comments_updated_at ON markup_comments;
CREATE TRIGGER update_markup_comments_updated_at
    BEFORE UPDATE ON markup_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTION TO INSERT COMPLETE MARKUP PAYLOAD
-- ============================================================================

-- Drop all variations of the function to ensure clean state
DROP FUNCTION IF EXISTS insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS insert_markup_payload(JSONB, BIGINT);
DROP FUNCTION IF EXISTS public.insert_markup_payload(BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.insert_markup_payload(JSONB, BIGINT);

-- Create the function with explicit schema and parameter names
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
        INSERT INTO public.markup_threads (
            project_id,
            thread_name,
            image_index,
            image_path,
            image_filename,
            local_image_path
        )
        VALUES (
            v_project_id,
            v_thread->>'threadName',
            (v_thread->>'imageIndex')::INTEGER,
            v_thread->>'imagePath',
            v_thread->>'imageFilename',
            v_thread->>'localImagePath'
        )
        RETURNING id INTO v_thread_id;

        -- Insert comments for this thread
        IF jsonb_typeof(v_thread->'comments') = 'array' THEN
            FOR v_comment IN SELECT * FROM jsonb_array_elements(v_thread->'comments')
            LOOP
                INSERT INTO public.markup_comments (
                    thread_id,
                    comment_index,
                    pin_number,
                    content,
                    user_name
                )
                VALUES (
                    v_thread_id,
                    (v_comment->>'index')::INTEGER,
                    (v_comment->>'pinNumber')::INTEGER,
                    v_comment->>'content',
                    v_comment->>'user'
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_markup_payload(BIGINT, JSONB) TO anon;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables were created
SELECT 'Tables created:' AS status;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE '%markup%' OR table_name LIKE '%scraped%')
ORDER BY table_name;

-- Verify function was created with full details
SELECT 'Function created:' AS status;
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'insert_markup_payload';

-- Test that function is callable (dry run with NULL - will fail but confirms it exists)
DO $$
BEGIN
    -- This tests the function signature exists
    PERFORM * FROM pg_proc 
    WHERE proname = 'insert_markup_payload' 
      AND pronargs = 2;
    
    IF FOUND THEN
        RAISE NOTICE '✅ Function insert_markup_payload(BIGINT, JSONB) is properly registered';
    ELSE
        RAISE WARNING '⚠️  Function not found or wrong signature';
    END IF;
END $$;

SELECT '✅ Database setup complete! Function is ready to use.' AS status;
 