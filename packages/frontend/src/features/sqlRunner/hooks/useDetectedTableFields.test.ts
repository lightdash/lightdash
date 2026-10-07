import { describe, expect, it } from 'vitest';
import type { SqlCatalog } from '../utils/sqlCompletionScope';
import { resolveCatalogTables } from './useDetectedTableFields';

const catalog: SqlCatalog = {
    database: 'Analytics',
    tablesBySchema: [
        { schema: 'SILVER', tables: { ORDERS: {}, CUSTOMERS: {} } },
        { schema: 'GOLD', tables: { ORDERS: {} } },
    ],
};

describe('resolveCatalogTables', () => {
    it('resolves database, schema and bare references with catalog casing', () => {
        expect(
            resolveCatalogTables(
                [
                    ['analytics', 'silver', 'customers'],
                    ['silver', 'orders'],
                    ['orders'],
                ],
                catalog,
            ),
        ).toEqual([
            { schema: 'SILVER', table: 'CUSTOMERS' },
            { schema: 'SILVER', table: 'ORDERS' },
            { schema: 'GOLD', table: 'ORDERS' },
        ]);
    });

    it('ignores other databases and unknown tables', () => {
        expect(
            resolveCatalogTables(
                [['other', 'silver', 'orders'], ['silver', 'missing'], ['x']],
                catalog,
            ),
        ).toEqual([]);
    });
});
