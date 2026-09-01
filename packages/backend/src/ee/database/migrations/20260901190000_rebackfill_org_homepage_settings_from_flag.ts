import { Knex } from 'knex';

const OrganizationHomepageSettingsTableName = 'organization_homepage_settings';
const FeatureFlagOverridesTableName = 'feature_flag_overrides';
const HomepagesTableName = 'homepages';

/**
 * The Aug 3 backfill only copied org-scoped `homepage-builder` overrides that
 * existed when it ran. Enablement after that date, user-scoped overrides, and
 * orgs that already have homepage rows were left on the flag path. Removing
 * the flag without this pass would send those orgs back to the classic
 * homepage even though they already had v2.
 *
 * Existing settings rows are never updated — an explicit UI opt-out stays
 * opted out.
 */
export const classification = {
    kind: 'safe',
    reason:
        'Idempotent insert of missing organization_homepage_settings rows from leftover homepage-builder flag overrides and existing homepage content. Existing settings rows are not updated.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw('SET LOCAL statement_timeout = 0');

    const hasSettings = await knex.schema.hasTable(
        OrganizationHomepageSettingsTableName,
    );
    const hasOverrides = await knex.schema.hasTable(
        FeatureFlagOverridesTableName,
    );
    const hasHomepages = await knex.schema.hasTable(HomepagesTableName);
    if (!hasSettings) return;

    if (hasOverrides) {
        // Org-scoped overrides, including those written after Aug 3.
        await knex.raw(`
            INSERT INTO ${OrganizationHomepageSettingsTableName} (organization_uuid, enabled, opening)
            SELECT DISTINCT ffo.organization_uuid, true, NULL
            FROM ${FeatureFlagOverridesTableName} ffo
            JOIN organizations o ON o.organization_uuid = ffo.organization_uuid
            WHERE ffo.flag_id = 'homepage-builder'
              AND ffo.enabled = true
              AND ffo.organization_uuid IS NOT NULL
              AND ffo.user_uuid IS NULL
            ON CONFLICT (organization_uuid) DO NOTHING
        `);

        // User-scoped overrides with no org uuid: enable each org the user
        // belongs to. Overrides that already stored organization_uuid were
        // covered above.
        await knex.raw(`
            INSERT INTO ${OrganizationHomepageSettingsTableName} (organization_uuid, enabled, opening)
            SELECT DISTINCT o.organization_uuid, true, NULL
            FROM ${FeatureFlagOverridesTableName} ffo
            JOIN users u ON u.user_uuid = ffo.user_uuid
            JOIN organization_memberships om ON om.user_id = u.user_id
            JOIN organizations o ON o.organization_id = om.organization_id
            WHERE ffo.flag_id = 'homepage-builder'
              AND ffo.enabled = true
              AND ffo.user_uuid IS NOT NULL
              AND ffo.organization_uuid IS NULL
            ON CONFLICT (organization_uuid) DO NOTHING
        `);
    }

    if (hasHomepages) {
        await knex.raw(`
            INSERT INTO ${OrganizationHomepageSettingsTableName} (organization_uuid, enabled, opening)
            SELECT DISTINCT o.organization_uuid, true, NULL
            FROM ${HomepagesTableName} h
            JOIN projects p ON p.project_uuid = h.project_uuid
            JOIN organizations o ON o.organization_id = p.organization_id
            ON CONFLICT (organization_uuid) DO NOTHING
        `);
    }
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: cannot distinguish remigrated homepage settings from later opt-ins',
    );
}
