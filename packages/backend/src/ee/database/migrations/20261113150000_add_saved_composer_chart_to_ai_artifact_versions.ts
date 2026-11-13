import { Knex } from 'knex';

const AiArtifactVersionsTable = 'ai_artifact_versions';
const ComposerChartsTable = 'composer_charts';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.schema.alterTable(AiArtifactVersionsTable, (table) => {
        table
            .uuid('saved_composer_chart_uuid')
            .nullable()
            .references('composer_chart_uuid')
            .inTable(ComposerChartsTable)
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.schema.alterTable(AiArtifactVersionsTable, (table) => {
        table.dropColumn('saved_composer_chart_uuid');
    });
}
