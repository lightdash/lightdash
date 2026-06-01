import { Knex } from 'knex';
import { AiAgentTableName } from '../entities/aiAgent';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.boolean('enable_content_tools').defaultTo(false).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropColumn('enable_content_tools');
    });
}
