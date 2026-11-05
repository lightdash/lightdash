import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty table linking Document versions to the saved charts they reference, without reading or rewriting existing rows',
} as const;

const DOCUMENT_VERSION_SAVED_CHARTS_TABLE = 'document_version_saved_charts';
const DOCUMENT_VERSIONS_TABLE = 'document_versions';
const SAVED_QUERIES_TABLE = 'saved_queries';
const SAVED_SQL_TABLE = 'saved_sql';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.createTable(
        DOCUMENT_VERSION_SAVED_CHARTS_TABLE,
        (table) => {
            table
                .uuid('document_version_saved_chart_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('document_version_uuid')
                .notNullable()
                .references('document_version_uuid')
                .inTable(DOCUMENT_VERSIONS_TABLE)
                .onDelete('CASCADE')
                .index();
            // A permanently deleted chart drops its links; the Document keeps the tag
            table
                .uuid('saved_query_uuid')
                .nullable()
                .references('saved_query_uuid')
                .inTable(SAVED_QUERIES_TABLE)
                .onDelete('CASCADE')
                .index();
            table
                .uuid('saved_sql_uuid')
                .nullable()
                .references('saved_sql_uuid')
                .inTable(SAVED_SQL_TABLE)
                .onDelete('CASCADE')
                .index();
            table.check(
                '(?? IS NULL) <> (?? IS NULL)',
                ['saved_query_uuid', 'saved_sql_uuid'],
                'document_version_saved_charts_one_chart',
            );
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.dropTable(DOCUMENT_VERSION_SAVED_CHARTS_TABLE);
}
