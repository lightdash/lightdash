import {
    SupportedDbtAdapter,
    type CompiledTable,
    type Explore,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    safeGetCachedExploreStorageBytes,
    summarizeCatalogSearchExploreRead,
} from './exploreCacheReadMetrics';

const explore = (name: string, tableNames: string[]): Explore => {
    const tables = Object.fromEntries(
        tableNames.map((tableName) => [
            tableName,
            {
                name: tableName,
                label: tableName,
                database: 'database',
                schema: 'schema',
                sqlTable: tableName,
                dimensions: {},
                metrics: {},
                lineageGraph: {},
            } satisfies CompiledTable,
        ]),
    );

    return {
        name,
        label: name,
        tags: [],
        tables,
        baseTable: tableNames[0],
        joinedTables: tableNames.slice(1).map((table) => ({
            table,
            sqlOn: '',
            compiledSqlOn: '',
        })),
        targetDatabase: SupportedDbtAdapter.POSTGRES,
    };
};

describe('safeGetCachedExploreStorageBytes', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('does not run the storage query when disabled', async () => {
        vi.stubEnv('LIGHTDASH_EXPLORE_CACHE_READ_STORAGE_BYTES', 'false');
        const getStorageBytes = vi.fn(async () => 42);

        await expect(
            safeGetCachedExploreStorageBytes(getStorageBytes),
        ).resolves.toBeUndefined();

        expect(getStorageBytes).not.toHaveBeenCalled();
    });
});

describe('summarizeCatalogSearchExploreRead', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reports the bytes selected for each distinct explore once', () => {
        const orders = explore('orders', ['orders', 'customers']);
        const payments = explore('payments', ['payments']);
        const ordersBytes = Buffer.byteLength(JSON.stringify(orders), 'utf8');
        const paymentsBytes = Buffer.byteLength(
            JSON.stringify(payments),
            'utf8',
        );
        const stringify = vi.spyOn(JSON, 'stringify');

        const summary = summarizeCatalogSearchExploreRead(3, {
            'cached-orders': orders,
            'cached-payments': payments,
        });

        expect(summary).toEqual({
            exploreCount: 2,
            tableFanOut: 3,
            returnedSqlRowCount: 3,
            distinctExploreCount: 2,
            selectedExploreJsonBytes: ordersBytes + paymentsBytes,
        });
        expect(stringify).toHaveBeenCalledTimes(2);
    });
});
