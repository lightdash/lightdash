import { Knex } from 'knex';

const OrganizationsTableName = 'organizations';
const IsSetupCompleteColumnName = 'is_setup_complete';
const DefaultOrganizationName = 'My organization';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted boolean to the small organizations table and names the few blank organizations',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.alterTable(OrganizationsTableName, (table) => {
        table.boolean(IsSetupCompleteColumnName).notNullable().defaultTo(false);
    });

    await knex(OrganizationsTableName)
        .whereNot('organization_name', '')
        .update({ [IsSetupCompleteColumnName]: true });

    // Blank names were the old "not set up yet" signal; the flag now carries it.
    await knex(OrganizationsTableName)
        .where('organization_name', '')
        .update({ organization_name: DefaultOrganizationName });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.alterTable(OrganizationsTableName, (table) => {
        table.dropColumn(IsSetupCompleteColumnName);
    });
}
