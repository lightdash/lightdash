import {
    FilterOperator,
    MetricType,
    type AdditionalMetric,
    type Explore,
} from '@lightdash/common';
import { getAppliedParameters } from './appliedParameters';

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            parameters: {
                date_range: { label: 'Date range', default: 'last 7 days' },
            },
            dimensions: {
                status: { name: 'status', table: 'orders' },
                in_range: {
                    name: 'in_range',
                    table: 'orders',
                    parameterReferences: ['orders.date_range'],
                },
            },
            metrics: { total: { name: 'total', table: 'orders' } },
            lineageGraph: {},
        },
    },
} as unknown as Explore;

describe('getAppliedParameters', () => {
    it('returns null when the query uses no parameter-referencing field', () => {
        expect(
            getAppliedParameters(
                explore,
                {},
                {
                    dimensions: ['orders_status'],
                    metrics: ['orders_total'],
                    filters: {},
                },
                null,
            ),
        ).toBeNull();
    });

    it('reports parameters referenced by a filtered field', () => {
        expect(
            getAppliedParameters(
                explore,
                {},
                {
                    dimensions: ['orders_status'],
                    metrics: [],
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'orders_in_range' },
                                    operator: FilterOperator.EQUALS,
                                    values: [true],
                                },
                            ],
                        },
                    },
                },
                null,
            ),
        ).toEqual({
            applied: {},
            defaulted: { 'orders.date_range': 'last 7 days' },
            unset: [],
        });
    });

    it('reports custom metric base dimensions only for selected custom metrics', () => {
        const customMetric: AdditionalMetric = {
            name: 'in_range_count',
            label: 'In range count',
            table: 'orders',
            type: MetricType.COUNT,
            sql: '',
            baseDimensionName: 'in_range',
        };
        const query = {
            dimensions: ['orders_status'],
            filters: {},
            additionalMetrics: [customMetric],
        };
        expect(
            getAppliedParameters(explore, {}, { ...query, metrics: [] }, null),
        ).toBeNull();
        expect(
            getAppliedParameters(
                explore,
                {},
                { ...query, metrics: ['orders_in_range_count'] },
                null,
            )?.defaulted,
        ).toEqual({ 'orders.date_range': 'last 7 days' });
    });
});
