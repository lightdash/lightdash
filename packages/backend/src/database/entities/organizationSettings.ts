import { Knex } from 'knex';

export const OrganizationSettingsTableName = 'organization_settings';

/**
 * Per-organization settings migrated from instance-wide env vars. One row per
 * organization (keyed by `organization_uuid`); absence of a row means every
 * setting takes its default. Designed to grow as more Pro settings move
 * org-level.
 */
export type DbOrganizationSettings = {
    organization_uuid: string;
    // Nullable: NULL means "not set — inherit the instance default".
    oidc_linking_enabled: boolean | null;
    oidc_to_email_linking_enabled: boolean | null;
    // Per-org consent for the Lightdash support team to impersonate users.
    // Opt-in only, no env default: NULL/absent is treated as false.
    support_impersonation_enabled: boolean | null;
    // Per-org base override (seconds) for scheduled-delivery download link
    // expiry. NULL/absent inherits PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS.
    scheduled_delivery_expiration_seconds: number | null;
    // Per-channel overrides (seconds); NULL/absent inherits the base above.
    scheduled_delivery_expiration_seconds_email: number | null;
    scheduled_delivery_expiration_seconds_slack: number | null;
    scheduled_delivery_expiration_seconds_msteams: number | null;
    scheduled_delivery_expiration_seconds_googlechat: number | null;
    // Per-org export limits; NULL/absent inherits the instance env defaults
    // (LIGHTDASH_QUERY_MAX_LIMIT / LIGHTDASH_CSV_CELLS_LIMIT).
    query_max_limit: number | null;
    csv_cells_limit: number | null;
    created_at: Date;
    updated_at: Date;
};

// The actual settings columns — everything except the key and timestamps.
// Derived from `DbOrganizationSettings` so adding a setting column flows into
// the insert/update types automatically (no extra edits here).
export type DbOrganizationSettingsColumns = Omit<
    DbOrganizationSettings,
    'organization_uuid' | 'created_at' | 'updated_at'
>;

type DbOrganizationSettingsInsert = Pick<
    DbOrganizationSettings,
    'organization_uuid'
> &
    Partial<DbOrganizationSettingsColumns>;

export type OrganizationSettingsTable = Knex.CompositeTableType<
    DbOrganizationSettings,
    DbOrganizationSettingsInsert,
    Partial<
        DbOrganizationSettingsColumns &
            Pick<DbOrganizationSettings, 'updated_at'>
    >
>;
