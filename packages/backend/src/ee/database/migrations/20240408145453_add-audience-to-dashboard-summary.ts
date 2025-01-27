import { Knex } from 'knex';

const DASHBOARD_SUMMARIES_TABLE_NAME = 'dashboard_summaries';
const AudiencesColumnName = 'audiences';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(DASHBOARD_SUMMARIES_TABLE_NAME)) {
        await knex.schema.alterTable(
            DASHBOARD_SUMMARIES_TABLE_NAME,
            (table) => {
                table
                    .specificType(AudiencesColumnName, 'text ARRAY')
                    .notNullable()
                    .defaultTo('{}');
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            DASHBOARD_SUMMARIES_TABLE_NAME,
            AudiencesColumnName,
        )
    ) {
        await knex.schema.alterTable(
            DASHBOARD_SUMMARIES_TABLE_NAME,
            (table) => {
                table.dropColumn(AudiencesColumnName);
            },
        );
    }
}
