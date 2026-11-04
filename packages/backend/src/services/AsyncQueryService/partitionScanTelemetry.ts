import {
    getErrorMessage,
    type QueryExecutionContext,
    type TablePartitioning,
    type WarehouseClient,
    type WarehousePartitionScanStats,
    type WarehouseTableReference,
} from '@lightdash/common';
import NodeCache from 'node-cache';
import type Logger from '../../logging/logger';

const tableKey = ({ database, schema, table }: WarehouseTableReference) =>
    `${database}.${schema}.${table}`;

/** Table partitioning by project and warehouse table, so lookups stay off the per-query path. */
export class TablePartitioningCache {
    private readonly cache = new NodeCache({
        stdTTL: 60 * 60,
        useClones: false,
        maxKeys: 10_000,
    });

    async get(
        projectUuid: string,
        table: WarehouseTableReference,
        load: () => Promise<TablePartitioning | null>,
    ): Promise<TablePartitioning | null> {
        const key = `${projectUuid}:${tableKey(table)}`;
        const cached = this.cache.get<{ value: TablePartitioning | null }>(key);
        if (cached) return cached.value;
        const value = await load();
        try {
            this.cache.set(key, { value });
        } catch {
            // Full cache: serve uncached until entries expire.
        }
        return value;
    }
}

type ObservePartitionScanArgs = {
    warehouseClient: WarehouseClient;
    cache: TablePartitioningCache;
    logger: typeof Logger;
    projectUuid: string;
    queryUuid: string;
    queryContext: QueryExecutionContext;
    exploreName: string | null;
    jobId: string | null;
    bytesProcessed: number | null;
    stats: WarehousePartitionScanStats;
};

/** Logs one `partition_scan.observed` event comparing partitions read with partitions the referenced tables have. */
export const observePartitionScan = async ({
    warehouseClient,
    cache,
    logger,
    projectUuid,
    queryUuid,
    queryContext,
    exploreName,
    jobId,
    bytesProcessed,
    stats,
}: ObservePartitionScanArgs): Promise<void> => {
    const tables = [
        ...new Map(
            stats.referencedTables.map((t) => [tableKey(t), t]),
        ).values(),
    ];
    if (tables.length === 0) return;

    const partitionings = await Promise.all(
        tables.map((table) =>
            cache
                .get(projectUuid, table, () =>
                    warehouseClient.getTablePartitioning(
                        table.table,
                        table.schema,
                        table.database,
                    ),
                )
                .catch((error: unknown) => {
                    logger.warn('partition_scan.table_lookup_failed', {
                        projectUuid,
                        queryUuid,
                        error: getErrorMessage(error),
                    });
                    return 'unknown' as const;
                }),
        ),
    );
    const partitioned = partitionings.filter(
        (p): p is TablePartitioning => p !== null && p !== 'unknown',
    );
    const unknownTableCount = partitionings.filter(
        (p) => p === 'unknown',
    ).length;
    const totalPartitions =
        unknownTableCount === 0 &&
        partitioned.every((p) => p.partitionCount !== null)
            ? partitioned.reduce((sum, p) => sum + (p.partitionCount ?? 0), 0)
            : null;
    const pruned =
        partitioned.length > 0 &&
        totalPartitions !== null &&
        stats.partitionsProcessed !== null
            ? stats.partitionsProcessed < totalPartitions
            : null;

    logger.info('partition_scan.observed', {
        event: 'partition_scan.observed',
        projectUuid,
        queryUuid,
        queryContext,
        exploreName,
        warehouseType: warehouseClient.credentials.type,
        jobId,
        bytesProcessed,
        referencedTableCount: tables.length,
        partitionedTableCount: partitioned.length,
        unknownTableCount,
        partitionsProcessed: stats.partitionsProcessed,
        totalPartitions,
        pruned,
    });
};
