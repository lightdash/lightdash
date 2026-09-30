import { type Knex } from 'knex';

const DocumentsTableName = 'documents';
// Prefixed so the names stay unambiguous next to dashboards and
// saved_queries, which have their own views_count and first_viewed_at.
const ViewsCountColumn = 'document_views_count';
const FirstViewedAtColumn = 'document_first_viewed_at';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table.integer(ViewsCountColumn).notNullable().defaultTo(0);
        table.timestamp(FirstViewedAtColumn, { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DocumentsTableName, (table) => {
        table.dropColumn(FirstViewedAtColumn);
        table.dropColumn(ViewsCountColumn);
    });
}
