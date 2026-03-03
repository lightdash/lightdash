import { Knex } from 'knex';

const SavedSqlTableName = 'saved_sql';

// Disable transaction wrapping so CREATE INDEX CONCURRENTLY can be used.
// Regular CREATE INDEX takes a SHARE lock blocking all writes for the duration
// of the index build. On shared instances with multiple tenants migrating
// simultaneously, this causes I/O contention and connection pool exhaustion.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        SavedSqlTableName,
        'deleted_at',
    );
    if (!hasColumn) {
        await knex.schema.alterTable(SavedSqlTableName, (table) => {
            table.timestamp('deleted_at', { useTz: false }).nullable();
            table.uuid('deleted_by_user_uuid').nullable(); // No FK constraint - user may be deleted
        });
    }

    // Partial index for fast queries on non-deleted items
    // We DROP first to clean up any invalid indexes left by a previous failed attempt.
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS idx_saved_sql_not_deleted`,
    );
    await knex.raw(`
        CREATE INDEX CONCURRENTLY idx_saved_sql_not_deleted
        ON ${SavedSqlTableName} (saved_sql_uuid)
        WHERE deleted_at IS NULL
    `);

    // Partial index for fast queries on deleted items (Recently Deleted page)
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS idx_saved_sql_deleted`,
    );
    await knex.raw(`
        CREATE INDEX CONCURRENTLY idx_saved_sql_deleted
        ON ${SavedSqlTableName} (saved_sql_uuid)
        WHERE deleted_at IS NOT NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_saved_sql_deleted');
    await knex.raw(
        'DROP INDEX CONCURRENTLY IF EXISTS idx_saved_sql_not_deleted',
    );
    const hasColumn = await knex.schema.hasColumn(
        SavedSqlTableName,
        'deleted_at',
    );
    if (hasColumn) {
        await knex.schema.alterTable(SavedSqlTableName, (table) => {
            table.dropColumn('deleted_at');
            table.dropColumn('deleted_by_user_uuid');
        });
    }
}
