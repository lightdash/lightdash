import { Knex } from 'knex';

const AiAgentMemoryConsolidationRunTableName =
    'ai_agent_memory_consolidation_run';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        AiAgentMemoryConsolidationRunTableName,
        (table) => {
            table
                .uuid('ai_agent_memory_consolidation_run_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            // The partition owner. Run history is meaningless without one, so it
            // is dropped with the user rather than orphaned.
            table
                .uuid('user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE')
                .index();
            table.text('status').notNullable();
            table.text('prompt_hash').notNullable();
            table.text('input_hash').notNullable();
            table.integer('input_count').notNullable().defaultTo(0);
            table.integer('applied_count').notNullable().defaultTo(0);
            table.integer('rejected_count').notNullable().defaultTo(0);
            table.jsonb('applied_operations').notNullable().defaultTo('[]');
            table.jsonb('rejected_operations').notNullable().defaultTo('[]');
            table.text('error_message').nullable();
            table.timestamp('consolidated_up_to', { useTz: false }).nullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );
    // The skip predicate reads the newest run for one (project, owner).
    await knex.raw(`
        CREATE INDEX ai_agent_memory_consolidation_run_partition
        ON ${AiAgentMemoryConsolidationRunTableName} (project_uuid, user_uuid, created_at DESC)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentMemoryConsolidationRunTableName);
}
