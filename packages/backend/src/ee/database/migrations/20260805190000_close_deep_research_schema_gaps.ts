import type { Knex } from 'knex';

const runsTable = 'ai_deep_research_runs';
const outboxTable = 'ai_deep_research_analytics_outbox';
const usersTable = 'users';
const creatorColumn = 'created_by_user_uuid';
const creatorIndex = 'ai_deep_research_runs_created_by_user_uuid_index';
const creatorConstraint = 'ai_deep_research_runs_created_by_user_uuid_foreign';

// Runs in its own transactions: CREATE INDEX CONCURRENTLY and VALIDATE
// CONSTRAINT cannot run inside one, so every step below is idempotent.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.schema.alterTable(runsTable, (table) => {
            table.text('terminal_reason').nullable();
        });

        // A creator that no longer exists cannot be referenced, and the run
        // could never execute as them anyway — the FK would delete these rows.
        await knex.raw(
            `DELETE FROM ?? r WHERE NOT EXISTS (
                SELECT 1 FROM ?? u WHERE u.user_uuid = r.??
            )`,
            [runsTable, usersTable, creatorColumn],
        );

        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${creatorIndex}_invalid`,
        );
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${creatorIndex} ON ?? (??)`,
            [runsTable, creatorColumn],
        );

        const constraint = await knex.raw(
            `SELECT 1 FROM pg_constraint WHERE conname = '${creatorConstraint}'`,
        );
        if (constraint.rowCount === 0) {
            await knex.raw(
                `ALTER TABLE ?? ADD CONSTRAINT ${creatorConstraint}
                 FOREIGN KEY (??) REFERENCES ?? (user_uuid)
                 ON DELETE CASCADE NOT VALID`,
                [runsTable, creatorColumn, usersTable],
            );
            await knex.raw(
                `ALTER TABLE ?? VALIDATE CONSTRAINT ${creatorConstraint}`,
                [runsTable],
            );
        }

        await knex.raw(
            `ALTER TABLE ??
                ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN delivered_at TYPE timestamptz USING delivered_at AT TIME ZONE 'UTC'`,
            [outboxTable],
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(
            `ALTER TABLE ??
                ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN delivered_at TYPE timestamp USING delivered_at AT TIME ZONE 'UTC'`,
            [outboxTable],
        );
        await knex.raw(
            `ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ${creatorConstraint}`,
            [runsTable],
        );
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${creatorIndex}`);
        await knex.schema.alterTable(runsTable, (table) => {
            table.dropColumn('terminal_reason');
        });
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
