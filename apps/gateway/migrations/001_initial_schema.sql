
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE upstream_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    credentials JSONB,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    upstream_id TEXT REFERENCES upstream_servers(id) ON DELETE SET NULL,
    tool_name TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'error')),
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_upstream_servers_enabled
    ON upstream_servers(enabled);

CREATE INDEX idx_api_keys_user_id
    ON api_keys(user_id);

CREATE INDEX idx_api_keys_active
    ON api_keys(user_id, created_at)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_audit_logs_created_at
    ON audit_logs(created_at DESC);

CREATE INDEX idx_audit_logs_user_created
    ON audit_logs(user_id, created_at DESC);

CREATE INDEX idx_audit_logs_upstream_created
    ON audit_logs(upstream_id, created_at DESC);
