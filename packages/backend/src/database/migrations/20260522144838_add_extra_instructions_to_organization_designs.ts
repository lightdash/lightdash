import { Knex } from 'knex';

const OrganizationDesignsTable = 'organization_designs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationDesignsTable, (table) => {
        // Free-text override appended to the agent's effective skill, alongside
        // any uploaded instruction `.md` files. Nullable so existing rows are
        // untouched; empty string and NULL both mean "no extra instructions".
        table.text('extra_instructions').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrganizationDesignsTable, (table) => {
        table.dropColumn('extra_instructions');
    });
}
