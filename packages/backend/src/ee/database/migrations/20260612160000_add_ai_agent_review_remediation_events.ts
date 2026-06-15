import { Knex } from 'knex';

const eventsTable = 'ai_agent_review_remediation_events';
const remediationTable = 'ai_agent_review_remediation';
const organizationsTable = 'organizations';
const usersTable = 'users';
const eventsByRemediationIndex =
    'ai_agent_review_remediation_events_remediation_occurred_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(eventsTable, (table) => {
        table
            .uuid('ai_agent_review_remediation_event_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_agent_review_remediation_uuid')
            .notNullable()
            .references('ai_agent_review_remediation_uuid')
            .inTable(remediationTable)
            .onDelete('CASCADE');
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(organizationsTable)
            .onDelete('CASCADE')
            .index();
        table.text('event_type').notNullable();
        table.timestamp('occurred_at', { useTz: true }).notNullable();
        table.jsonb('payload').notNullable().defaultTo('{}');
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(
            ['ai_agent_review_remediation_uuid', 'occurred_at'],
            eventsByRemediationIndex,
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(eventsTable);
}
