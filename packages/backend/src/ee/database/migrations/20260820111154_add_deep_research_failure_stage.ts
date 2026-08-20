import type { Knex } from 'knex';

const runsTable = 'ai_deep_research_runs';
// This is a schema snapshot, not a live application constant. New stages must
// expand the constraint in a later migration for existing installations too.
const failureStagesAtCreation = [
    'enqueue',
    'authorization',
    'investigation',
    'finalization',
    'persistence',
    'recovery',
] as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(runsTable, (table) => {
        table
            .text('failure_stage')
            .nullable()
            .checkIn([...failureStagesAtCreation]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(runsTable, (table) => {
        table.dropColumn('failure_stage');
    });
}
