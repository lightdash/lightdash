import { FilterOperator, type Explore } from '@lightdash/common';
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
});
