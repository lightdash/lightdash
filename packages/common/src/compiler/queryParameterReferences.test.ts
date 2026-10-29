import { type Explore } from '../types/explore';
import {
    BinType,
    CustomDimensionType,
    DimensionType,
    MetricType,
} from '../types/field';
import { FilterOperator } from '../types/filter';
import {
    getQueryParameterReferences,
    type QueryParameterScope,
} from './queryParameterReferences';

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    joinedTables: [
        {
            table: 'customers',
            parameterReferences: ['region'],
            tablesReferences: ['orders', 'customers'],
        },
    ],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            dimensions: {
                status: { name: 'status', table: 'orders' },
                date_range: {
                    name: 'date_range',
                    table: 'orders',
                    parameterReferences: ['date_range'],
                },
            },
            metrics: {
                total: { name: 'total', table: 'orders' },
            },
            lineageGraph: {},
        },
        customers: {
            name: 'customers',
            label: 'Customers',
            sqlTable: 'customers_${lightdash.parameters.env}',
            parameterReferences: ['joined_where'],
            dimensions: {
                city: { name: 'city', table: 'customers' },
            },
            metrics: {},
            lineageGraph: {},
        },
    },
} as unknown as Explore;

const withBaseTable = (
    overrides: Partial<Explore['tables'][string]>,
): Explore => ({
    ...explore,
    tables: {
        ...explore.tables,
        orders: { ...explore.tables.orders, ...overrides },
    },
});

const query = (
    overrides: Partial<QueryParameterScope>,
): QueryParameterScope => ({
    dimensions: ['orders_status'],
    metrics: ['orders_total'],
    filters: {},
    ...overrides,
});

const references = (target: Explore, scope: QueryParameterScope) =>
    getQueryParameterReferences(target, scope).sort();

describe('getQueryParameterReferences', () => {
    it('returns only references from the selected and filtered fields', () => {
        expect(references(explore, query({}))).toEqual([]);
        expect(
            references(
                explore,
                query({
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'orders_date_range' },
                                    operator: FilterOperator.EQUALS,
                                    values: [true],
                                },
                            ],
                        },
                    },
                }),
            ),
        ).toEqual(['date_range']);
    });

    it('always reports the base table sql_where references', () => {
        expect(
            references(
                withBaseTable({ parameterReferences: ['env'] }),
                query({}),
            ),
        ).toEqual(['env']);
    });

    it('reports a joined table only when the query uses it, without its sql_where', () => {
        expect(
            references(explore, query({ dimensions: ['customers_city'] })),
        ).toEqual(['env', 'region']);
    });

    it('reports joins pulled in by the base sql_where and required filters', () => {
        expect(
            references(
                withBaseTable({
                    uncompiledSqlWhere: "${customers.city} = 'Paris'",
                }),
                query({}),
            ),
        ).toEqual(['env', 'region']);
        expect(
            references(
                withBaseTable({
                    requiredFilters: [
                        {
                            id: 'r1',
                            target: { fieldRef: 'date_range' },
                            operator: FilterOperator.EQUALS,
                            values: [true],
                        },
                    ],
                }),
                query({}),
            ),
        ).toEqual(['date_range']);
        expect(
            references(
                withBaseTable({
                    requiredFilters: [
                        {
                            id: 'r2',
                            target: {
                                fieldRef: 'customers.city',
                                tableName: 'customers',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['Paris'],
                            required: false,
                        },
                        {
                            id: 'r3',
                            target: { fieldRef: 'date_range' },
                            operator: FilterOperator.EQUALS,
                            values: [true],
                            required: false,
                        },
                    ],
                }),
                query({}),
            ),
        ).toEqual(['env', 'region']);
    });

    it('reports references from selected custom dimensions, custom metrics and table calculations', () => {
        const scope = query({
            customDimensions: [
                {
                    id: 'range_bin',
                    name: 'Range bin',
                    table: 'orders',
                    type: CustomDimensionType.BIN,
                    dimensionId: 'orders_date_range',
                    binType: BinType.FIXED_NUMBER,
                    binNumber: 3,
                },
                {
                    id: 'tiered',
                    name: 'Tiered',
                    table: 'orders',
                    type: CustomDimensionType.SQL,
                    sql: '${lightdash.parameters.tier}',
                    dimensionType: DimensionType.STRING,
                },
            ],
            additionalMetrics: [
                {
                    name: 'scaled',
                    table: 'orders',
                    type: MetricType.SUM,
                    sql: '${TABLE}.amount * ${lightdash.parameters.scale}',
                },
            ],
            tableCalculations: [
                {
                    name: 'adjusted',
                    displayName: 'Adjusted',
                    sql: '${orders.total} * ${lightdash.parameters.factor}',
                },
            ],
        });
        expect(references(explore, scope)).toEqual(['factor']);
        expect(
            references(explore, {
                ...scope,
                dimensions: ['range_bin', 'tiered'],
                metrics: ['orders_scaled'],
            }),
        ).toEqual(['date_range', 'factor', 'scale', 'tier']);
    });
});
