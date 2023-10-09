import { Knex } from 'knex';

const OrganizationTableName = 'organizations';
const AllowedEmailDomainsColumnName = 'allowed_email_domains';

export async function up(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            OrganizationTableName,
            AllowedEmailDomainsColumnName,
        )
    ) {
        await knex.schema.table(OrganizationTableName, (table) => {
            table.dropColumn(AllowedEmailDomainsColumnName);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(OrganizationTableName, (table) => {
        table
            .jsonb(AllowedEmailDomainsColumnName)
            .notNullable()
            .defaultTo(JSON.stringify([]));
    });
}
