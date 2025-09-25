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

-- Table for storing scraping logs and errors
CREATE TABLE scraping_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'success', 'debug')),
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_details JSONB,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Minimal indexing (only what's needed)
CREATE INDEX idx_scraped_data_session_id ON scraped_data(session_id);
CREATE INDEX idx_scraped_data_timestamp ON scraped_data(scraping_timestamp);
CREATE INDEX idx_scraping_logs_session_id ON scraping_logs(session_id);
CREATE INDEX idx_scraping_logs_timestamp ON scraping_logs(timestamp);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_scraped_data_updated_at
    BEFORE UPDATE ON scraped_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for recent scraping activities
CREATE VIEW recent_scraping_activities AS
SELECT 
    sd.id,
    sd.session_id,
    sd.url,
    sd.title,
    sd.scraping_timestamp,
    sd.number_of_images,
    sd.duration_seconds,
    sd.success,
    COUNT(sl.id) as log_count,
    COUNT(CASE WHEN sl.level = 'error' THEN 1 END) as error_count
FROM scraped_data sd
LEFT JOIN scraping_logs sl ON sd.session_id = sl.session_id
WHERE sd.scraping_timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY sd.id, sd.session_id, sd.url, sd.title, sd.scraping_timestamp, 
         sd.number_of_images, sd.duration_seconds, sd.success
ORDER BY sd.scraping_timestamp DESC;

--------------------------------------------------------------------------------
-- Functions & triggers to call Edge Functions
--------------------------------------------------------------------------------

-- This function is called when new scraped_data is inserted
CREATE OR REPLACE FUNCTION notify_n8n_webhook()
RETURNS TRIGGER AS $$
DECLARE
BEGIN
    -- Supabase Edge Function will receive this payload automatically
    PERFORM
        net.http_post(
            url := 'https://atutgxnwrkuuqwyziahj.supabase.co/functions/v1/bright-endpoint', --success function URL
            body := json_build_object('record', row_to_json(NEW))
        );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for scraped_data inserts
CREATE TRIGGER scraped_data_webhook_trigger
    AFTER INSERT ON scraped_data
    FOR EACH ROW
    EXECUTE FUNCTION notify_n8n_webhook();


-- This function is called when new scraping_logs entry with error is inserted
CREATE OR REPLACE FUNCTION notify_n8n_error_webhook()
RETURNS TRIGGER AS $$
DECLARE
BEGIN
    IF NEW.level = 'error' THEN
        PERFORM
            net.http_post(
                url := 'https://atutgxnwrkuuqwyziahj.supabase.co/functions/v1/smart-responder', --error function URL
                body := json_build_object('record', row_to_json(NEW))
            );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for scraping_logs inserts
CREATE TRIGGER scraping_logs_error_webhook_trigger
    AFTER INSERT ON scraping_logs
    FOR EACH ROW
    EXECUTE FUNCTION notify_n8n_error_webhook();
