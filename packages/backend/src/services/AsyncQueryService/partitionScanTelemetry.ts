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

export type TablePartitioningLookup =
    | { status: 'found'; partitioning: TablePartitioning | null }
    | { status: 'failed' };

const tableKey = ({ database, schema, table }: WarehouseTableReference) =>
    `${database}.${schema}.${table}`;

// Failed lookups are cached too, so a table the credentials cannot read is not retried per query.
export class TablePartitioningCache {
    private readonly cache = new NodeCache({
        stdTTL: 60 * 60,
        useClones: false,
        maxKeys: 10_000,
    });

    async get(
        projectUuid: string,
        table: WarehouseTableReference,
        load: () => Promise<TablePartitioningLookup>,
    ): Promise<TablePartitioningLookup> {
        const key = `${projectUuid}:${tableKey(table)}`;
        const cached = this.cache.get<TablePartitioningLookup>(key);
        if (cached) return cached;
        const lookup = await load();
        try {
            this.cache.set(key, lookup);
        } catch {
            // Full cache: serve uncached until entries expire.
        }
        return lookup;
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
    bytesBilled: number | null;
    stats: WarehousePartitionScanStats;
};

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
    bytesBilled,
    stats,
}: ObservePartitionScanArgs): Promise<void> => {
    const tables = [
        ...new Map(
            stats.referencedTables.map((t) => [tableKey(t), t]),
        ).values(),
    ];
    if (tables.length === 0) return;

    const lookups = await Promise.all(
        tables.map((table) =>
            cache.get(projectUuid, table, () =>
                warehouseClient
                    .getTablePartitioning(
                        table.table,
                        table.schema,
                        table.database,
                    )
                    .then(
                        (partitioning): TablePartitioningLookup => ({
                            status: 'found',
                            partitioning,
                        }),
                    )
                    .catch((error: unknown): TablePartitioningLookup => {
                        logger.warn('partition_scan.table_lookup_failed', {
                            projectUuid,
                            queryUuid,
                            error: getErrorMessage(error),
                        });
                        return { status: 'failed' };
                    }),
            ),
        ),
    );
    const partitioned = lookups.flatMap((lookup) =>
        lookup.status === 'found' && lookup.partitioning
            ? [lookup.partitioning]
            : [],
    );
    const unknownTableCount = lookups.filter(
        (lookup) => lookup.status === 'failed',
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
        bytesBilled,
        referencedTableCount: tables.length,
        partitionedTableCount: partitioned.length,
        unknownTableCount,
        partitionsProcessed: stats.partitionsProcessed,
        totalPartitions,
        pruned,
    });
};
