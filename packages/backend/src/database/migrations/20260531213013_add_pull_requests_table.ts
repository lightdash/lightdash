import { Knex } from 'knex';

const PullRequestsTableName = 'pull_requests';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(PullRequestsTableName, (table) => {
        table
            .uuid('pull_request_uuid')
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
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');

        // 'github' | 'gitlab' (PullRequestProvider)
        table.text('provider').notNullable();
        // 'custom_metric' | 'custom_dimension' | 'sql_runner' |
        // 'source_editor' | 'ai_agent' (PullRequestSource)
        table.text('source').notNullable();

        // Immutable identifiers used to resolve the PR's live
        // title/state from the GitHub/GitLab API at runtime.
        table.text('owner').notNullable();
        table.text('repo').notNullable();
        table.integer('pr_number').notNullable();

        // Display value and fallback when the live fetch fails.
        table.text('pr_url').notNullable();

        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['project_uuid']);
        table.unique(['provider', 'owner', 'repo', 'pr_number']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PullRequestsTableName);
}
