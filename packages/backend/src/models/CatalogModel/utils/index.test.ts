import { FieldType, type Explore } from '@lightdash/common';
import { getChartFieldUsageChanges } from './index';

describe('getChartFieldUsageChanges', () => {
    it('attributes qualified base and aliased join fields to their canonical explores', async () => {
        const explore = {
            name: 'analytics__orders',
            baseTable: 'analytics__orders',
            tables: {
                analytics__orders: {
                    name: 'analytics__orders',
                    originalName: 'orders',
                    dimensions: {
                        order_id: {
                            name: 'order_id',
                            table: 'analytics__orders',
                        },
                    },
                    metrics: {},
                },
                payments_alias: {
                    name: 'payments_alias',
                    originalName: 'payments',
                    canonicalName: 'finance__payments',
                    dimensions: {},
                    metrics: {
                        payment_total: {
                            name: 'payment_total',
                            table: 'payments_alias',
                        },
                    },
                },
            },
        } as unknown as Explore;
        const getCachedExploresTableNameMap = vi.fn(
            async (_projectUuid: string, tableNames: string[]) =>
                Object.fromEntries(
                    tableNames.map((tableName) => [
                        tableName,
                        `${tableName}-uuid`,
                    ]),
                ),
        );

        const result = await getChartFieldUsageChanges(
            'project-uuid',
            explore,
            {
                oldChartFields: { dimensions: [], metrics: [] },
                newChartFields: {
                    dimensions: ['analytics__orders_order_id'],
                    metrics: ['payments_alias_payment_total'],
                },
            },
            getCachedExploresTableNameMap,
        );

        expect(getCachedExploresTableNameMap).toHaveBeenCalledWith(
            'project-uuid',
            expect.arrayContaining(['analytics__orders', 'finance__payments']),
        );
        expect(getCachedExploresTableNameMap.mock.calls[0][1]).toHaveLength(2);
        expect(result.fieldsToIncrement).toHaveLength(2);
        expect(result.fieldsToIncrement).toEqual(
            expect.arrayContaining([
                {
                    cachedExploreUuid: 'analytics__orders-uuid',
                    fieldName: 'order_id',
                    fieldType: FieldType.DIMENSION,
                },
                {
                    cachedExploreUuid: 'finance__payments-uuid',
                    fieldName: 'payment_total',
                    fieldType: FieldType.METRIC,
                },
            ]),
        );
        expect(result.fieldsToDecrement).toEqual([]);
    });
});
