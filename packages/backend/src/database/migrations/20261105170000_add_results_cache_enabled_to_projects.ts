import { Knex } from 'knex';

const ProjectTableName = 'projects';
const ColumnName = 'results_cache_enabled';
const ResultsCacheFlagId = 'results-cache-enabled';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted column and copies the results cache feature flag value into it',
} as const;

const envFlagList = (value: string | undefined): string[] =>
    (value ?? '')
        .split(',')
        .map((flagId) => flagId.trim())
        .filter(Boolean);

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.boolean(ColumnName).notNullable().defaultTo(false);
    });

    // Same precedence the feature flag used, minus user overrides since this is
    // a project setting: env enable list, env disable list, org override, flag
    // default, then RESULTS_CACHE_ENABLED.
    if (
        envFlagList(process.env.LIGHTDASH_ENABLE_FEATURE_FLAGS).includes(
            ResultsCacheFlagId,
        )
    ) {
        await knex(ProjectTableName).update({ [ColumnName]: true });
        return;
    }
    if (
        envFlagList(process.env.LIGHTDASH_DISABLE_FEATURE_FLAGS).includes(
            ResultsCacheFlagId,
        )
    ) {
        return;
    }
    // Matches how the backend parses RESULTS_CACHE_ENABLED
    const envFallback = ['1', 'true'].includes(
        (process.env.RESULTS_CACHE_ENABLED ?? '').trim().toLowerCase(),
    )
        ? 'true'
        : 'false';
    await knex.raw(`
        UPDATE projects p
        SET results_cache_enabled = true
        FROM organizations o
        WHERE p.organization_id = o.organization_id
        AND COALESCE(
            (
                SELECT fo.enabled FROM feature_flag_overrides fo
                WHERE fo.flag_id = '${ResultsCacheFlagId}'
                AND fo.organization_uuid = o.organization_uuid
                AND fo.user_uuid IS NULL
            ),
            (
                SELECT f.default_enabled FROM feature_flags f
                WHERE f.flag_id = '${ResultsCacheFlagId}'
            ),
            ${envFallback}
        )
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
