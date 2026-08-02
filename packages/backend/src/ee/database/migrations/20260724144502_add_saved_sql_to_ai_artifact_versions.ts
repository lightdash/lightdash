import { Knex } from 'knex';

const AiArtifactVersionsTable = 'ai_artifact_versions';
const SavedSqlTable = 'saved_sql';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiArtifactVersionsTable, (table) => {
        table
            .uuid('saved_sql_uuid')
            .nullable()
            .references('saved_sql_uuid')
            .inTable(SavedSqlTable)
            .onDelete('SET NULL');
        table.index('saved_sql_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiArtifactVersionsTable, (table) => {
        table.dropIndex('saved_sql_uuid');
        table.dropColumn('saved_sql_uuid');
    });
}
