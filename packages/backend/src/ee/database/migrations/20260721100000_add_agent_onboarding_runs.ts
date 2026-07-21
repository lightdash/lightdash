import { Knex } from 'knex';

const AgentOnboardingRunsTableName = 'agent_onboarding_runs';
const ActiveProjectIndexName = 'agent_onboarding_runs_active_project_idx';

// Values frozen at migration time — do not import from @lightdash/common,
// future changes to those constants must not alter this migration
const AGENT_ONBOARDING_RUN_STATUSES = [
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled',
];
const AGENT_ONBOARDING_STAGES = [
    'preparing_project',
    'exploring_warehouse',
    'deploying_semantic_layer',
    'building_dashboard',
    'verifying',
    'handoff',
];

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AgentOnboardingRunsTableName, (table) => {
        table
            .uuid('agent_onboarding_run_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.uuid('created_by_user_uuid').notNullable();
        table
            .text('status')
            .notNullable()
            .defaultTo('queued')
            .checkIn(AGENT_ONBOARDING_RUN_STATUSES);
        table.text('stage').checkIn(AGENT_ONBOARDING_STAGES);
        table.jsonb('events').notNullable().defaultTo('[]');
        table.jsonb('handoff');
        table.jsonb('usage');
        table.jsonb('files').notNullable().defaultTo('[]');
        table.uuid('pat_uuid');
        table.uuid('sandbox_uuid');
        table.text('error_message');
        table.timestamp('cancellation_requested_at', { useTz: false });
        table.timestamp('started_at', { useTz: false });
        table.timestamp('completed_at', { useTz: false });
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['project_uuid', 'created_at']);
        table.index(['status', 'updated_at']);
    });

    await knex.raw(
        `CREATE UNIQUE INDEX ??
        ON ?? (??)
        WHERE status IN ('queued', 'running')`,
        [ActiveProjectIndexName, AgentOnboardingRunsTableName, 'project_uuid'],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(AgentOnboardingRunsTableName);
}
