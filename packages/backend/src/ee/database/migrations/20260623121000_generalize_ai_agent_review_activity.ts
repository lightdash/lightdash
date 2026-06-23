import { Knex } from 'knex';

const eventsTable = 'ai_agent_review_remediation_events';
const fingerprintIndex = 'ai_agent_review_events_fingerprint_occurred_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(eventsTable, (table) => {
        table.text('fingerprint').nullable();
    });

    await knex.schema.alterTable(eventsTable, (table) => {
        table.uuid('ai_agent_review_remediation_uuid').nullable().alter();
        table.index(['fingerprint', 'occurred_at'], fingerprintIndex);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(eventsTable, (table) => {
        table.dropIndex(['fingerprint', 'occurred_at'], fingerprintIndex);
    });
    await knex.schema.alterTable(eventsTable, (table) => {
        table.uuid('ai_agent_review_remediation_uuid').notNullable().alter();
        table.dropColumn('fingerprint');
    });
}
