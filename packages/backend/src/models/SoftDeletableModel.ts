import type { Knex } from 'knex';

/**
 * Standard interface for models that support the soft-delete lifecycle.
 *
 * SchedulerModel does NOT implement this interface because it lacks
 * `permanentDelete` and `restore` (it operates by parent UUID, not its own).
 */
export interface SoftDeletableModel<T = void> {
    softDelete(uuid: string, userUuid: string): Promise<T>;
    restore(uuid: string): Promise<void>;
    permanentDelete(uuid: string): Promise<T>;
    permanentlyDeleteExpiredBatch(
        retentionDays: number,
        limit: number,
    ): Promise<number>;
}

/**
 * Shared DELETE WHERE IN (subquery) logic for expired soft-deleted rows.
 * Called by each model's `permanentlyDeleteExpiredBatch` method.
 */
export async function deleteExpiredSoftDeletedRows(
    database: Knex,
    config: {
        tableName: string;
        pkColumn: string;
        orderByRaw?: string; // e.g. 'nlevel(path) ASC' for spaces
    },
    retentionDays: number,
    limit: number,
): Promise<number> {
    const { tableName, pkColumn, orderByRaw } = config;

    let subquery = database(tableName)
        .select(pkColumn)
        .whereNotNull('deleted_at')
        .andWhereRaw('deleted_at < NOW() - make_interval(days => ?)', [
            retentionDays,
        ])
        .limit(limit);

    if (orderByRaw) {
        subquery = subquery.orderByRaw(orderByRaw);
    }
    subquery = subquery.orderBy('deleted_at', 'asc');

    return database(tableName).whereIn(pkColumn, subquery).delete();
}
