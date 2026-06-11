import { Knex } from 'knex';

const remediationTable = 'ai_agent_review_remediation';
const reviewItemTable = 'ai_agent_review_item';
const turnSignalTable = 'ai_agent_review_turn_signal';
const organizationsTable = 'organizations';
const projectsTable = 'projects';
const aiAgentTable = 'ai_agent';
const aiThreadTable = 'ai_thread';
const aiPromptTable = 'ai_prompt';
const pullRequestsTable = 'pull_requests';
const usersTable = 'users';
const activeRemediationIndex =
    'ai_agent_review_remediation_active_fingerprint_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(remediationTable, (table) => {
        table
            .uuid('ai_agent_review_remediation_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .text('fingerprint')
            .notNullable()
            .references('fingerprint')
            .inTable(reviewItemTable)
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(organizationsTable)
            .onDelete('CASCADE');
        table
            .uuid('source_ai_agent_review_turn_signal_uuid')
            .notNullable()
            .references('ai_agent_review_turn_signal_uuid')
            .inTable(turnSignalTable)
            .onDelete('CASCADE');
        table
            .uuid('source_prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable(aiPromptTable)
            .onDelete('CASCADE');
        table
            .uuid('source_thread_uuid')
            .notNullable()
            .references('ai_thread_uuid')
            .inTable(aiThreadTable)
            .onDelete('CASCADE');
        table
            .uuid('source_project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(projectsTable)
            .onDelete('CASCADE');
        table
            .uuid('source_agent_uuid')
            .notNullable()
            .references('ai_agent_uuid')
            .inTable(aiAgentTable)
            .onDelete('CASCADE');
        table
            .uuid('pull_request_uuid')
            .nullable()
            .references('pull_request_uuid')
            .inTable(pullRequestsTable)
            .onDelete('SET NULL');
        table
            .uuid('preview_project_uuid')
            .nullable()
            .references('project_uuid')
            .inTable(projectsTable)
            .onDelete('SET NULL');
        table
            .uuid('preview_agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable(aiAgentTable)
            .onDelete('SET NULL');
        table
            .uuid('preview_thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable(aiThreadTable)
            .onDelete('SET NULL');
        table
            .text('status')
            .notNullable()
            .defaultTo('queued')
            .checkIn([
                'queued',
                'running',
                'pr_open',
                'preview_ready',
                'resolved',
                'failed',
            ]);
        table.text('error_message').nullable();
        table.text('retry_prompt').nullable();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('SET NULL');
        table
            .uuid('resolved_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('SET NULL');
        table.timestamp('resolved_at', { useTz: false }).nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['organization_uuid', 'status']);
        table.index(['fingerprint']);
        table.index(['pull_request_uuid']);
        table.index(['preview_project_uuid']);
        table.index(['preview_thread_uuid']);
    });

    await knex.raw(
        `CREATE UNIQUE INDEX ${activeRemediationIndex}
            ON ${remediationTable} (fingerprint)
            WHERE status IN ('queued', 'running', 'pr_open', 'preview_ready')`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS ${activeRemediationIndex}`);
    await knex.schema.dropTableIfExists(remediationTable);
}
