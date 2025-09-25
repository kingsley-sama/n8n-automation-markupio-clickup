# Quick Start Guide

Get your scraper up and running with Supabase and n8n integration in minutes!

## 1. Prerequisites

- Node.js (v16 or higher)
- Supabase account and project
- n8n instance (cloud or self-hosted)

## 2. Quick Setup

### Clone and Install
```bash
git clone <your-repo>
cd n8n_clickup_workflow
npm install
```

### Environment Configuration
```bash
cp .env.template .env
# Edit .env with your credentials
```

### Supabase Setup
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project or select existing
3. In SQL Editor, paste and run the content from `supabase_schema.sql`
4. Copy your project URL and API keys to `.env`

### n8n Webhook Setup
1. In n8n, create a new workflow
2. Add a Webhook trigger node
3. Set method to POST
4. Copy the webhook URL to `.env` as `N8N_WEBHOOK_URL`

## 3. Test Run

```bash
npm start
```

## 4. Verify Integration

1. Check Supabase dashboard for new data in `scraped_data` table
2. Check n8n workflow for webhook trigger
3. Review logs in `scraping_logs` table

## 5. Next Steps

- Customize scraping options in `script_integrated.js`
- Set up database webhooks following `WEBHOOK_SETUP.md`
- Create your n8n workflow to process the webhook data
- Monitor and adjust settings as needed

## Troubleshooting

**Database connection fails?**
- Double-check SUPABASE_URL and API keys
- Ensure tables are created correctly

**Webhook not triggering?**
- Verify webhook URL is accessible
- Check n8n webhook configuration
- Review webhook setup in Supabase

**Scraping fails?**
- Enable debug mode: `SCRAPER_DEBUG_MODE=true`
- Check if target site is accessible
- Increase timeout if needed

Need help? Check the full README.md for detailed documentation.