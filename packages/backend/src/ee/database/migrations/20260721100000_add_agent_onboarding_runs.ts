import {
    AGENT_ONBOARDING_ACTIVE_STATUSES,
    AGENT_ONBOARDING_RUN_STATUSES,
    AGENT_ONBOARDING_STAGES,
} from '@lightdash/common';
import { Knex } from 'knex';

const AgentOnboardingRunsTableName = 'agent_onboarding_runs';
const ActiveProjectIndexName = 'agent_onboarding_runs_active_project_idx';

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
            .checkIn([...AGENT_ONBOARDING_RUN_STATUSES]);
        table.text('stage').checkIn([...AGENT_ONBOARDING_STAGES]);
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

    const activeStatuses = AGENT_ONBOARDING_ACTIVE_STATUSES.map(
        (status) => `'${status}'`,
    ).join(', ');
    await knex.raw(`
        CREATE UNIQUE INDEX ${ActiveProjectIndexName}
        ON ${AgentOnboardingRunsTableName} (project_uuid)
        WHERE status IN (${activeStatuses})
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(AgentOnboardingRunsTableName);
}
