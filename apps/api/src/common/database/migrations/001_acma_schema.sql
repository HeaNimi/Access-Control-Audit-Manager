BEGIN;

CREATE SCHEMA IF NOT EXISTS acma_schema;
SET search_path TO acma_schema, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "system_user" (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ad_object_guid UUID,
    ad_object_sid TEXT,
    distinguished_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role (
    role_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_role (
    user_id UUID NOT NULL REFERENCES "system_user"(user_id) ON DELETE CASCADE,
    role_id SMALLINT NOT NULL REFERENCES role(role_id) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS change_request (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    request_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    title TEXT NOT NULL,
    justification TEXT NOT NULL,
    requester_user_id UUID NOT NULL REFERENCES "system_user"(user_id) ON DELETE RESTRICT,
    target_object_type TEXT,
    target_object_guid UUID,
    target_object_sid TEXT,
    target_distinguished_name TEXT,
    target_sam_account_name TEXT,
    target_display_name TEXT,
    request_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    CONSTRAINT change_request_timestamps_chk CHECK (
        approved_at IS NULL OR approved_at >= submitted_at
    ),
    CONSTRAINT change_request_type_chk CHECK (
        request_type IN (
            'user_create',
            'account_change',
            'group_change',
            'account_update',
            'group_membership_add',
            'group_membership_remove'
        )
    ),
    CONSTRAINT change_request_status_chk CHECK (
        status IN (
            'draft',
            'submitted',
            'approved',
            'rejected',
            'executing',
            'executed',
            'failed',
            'closed'
        )
    )
);

CREATE TABLE IF NOT EXISTS request_approval (
    approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES change_request(request_id) ON DELETE CASCADE,
    approver_user_id UUID NOT NULL REFERENCES "system_user"(user_id) ON DELETE RESTRICT,
    approval_step SMALLINT NOT NULL DEFAULT 1,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    decision TEXT,
    decision_comment TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (request_id, approver_user_id, approval_step),
    CONSTRAINT request_approval_decision_chk CHECK (
        (decision IS NULL AND decided_at IS NULL)
        OR (decision IS NOT NULL AND decided_at IS NOT NULL)
    ),
    CONSTRAINT request_approval_decision_value_chk CHECK (
        decision IS NULL OR decision IN ('approved', 'rejected')
    )
);

CREATE TABLE IF NOT EXISTS request_execution (
    execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL UNIQUE REFERENCES change_request(request_id) ON DELETE CASCADE,
    execution_status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    execution_result JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT request_execution_status_chk CHECK (
        execution_status IN ('executing', 'executed', 'failed', 'cancelled')
    ),
    CONSTRAINT request_execution_time_chk CHECK (
        finished_at IS NULL OR finished_at >= started_at
    )
);

CREATE TABLE IF NOT EXISTS audit_log (
    audit_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id UUID,
    actor_user_id UUID,
    actor_username TEXT,
    actor_role TEXT NOT NULL DEFAULT 'system',
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    message TEXT,
    event_details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS observed_event (
    observed_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_source TEXT NOT NULL,
    source_system TEXT NOT NULL,
    source_reference TEXT,
    event_id INTEGER,
    event_time TIMESTAMPTZ NOT NULL,
    event_type TEXT,
    title TEXT,
    message TEXT,
    object_guid UUID,
    distinguished_name TEXT,
    sam_account_name TEXT,
    subject_account_name TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE NULLS NOT DISTINCT (event_source, source_system, source_reference)
);

CREATE TABLE IF NOT EXISTS event_correlation (
    correlation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES change_request(request_id) ON DELETE CASCADE,
    audit_log_id BIGINT REFERENCES audit_log(audit_log_id) ON DELETE CASCADE,
    observed_event_id BIGINT REFERENCES observed_event(observed_event_id) ON DELETE CASCADE,
    note TEXT,
    correlated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT event_correlation_target_chk CHECK (
        (CASE WHEN audit_log_id IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN observed_event_id IS NULL THEN 0 ELSE 1 END) >= 1
    )
);

CREATE TABLE IF NOT EXISTS siem_source_checkpoint (
    source_key TEXT PRIMARY KEY,
    driver_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_event_time TIMESTAMPTZ,
    last_sort JSONB,
    last_source_reference TEXT,
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO role (role_code, description)
VALUES
    ('requester', 'Can create and submit change requests'),
    ('approver', 'Can approve or reject change requests'),
    ('auditor', 'Can inspect audit history and reports'),
    ('administrator', 'Can manage system configuration and users')
ON CONFLICT (role_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_change_request_status
    ON change_request (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_change_request_requester
    ON change_request (requester_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_approval_request
    ON request_approval (request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_request_execution_request
    ON request_execution (request_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_request
    ON audit_log (request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_observed_event_time
    ON observed_event (event_time DESC);

CREATE INDEX IF NOT EXISTS idx_observed_event_object
    ON observed_event (object_guid, distinguished_name, sam_account_name, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_event_correlation_request
    ON event_correlation (request_id, correlated_at DESC);

CREATE INDEX IF NOT EXISTS idx_siem_source_checkpoint_driver
    ON siem_source_checkpoint (driver_key, enabled);

CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Append-only table % cannot be %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_observed_event_append_only ON observed_event;
CREATE TRIGGER trg_observed_event_append_only
BEFORE UPDATE OR DELETE ON observed_event
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

COMMENT ON SCHEMA acma_schema IS
    'Schema for the thesis prototype that correlates request, approval, execution and AD audit events.';

COMMENT ON TABLE change_request IS
    'Business request that carries the reason, target object and intended AD change.';

COMMENT ON TABLE request_approval IS
    'Approval records for one or more approvers per request.';

COMMENT ON TABLE request_execution IS
    'Technical execution result for an approved request executed automatically by the system.';

COMMENT ON TABLE audit_log IS
    'Append-only application-side audit events.';

COMMENT ON TABLE observed_event IS
    'Observed technical or external events, including Active Directory logs and SIEM alerts.';

COMMENT ON TABLE event_correlation IS
    'Correlation table that links requests to application logs and observed events.';

COMMENT ON TABLE siem_source_checkpoint IS
    'Mutable checkpoint state for pull-based SIEM integrations.';

COMMIT;
