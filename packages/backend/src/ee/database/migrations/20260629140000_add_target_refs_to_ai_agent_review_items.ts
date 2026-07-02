import { Knex } from 'knex';

const TABLE = 'ai_agent_review_item';
const COLUMN = 'target_refs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE, (table) => {
        table.jsonb(COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE, (table) => {
        table.dropColumn(COLUMN);
    });
}
