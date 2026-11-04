import { Knex } from 'knex';

const AI_THREAD_TABLE = 'ai_thread';
const BOUND_ENTITY_TYPE_COLUMN = 'bound_entity_type';
const BOUND_ENTITY_UUID_COLUMN = 'bound_entity_uuid';
const THREAD_CONTEXT_COLUMN = 'thread_context';
const BINDING_CHECK = 'ai_thread_binding_complete_check';

export const classification = {
    kind: 'safe',
    reason: 'Adds three nullable columns to ai_thread and a check that the two binding columns are set together. Existing threads stay unbound with no context, and older releases never read or write these columns.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (
            !(await knex.schema.hasColumn(
                AI_THREAD_TABLE,
                BOUND_ENTITY_TYPE_COLUMN,
            ))
        ) {
            await knex.schema.alterTable(AI_THREAD_TABLE, (table) => {
                table.text(BOUND_ENTITY_TYPE_COLUMN).nullable();
                // No FK: a permanently deleted resource must leave the thread bound (fail closed), not unbound.
                table.uuid(BOUND_ENTITY_UUID_COLUMN).nullable();
            });
        }
        if (
            !(await knex.schema.hasColumn(
                AI_THREAD_TABLE,
                THREAD_CONTEXT_COLUMN,
            ))
        ) {
            await knex.schema.alterTable(AI_THREAD_TABLE, (table) => {
                table.text(THREAD_CONTEXT_COLUMN).nullable();
            });
        }
        await knex.raw(
            `ALTER TABLE ${AI_THREAD_TABLE} DROP CONSTRAINT IF EXISTS ${BINDING_CHECK}`,
        );
        await knex.raw(
            `ALTER TABLE ${AI_THREAD_TABLE} ADD CONSTRAINT ${BINDING_CHECK} CHECK ((${BOUND_ENTITY_TYPE_COLUMN} IS NULL) = (${BOUND_ENTITY_UUID_COLUMN} IS NULL)) NOT VALID`,
        );
        await knex.raw(
            `ALTER TABLE ${AI_THREAD_TABLE} VALIDATE CONSTRAINT ${BINDING_CHECK}`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.raw(
            `ALTER TABLE ${AI_THREAD_TABLE} DROP CONSTRAINT IF EXISTS ${BINDING_CHECK}`,
        );
        await knex.schema.alterTable(AI_THREAD_TABLE, (table) => {
            table.dropColumn(THREAD_CONTEXT_COLUMN);
            table.dropColumn(BOUND_ENTITY_UUID_COLUMN);
            table.dropColumn(BOUND_ENTITY_TYPE_COLUMN);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
