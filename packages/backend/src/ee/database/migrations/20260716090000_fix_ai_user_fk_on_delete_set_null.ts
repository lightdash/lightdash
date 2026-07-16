import { Knex } from 'knex';

const AI_PROMPT_INTERRUPT_TABLE_NAME = 'ai_prompt_interrupt';
const AI_THREAD_SHARE_TABLE_NAME = 'ai_thread_share';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_PROMPT_INTERRUPT_TABLE_NAME, (table) => {
        table.dropForeign(['created_by_user_uuid']);
    });

    await knex.schema.alterTable(AI_PROMPT_INTERRUPT_TABLE_NAME, (table) => {
        table.uuid('created_by_user_uuid').nullable().alter();
        table
            .foreign('created_by_user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
    });

    await knex.schema.alterTable(AI_THREAD_SHARE_TABLE_NAME, (table) => {
        table.dropForeign(['created_by_user_uuid']);
    });

    await knex.schema.alterTable(AI_THREAD_SHARE_TABLE_NAME, (table) => {
        table.uuid('created_by_user_uuid').nullable().alter();
        table
            .foreign('created_by_user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
    });
}

export async function down(): Promise<void> {
    // This migration fixes foreign key constraints that prevented user deletion.
    // Rolling back would restore the broken state (and could fail on NULL values),
    // so no rollback is provided for this bug fix.
}
