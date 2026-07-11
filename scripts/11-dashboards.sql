-- Dashboards IA (AI dashboard builder): la DEFINICIÓN del dashboard (documento JSON con
-- meta/filters/queries/tree) se persiste; los datos NO (se recalculan ejecutando las
-- queries contra la base en runtime). Ver docs/2026-07-10-plan-ai-dashboards.md.
CREATE TABLE IF NOT EXISTS dashboards (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    document JSONB NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
