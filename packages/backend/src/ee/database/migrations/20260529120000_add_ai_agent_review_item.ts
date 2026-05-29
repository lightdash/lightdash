import { Knex } from 'knex';

const reviewItemTable = 'ai_agent_review_item';

const organizationsTable = 'organizations';
const projectsTable = 'projects';
const aiAgentTable = 'ai_agent';
const usersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(reviewItemTable, (table) => {
        table
            .uuid('ai_agent_review_item_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        // Stable dedup key from getAiAgentReviewItemFingerprint (folds scope into the hash).
        table.text('fingerprint').notNullable().unique();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(organizationsTable)
            .onDelete('CASCADE');
        table
            .uuid('project_uuid')
            .nullable()
            .references('project_uuid')
            .inTable(projectsTable)
            .onDelete('CASCADE');
        table
            .uuid('agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable(aiAgentTable)
            .onDelete('CASCADE');
        table
            .text('status')
            .notNullable()
            .defaultTo('open')
            .checkIn([
                'open',
                'in_progress',
                'resolved',
                'dismissed',
                'duplicate',
            ]);
        table
            .text('dismissed_reason')
            .nullable()
            .checkIn([
                'not_actionable',
                'expected_behavior',
                'duplicate',
                'low_confidence',
                'other',
            ]);
        table
            .uuid('assigned_to_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('SET NULL');
        table.text('linked_issue_url').nullable();
        table.text('linked_pr_url').nullable();
        // Set when a writeback PR is opened (PR3); decoupled from the writeback schema, no FK.
        table.uuid('pr_writeback_thread_uuid').nullable();
        // Reconciled from GitHub on read (PR4).
        table.text('pr_state').nullable().checkIn(['open', 'merged', 'closed']);
        table.timestamp('status_updated_at', { useTz: false }).nullable();
        table
            .uuid('status_updated_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['organization_uuid', 'status']);
        table.index(['project_uuid']);
        table.index(['agent_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(reviewItemTable);
}
