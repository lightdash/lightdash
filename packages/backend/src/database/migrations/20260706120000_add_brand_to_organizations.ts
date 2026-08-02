import { Knex } from 'knex';

const OrganizationsTable = 'organizations';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(OrganizationsTable, 'brand'))) {
        await knex.schema.alterTable(OrganizationsTable, (table) => {
            table.jsonb('brand').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(OrganizationsTable, 'brand')) {
        await knex.schema.alterTable(OrganizationsTable, (table) => {
            table.dropColumn('brand');
        });
    }
}
