import { Knex } from 'knex';

const OrganizationSettingsTableName = 'organization_settings';
const ColumnName = 'data_app_custom_dependencies_enabled';
const CustomDependenciesFlagId = 'enable-data-app-custom-dependencies';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted column to organization_settings and copies the custom data app dependencies feature flag value into it',
} as const;

const envFlagList = (value: string | undefined): string[] =>
    (value ?? '')
        .split(',')
        .map((flagId) => flagId.trim())
        .filter(Boolean);

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(OrganizationSettingsTableName, (table) => {
        table.boolean(ColumnName).notNullable().defaultTo(false);
    });

    // Same precedence the feature flag used, minus user overrides since this
    // is an org setting: env enable list, env disable list, org override,
    // flag default, then off. Orgs without a settings row get one.
    if (
        envFlagList(process.env.LIGHTDASH_ENABLE_FEATURE_FLAGS).includes(
            CustomDependenciesFlagId,
        )
    ) {
        await knex.raw(`
            INSERT INTO organization_settings (organization_uuid, ${ColumnName})
            SELECT o.organization_uuid, true FROM organizations o
            ON CONFLICT (organization_uuid)
            DO UPDATE SET ${ColumnName} = true
        `);
        return;
    }
    if (
        envFlagList(process.env.LIGHTDASH_DISABLE_FEATURE_FLAGS).includes(
            CustomDependenciesFlagId,
        )
    ) {
        return;
    }
    await knex.raw(`
        INSERT INTO organization_settings (organization_uuid, ${ColumnName})
        SELECT o.organization_uuid, true FROM organizations o
        WHERE COALESCE(
            (
                SELECT fo.enabled FROM feature_flag_overrides fo
                WHERE fo.flag_id = '${CustomDependenciesFlagId}'
                AND fo.organization_uuid = o.organization_uuid
                AND fo.user_uuid IS NULL
            ),
            (
                SELECT f.default_enabled FROM feature_flags f
                WHERE f.flag_id = '${CustomDependenciesFlagId}'
            ),
            false
        )
        ON CONFLICT (organization_uuid)
        DO UPDATE SET ${ColumnName} = true
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(OrganizationSettingsTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
