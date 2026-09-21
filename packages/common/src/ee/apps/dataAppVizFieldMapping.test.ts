import {
    CustomFormatType,
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
} from '../../types/field';
import {
    deriveDataAppVizFieldMetadata,
    getDataAppVizFieldIds,
} from './dataAppVizFieldMapping';

describe('getDataAppVizFieldIds', () => {
    it('normalizes absent, scalar, and ordered multi-value bindings', () => {
        expect(getDataAppVizFieldIds(undefined)).toEqual([]);
        expect(getDataAppVizFieldIds('orders_total')).toEqual(['orders_total']);
        expect(
            getDataAppVizFieldIds([
                'orders_total',
                'orders_count',
                'orders_total',
            ]),
        ).toEqual(['orders_total', 'orders_count']);
    });
});

describe('deriveDataAppVizFieldMetadata', () => {
    const itemsMap = {
        orders_total: {
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name: 'total',
            label: 'Total order amount',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.total',
            hidden: false,
            formatOptions: {
                type: CustomFormatType.CURRENCY,
                currency: 'USD',
            },
        },
        orders_status: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'status',
            label: 'Status',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.status',
            hidden: false,
        },
    } as unknown as ItemsMap;

    it('describes every bound field id, across scalar and multi bindings', () => {
        expect(
            deriveDataAppVizFieldMetadata(
                {
                    category: 'orders_status',
                    values: ['orders_total'],
                },
                itemsMap,
            ),
        ).toEqual({
            orders_status: { label: 'Status', tableLabel: 'Orders' },
            orders_total: {
                label: 'Total order amount',
                tableLabel: 'Orders',
                format: { type: CustomFormatType.CURRENCY, currency: 'USD' },
            },
        });
    });

    it('skips bound ids the items map cannot describe', () => {
        expect(
            deriveDataAppVizFieldMetadata(
                { category: 'not_in_results' },
                itemsMap,
            ),
        ).toEqual({});
    });
});
