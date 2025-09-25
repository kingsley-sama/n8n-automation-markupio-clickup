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

