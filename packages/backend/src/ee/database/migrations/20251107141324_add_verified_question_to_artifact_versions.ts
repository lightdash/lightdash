import { Knex } from 'knex';

const AI_ARTIFACT_VERSIONS_TABLE = 'ai_artifact_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.text('verified_question').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_ARTIFACT_VERSIONS_TABLE, (table) => {
        table.dropColumn('verified_question');
    });
}
