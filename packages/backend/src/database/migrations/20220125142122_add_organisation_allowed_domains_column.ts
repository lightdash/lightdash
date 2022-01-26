import { Knex } from 'knex';

const OrganisationTableName = 'organizations';
const AllowedEmailDomainsColumnName = 'allowed_email_domains';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(OrganisationTableName, (table) => {
        table
            .jsonb(AllowedEmailDomainsColumnName)
            .notNullable()
            .defaultTo(JSON.stringify([]));
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            OrganisationTableName,
            AllowedEmailDomainsColumnName,
        )
    ) {
        await knex.schema.table(OrganisationTableName, (table) => {
            table.dropColumn(AllowedEmailDomainsColumnName);
        });
    }
}
