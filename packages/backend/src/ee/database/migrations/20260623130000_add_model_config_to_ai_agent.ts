import { Knex } from 'knex';
import { AiAgentTableName } from '../entities/aiAgent';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.jsonb('model_config').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropColumn('model_config');
    });
}
