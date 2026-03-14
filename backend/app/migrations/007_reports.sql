CREATE TABLE IF NOT EXISTS reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    title text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    quarter text,
    status text NOT NULL DEFAULT 'generating',
    snapshot jsonb,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_account_id_idx ON reports (account_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
