import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds Jira review routing columns with constant defaults, a new destinations table, and a nullable link column; no existing rows are rewritten',
} as const;

const settingsTable = 'ai_agent_review_notification_settings';
const destinationTable = 'ai_agent_review_jira_destinations';
const reviewItemTable = 'ai_agent_review_item';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    if (!(await knex.schema.hasColumn(settingsTable, 'jira_enabled'))) {
        await knex.schema.alterTable(settingsTable, (table) => {
            table.boolean('jira_enabled').notNullable().defaultTo(false);
            table.string('jira_project_id').nullable();
            table.string('jira_issue_type_id').nullable();
            table
                .boolean('jira_apply_to_all_projects')
                .notNullable()
                .defaultTo(false);
        });
    }

    if (!(await knex.schema.hasTable(destinationTable))) {
        await knex.schema.createTable(destinationTable, (table) => {
            table
                .uuid('ai_review_jira_destination_uuid')
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .primary();
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
                .unique()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            table.boolean('enabled').notNullable().defaultTo(false);
            table.string('jira_project_id').nullable();
            table.string('jira_issue_type_id').nullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }

    if (
        !(await knex.schema.hasColumn(reviewItemTable, 'jira_linked_issue_url'))
    ) {
        await knex.schema.alterTable(reviewItemTable, (table) => {
            table.text('jira_linked_issue_url').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    if (await knex.schema.hasColumn(reviewItemTable, 'jira_linked_issue_url')) {
        await knex.schema.alterTable(reviewItemTable, (table) => {
            table.dropColumn('jira_linked_issue_url');
        });
    }
    await knex.schema.dropTableIfExists(destinationTable);
    if (await knex.schema.hasColumn(settingsTable, 'jira_enabled')) {
        await knex.schema.alterTable(settingsTable, (table) => {
            table.dropColumns(
                'jira_enabled',
                'jira_project_id',
                'jira_issue_type_id',
                'jira_apply_to_all_projects',
            );
        });
    }
}
