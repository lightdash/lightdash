import { type Knex } from 'knex';

const ManagedAgentRunsTableName = 'managed_agent_runs';
const ManagedAgentActionsTableName = 'managed_agent_actions';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable(ManagedAgentRunsTableName, (table) => {
        table
            .uuid('managed_agent_run_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('triggered_by').notNullable();
        table.text('status').notNullable();
        table.text('session_id').nullable();
        table
            .timestamp('started_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('finished_at', { useTz: false }).nullable();
        table.integer('action_count').notNullable().defaultTo(0);
        table.text('summary').nullable();
        table.text('error').nullable();
        table.text('current_activity').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.raw(`
        CREATE INDEX managed_agent_runs_project_started_idx
        ON ${ManagedAgentRunsTableName} (project_uuid, started_at DESC)
    `);

    await knex.raw(`
        CREATE INDEX managed_agent_runs_active_idx
        ON ${ManagedAgentRunsTableName} (project_uuid)
        WHERE status = 'started'
    `);

    await knex.schema.alterTable(ManagedAgentActionsTableName, (table) => {
        table
            .uuid('managed_agent_run_uuid')
            .nullable()
            .references('managed_agent_run_uuid')
            .inTable(ManagedAgentRunsTableName)
            .onDelete('SET NULL');
    });

    await knex.raw(`
        CREATE INDEX managed_agent_actions_run_idx
        ON ${ManagedAgentActionsTableName} (managed_agent_run_uuid)
        WHERE managed_agent_run_uuid IS NOT NULL
    `);
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable(ManagedAgentActionsTableName, (table) => {
        table.dropColumn('managed_agent_run_uuid');
    });
    await knex.schema.dropTableIfExists(ManagedAgentRunsTableName);
};
