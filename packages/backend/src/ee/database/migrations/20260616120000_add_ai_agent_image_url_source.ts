import { Knex } from 'knex';

const AiAgentTableName = 'ai_agent';
const ColumnName = 'image_url_source';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AiAgentTableName, ColumnName)) return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.text(ColumnName).nullable();
    });

    // Existing avatars are user-provided URLs (uploads did not exist yet).
    await knex(AiAgentTableName)
        .whereNotNull('image_url')
        .update(ColumnName, 'url');
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(AiAgentTableName, ColumnName))) return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
