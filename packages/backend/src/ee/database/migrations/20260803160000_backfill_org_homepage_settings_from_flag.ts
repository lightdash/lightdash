import { Knex } from 'knex';

const OrganizationHomepageSettingsTableName = 'organization_homepage_settings';
const FeatureFlagOverridesTableName = 'feature_flag_overrides';

/**
 * Orgs enabled via the homepage-builder flag override get an explicit
 * settings row, so their enablement survives the flag's eventual removal and
 * the in-product switch-back control works for them. `opening` stays NULL
 * (auto), which is exactly the behaviour they already have. Additive and
 * idempotent: existing settings rows are never touched.
 */
export async function up(knex: Knex): Promise<void> {
    const hasSettings = await knex.schema.hasTable(
        OrganizationHomepageSettingsTableName,
    );
    const hasOverrides = await knex.schema.hasTable(
        FeatureFlagOverridesTableName,
    );
    if (!hasSettings || !hasOverrides) return;

    await knex.raw(`
        INSERT INTO ${OrganizationHomepageSettingsTableName} (organization_uuid, enabled, opening)
        SELECT DISTINCT ffo.organization_uuid, true, NULL
        FROM ${FeatureFlagOverridesTableName} ffo
        JOIN organizations o ON o.organization_uuid = ffo.organization_uuid
        WHERE ffo.flag_id = 'homepage-builder'
          AND ffo.enabled = true
          AND ffo.organization_uuid IS NOT NULL
        ON CONFLICT (organization_uuid) DO NOTHING
    `);
}

export async function down(): Promise<void> {
    // Backfilled rows are indistinguishable from explicit opt-ins by the time
    // a rollback would run, and deleting them would turn the homepage off for
    // real orgs. The flag override still enables those orgs either way.
}
