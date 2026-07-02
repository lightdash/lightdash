import { Knex } from 'knex';

const TABLE = 'scheduler_ai_augmentation';
const SCHEDULER_TABLE = 'scheduler';
const AI_AGENT_TABLE = 'ai_agent';
const AI_THREAD_TABLE = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(TABLE)) return;

    await knex.schema.createTable(TABLE, (table) => {
        table
            .uuid('scheduler_uuid')
            .primary()
            .references('scheduler_uuid')
            .inTable(SCHEDULER_TABLE)
            .onDelete('CASCADE');

        table.text('augmentation_type').notNullable();

        table.text('prompt').notNullable();

        table
            .uuid('agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable(AI_AGENT_TABLE)
            .onDelete('CASCADE')
            .index();

        table
            .uuid('source_thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable(AI_THREAD_TABLE)
            .onDelete('SET NULL')
            .index();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    // agent mode requires an agent; fast_model mode carries neither an agent
    // nor a pinned thread. A deleted agent CASCADE-removes the whole row, so an
    // 'agent' row can never be left agent-less.
    await knex.raw(`
        ALTER TABLE ${TABLE}
        ADD CONSTRAINT scheduler_ai_augmentation_shape CHECK (
            (augmentation_type = 'agent' AND agent_uuid IS NOT NULL)
            OR
            (augmentation_type = 'fast_model'
                AND agent_uuid IS NULL
                AND source_thread_uuid IS NULL)
        )
    `);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(TABLE))) return;
    await knex.schema.dropTable(TABLE);
}
