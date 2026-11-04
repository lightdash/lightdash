import {
    PartitionGranularity,
    PartitionType,
    QueryExecutionContext,
    type TablePartitioning,
    type WarehouseClient,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type Logger from '../../logging/logger';
import {
    observePartitionScan,
    TablePartitioningCache,
} from './partitionScanTelemetry';

const dayPartitioned = (partitionCount: number | null): TablePartitioning => ({
    partitionColumn: { field: 'created_at', partitionType: PartitionType.DATE },
    granularity: PartitionGranularity.DAY,
    requiresPartitionFilter: false,
    partitionCount,
});

const events = { database: 'proj', schema: 'analytics', table: 'events' };
const users = { database: 'proj', schema: 'analytics', table: 'users' };

const setup = (
    partitioningByTable: Record<string, TablePartitioning | null | Error>,
) => {
    const getTablePartitioning = vi.fn(
        async (table: string): Promise<TablePartitioning | null> => {
            const result = partitioningByTable[table];
            if (result instanceof Error) throw result;
            return result ?? null;
        },
    );
    const warehouseClient = {
        credentials: { type: 'bigquery' },
        getTablePartitioning,
    } as unknown as WarehouseClient;
    const info = vi.fn();
    const logger = { info, warn: vi.fn() } as unknown as typeof Logger;
    const cache = new TablePartitioningCache();
    const observe = (
        referencedTables: (typeof events)[],
        partitionsProcessed: number | null,
    ) =>
        observePartitionScan({
            warehouseClient,
            cache,
            logger,
            projectUuid: 'project-1',
            queryUuid: 'query-1',
            queryContext: QueryExecutionContext.AI,
            exploreName: null,
            jobId: 'job-1',
            bytesProcessed: 100,
            bytesBilled: 200,
            stats: { referencedTables, partitionsProcessed },
        });
    const loggedEvent = () => info.mock.calls.at(-1)?.[1];
    return { observe, getTablePartitioning, loggedEvent, info };
};

describe('observePartitionScan', () => {
    it('reports a full scan when every partition of the partitioned table was read', async () => {
        const { observe, loggedEvent } = setup({
            events: dayPartitioned(30),
            users: null,
        });

        await observe([events, users], 30);

        expect(loggedEvent()).toStrictEqual({
            event: 'partition_scan.observed',
            projectUuid: 'project-1',
            queryUuid: 'query-1',
            queryContext: QueryExecutionContext.AI,
            exploreName: null,
            warehouseType: 'bigquery',
            jobId: 'job-1',
            bytesProcessed: 100,
            bytesBilled: 200,
            referencedTableCount: 2,
            partitionedTableCount: 1,
            unknownTableCount: 0,
            partitionsProcessed: 30,
            totalPartitions: 30,
            pruned: false,
        });
    });

    it('reports pruning when fewer partitions were read than the tables have', async () => {
        const { observe, loggedEvent } = setup({
            events: dayPartitioned(30),
        });

        await observe([events], 2);

        expect(loggedEvent()).toMatchObject({
            partitionedTableCount: 1,
            partitionsProcessed: 2,
            totalPartitions: 30,
            pruned: true,
        });
    });

    it('leaves pruned null when no referenced table is partitioned', async () => {
        const { observe, loggedEvent } = setup({ users: null });

        await observe([users], null);

        expect(loggedEvent()).toMatchObject({
            partitionedTableCount: 0,
            totalPartitions: 0,
            pruned: null,
        });
    });

    it('leaves pruned null when a table partitioning lookup fails', async () => {
        const { observe, loggedEvent } = setup({
            events: dayPartitioned(30),
            users: new Error('permission denied'),
        });

        await observe([events, users], 30);

        expect(loggedEvent()).toMatchObject({
            partitionedTableCount: 1,
            unknownTableCount: 1,
            totalPartitions: null,
            pruned: null,
        });
    });

    it('caches table partitioning, failed lookups included, across queries', async () => {
        const { observe, getTablePartitioning } = setup({
            events: dayPartitioned(30),
            users: new Error('permission denied'),
        });

        await observe([events, users], 1);
        await observe([events, events, users], 1);

        expect(getTablePartitioning).toHaveBeenCalledTimes(2);
    });

    it('refetches partition counts once the cache entry expires', async () => {
        vi.useFakeTimers();
        try {
            const { observe, getTablePartitioning, loggedEvent } = setup({
                events: dayPartitioned(30),
            });
            await observe([events], 29);
            getTablePartitioning.mockResolvedValueOnce(dayPartitioned(29));

            vi.advanceTimersByTime(5 * 60 * 1000 + 1);
            await observe([events], 29);

            expect(getTablePartitioning).toHaveBeenCalledTimes(2);
            expect(loggedEvent()).toMatchObject({
                totalPartitions: 29,
                pruned: false,
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not log when the query referenced no tables', async () => {
        const { observe, info } = setup({});

        await observe([], null);

        expect(info).not.toHaveBeenCalled();
    });
});
