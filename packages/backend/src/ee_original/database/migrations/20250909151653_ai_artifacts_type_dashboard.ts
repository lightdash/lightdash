import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table('ai_artifact_versions', (table) => {
        table.json('dashboard_config').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table('ai_artifact_versions', (table) => {
        table.dropColumn('dashboard_config');
    });
}
