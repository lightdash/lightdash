import { Knex } from 'knex';

const PROJECT_TABLE_NAME = 'projects';
const AI_THREAD_TABLE_NAME = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(AI_THREAD_TABLE_NAME, (table) => {
        table
            .uuid('project_uuid')
            .references('project_uuid')
            .inTable(PROJECT_TABLE_NAME)
            .onDelete('CASCADE');
    });

    // Add project_uuid to existing AI threads
    if (process.env.AI_COPILOT_ALLOWED_PROJECT_UUID) {
        await knex(AI_THREAD_TABLE_NAME).update({
            project_uuid: process.env.AI_COPILOT_ALLOWED_PROJECT_UUID,
        });
    }

    await knex.schema.table(AI_THREAD_TABLE_NAME, (table) => {
        table.uuid('project_uuid').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(AI_THREAD_TABLE_NAME, (table) => {
        table.dropColumn('project_uuid');
    });
}
