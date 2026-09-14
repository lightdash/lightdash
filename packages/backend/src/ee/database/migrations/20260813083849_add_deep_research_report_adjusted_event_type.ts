import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Expands the accepted Deep Research event types without removing existing values',
} as const;

const EventsTableName = 'ai_deep_research_events';
const EventTypeConstraintName = 'ai_deep_research_events_event_type_check';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        EventsTableName,
        EventTypeConstraintName,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (
            event_type IN ('status_changed', 'cancellation_requested', 'progress', 'report_adjusted')
        )`,
        [EventsTableName, EventTypeConstraintName],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex(EventsTableName).where('event_type', 'report_adjusted').delete();
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        EventsTableName,
        EventTypeConstraintName,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (
            event_type IN ('status_changed', 'cancellation_requested', 'progress')
        )`,
        [EventsTableName, EventTypeConstraintName],
    );
}
