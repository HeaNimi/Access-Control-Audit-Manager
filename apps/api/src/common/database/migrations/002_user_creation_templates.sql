BEGIN;

SET search_path TO acma_schema, public;

CREATE TABLE IF NOT EXISTS user_creation_template (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    template_version INTEGER NOT NULL DEFAULT 1,
    ou_distinguished_name TEXT,
    enabled_default BOOLEAN,
    account_expires_offset_days INTEGER,
    description_template TEXT,
    upn_suffix TEXT,
    mail_domain TEXT,
    created_by_user_id UUID REFERENCES "system_user"(user_id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES "system_user"(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_creation_template_name_chk CHECK (length(trim(template_name)) > 0),
    CONSTRAINT user_creation_template_version_chk CHECK (template_version >= 1),
    CONSTRAINT user_creation_template_expiry_offset_chk CHECK (
        account_expires_offset_days IS NULL OR account_expires_offset_days > 0
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_creation_template_name_lower
    ON user_creation_template (lower(template_name));

CREATE INDEX IF NOT EXISTS idx_user_creation_template_active_sort
    ON user_creation_template (is_active, sort_order, template_name);

CREATE TABLE IF NOT EXISTS user_creation_template_group (
    template_group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES user_creation_template(template_id) ON DELETE CASCADE,
    group_distinguished_name TEXT NOT NULL,
    group_sam_account_name TEXT,
    group_display_name TEXT,
    group_object_guid TEXT,
    group_object_sid TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_creation_template_group_dn_chk CHECK (length(trim(group_distinguished_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_creation_template_group_dn_lower
    ON user_creation_template_group (template_id, lower(group_distinguished_name));

CREATE INDEX IF NOT EXISTS idx_user_creation_template_group_template_sort
    ON user_creation_template_group (template_id, sort_order, group_display_name);

COMMENT ON TABLE user_creation_template IS
    'Administrator configured editable defaults for user creation requests.';

COMMENT ON TABLE user_creation_template_group IS
    'Initial group defaults attached to a user creation template.';

COMMIT;
