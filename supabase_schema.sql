-- Table for storing successful scraping results
CREATE TABLE scraped_data (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    title TEXT,
    scraping_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    number_of_images INTEGER,
    screenshot_metadata JSONB,
    screenshots_paths TEXT[],
    duration_seconds NUMERIC,
    success BOOLEAN DEFAULT TRUE,
    options JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for storing failed scraping attempts for manual retriggering
CREATE TABLE scraping_error_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID,
    url TEXT NOT NULL, -- The URL that failed to be scraped
    title TEXT,
    error_message TEXT NOT NULL,
    number_of_images INTEGER,
    error_details JSONB,
    options JSONB, -- Store the original scraping options for retriggering
    failed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'failed' CHECK (status IN ('failed', 'retrying', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Minimal indexing (only what's needed)
CREATE INDEX idx_scraped_data_session_id ON scraped_data(session_id);
CREATE INDEX idx_scraped_data_timestamp ON scraped_data(scraping_timestamp);
CREATE INDEX idx_scraping_error_logs_url ON scraping_error_logs(url);
CREATE INDEX idx_scraping_error_logs_status ON scraping_error_logs(status);
CREATE INDEX idx_scraping_error_logs_failed_at ON scraping_error_logs(failed_at);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at for scraped_data
CREATE TRIGGER update_scraped_data_updated_at
    BEFORE UPDATE ON scraped_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for scraping_error_logs
CREATE TRIGGER update_scraping_error_logs_updated_at
    BEFORE UPDATE ON scraping_error_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- EXISTING SCRAPING TABLES (Your original structure)
-- ============================================================================

CREATE TABLE scraped_data (
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

CREATE TABLE scraping_error_logs (
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
-- NEW MARKUP ANNOTATION TABLES
-- ============================================================================

CREATE TABLE markup_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scraped_data_id BIGINT REFERENCES scraped_data(id) ON DELETE CASCADE,
    project_name VARCHAR(255) NOT NULL,
    markup_url TEXT,
    total_threads INTEGER DEFAULT 0,
    total_screenshots INTEGER DEFAULT 0,
    extraction_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE markup_threads (
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

CREATE TABLE markup_comments (
    id UUID PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES markup_threads(id) ON DELETE CASCADE,
    comment_index INTEGER NOT NULL,
    pin_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_scraped_data_session_id ON scraped_data(session_id);
CREATE INDEX idx_scraped_data_timestamp ON scraped_data(scraping_timestamp);
CREATE INDEX idx_scraping_error_logs_url ON scraping_error_logs(url);
CREATE INDEX idx_scraping_error_logs_status ON scraping_error_logs(status);
CREATE INDEX idx_scraping_error_logs_failed_at ON scraping_error_logs(failed_at);

CREATE INDEX idx_markup_projects_scraped_data ON markup_projects(scraped_data_id);
CREATE INDEX idx_markup_projects_name ON markup_projects(project_name);
CREATE INDEX idx_markup_threads_project_id ON markup_threads(project_id);
CREATE INDEX idx_markup_comments_thread_id ON markup_comments(thread_id);
CREATE INDEX idx_markup_comments_user ON markup_comments(user_name);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_scraped_data_updated_at
    BEFORE UPDATE ON scraped_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraping_error_logs_updated_at
    BEFORE UPDATE ON scraping_error_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markup_projects_updated_at
    BEFORE UPDATE ON markup_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markup_threads_updated_at
    BEFORE UPDATE ON markup_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markup_comments_updated_at
    BEFORE UPDATE ON markup_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTION TO INSERT MARKUP PAYLOAD
-- ============================================================================

CREATE OR REPLACE FUNCTION insert_markup_payload(
    p_scraped_data_id BIGINT,
    p_payload JSONB
)
RETURNS UUID AS $$
DECLARE
    v_project_id UUID;
    v_thread_id UUID;
    v_thread JSONB;
    v_comment JSONB;
BEGIN
    -- Insert project
    INSERT INTO markup_projects (
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
        INSERT INTO markup_threads (
            id,
            project_id,
            thread_name,
            image_index,
            image_path,
            image_filename,
            local_image_path
        )
        VALUES (
            gen_random_uuid(),
            v_project_id,
            v_thread->>'threadName',
            (v_thread->>'imageIndex')::INTEGER,
            v_thread->>'imagePath',
            v_thread->>'imageFilename',
            v_thread->>'localImagePath'
        )
        RETURNING id INTO v_thread_id;

        -- Insert comments for this thread
        FOR v_comment IN SELECT * FROM jsonb_array_elements(v_thread->'comments')
        LOOP
            INSERT INTO markup_comments (
                id,
                thread_id,
                comment_index,
                pin_number,
                content,
                user_name
            )
            VALUES (
                (v_comment->>'id')::UUID,
                v_thread_id,
                (v_comment->>'index')::INTEGER,
                (v_comment->>'pinNumber')::INTEGER,
                v_comment->>'content',
                v_comment->>'user'
            );
        END LOOP;
    END LOOP;

    RETURN v_project_id;
END;
$$ LANGUAGE plpgsql;