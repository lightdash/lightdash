import { SupportedDbtAdapter } from '../types/dbt';
import { type Explore, type Table } from '../types/explore';
import {
    CustomDimensionType,
    DimensionType,
    FieldType,
    type CustomSqlDimension,
    type Dimension,
} from '../types/field';
import {
    FilterOperator,
    type AndFilterGroup,
    type DashboardFilters,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type JoinModelRequiredFilterRule,
    type ModelRequiredFilterRule,
    type OrFilterGroup,
} from '../types/filter';
import type { MetricQuery } from '../types/metricQuery';
import { OrderFieldsByStrategy } from '../types/table';

export const chartAndFilterGroup: AndFilterGroup = {
    id: 'fillter-group-1',
    and: [
        {
            id: '1',
            target: { fieldId: 'field-1' },
            values: ['1'],
            disabled: false,
            operator: FilterOperator.EQUALS,
        },
        {
            id: '2',
            target: { fieldId: 'field-2' },
            values: ['2'],
            disabled: false,
            operator: FilterOperator.EQUALS,
        },
    ],
};

export const chartOrFilterGroup: OrFilterGroup = {
    id: 'fillter-group-1',
    or: [
        {
            id: '3',
            target: { fieldId: 'field-1' },
            values: ['1'],
            disabled: false,
            operator: FilterOperator.EQUALS,
        },
        {
            id: '4',
            target: { fieldId: 'field-2' },
            values: ['2'],
            disabled: false,
            operator: FilterOperator.EQUALS,
        },
    ],
};

export const dashboardFilterWithSameTargetAndOperator: FilterRule[] = [
    {
        id: '5',
        target: { fieldId: 'field-1' },
        values: ['1', '2', '3'],
        disabled: false,
        operator: FilterOperator.EQUALS,
    },
];

export const dashboardFilterWithSameTargetButDifferentOperator: FilterRule[] = [
    {
        id: '5',
        target: { fieldId: 'field-1' },
        values: ['1', '2', '3'],
        disabled: false,
        operator: FilterOperator.NOT_EQUALS,
    },
];

export const metricQueryWithAndFilters: MetricQuery = {
    exploreName: 'test',
    limit: 501,
    dimensions: ['a_dim1'],
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'a_dim1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [0],
                },
            ],
        },
    },
};

export const metricQueryWithOrFilters: MetricQuery = {
    exploreName: 'test',
    limit: 501,
    dimensions: ['a_dim1'],
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            id: 'root',
            or: [
                {
                    id: '1',
                    target: {
                        fieldId: 'a_dim1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [0],
                },
            ],
        },
    },
};

export const dashboardFilters: DashboardFilters = {
    dimensions: [
        {
            id: '4',
            label: undefined,
            target: {
                fieldId: 'a_dim1',
                tableName: 'test',
            },
            operator: FilterOperator.EQUALS,
            values: ['1', '2', '3'],
        },
    ],
    metrics: [],
    tableCalculations: [],
};

export const expectedChartWithOverrideDashboardFilters: MetricQuery = {
    exploreName: 'test',
    dimensions: ['a_dim1'],
    limit: 501,
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            and: [
                {
                    id: '4',
                    target: {
                        fieldId: 'a_dim1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['1', '2', '3'],
                },
            ],
            id: 'uuid',
        },
        metrics: {
            and: [],
            id: 'uuid',
        },
        tableCalculations: {
            and: [],
            id: 'uuid',
        },
    },
};

export const expectedChartWithOverrideDashboardORFilters: MetricQuery = {
    exploreName: 'test',
    dimensions: ['a_dim1'],
    limit: 501,
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            and: [
                {
                    id: 'root',
                    or: [
                        {
                            id: '4',
                            target: {
                                fieldId: 'a_dim1',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['1', '2', '3'],
                        },
                    ],
                },
            ],
            id: 'uuid',
        },
        metrics: {
            and: [],
            id: 'uuid',
        },
        tableCalculations: {
            and: [],
            id: 'uuid',
        },
    },
};

export const customSqlDimension: CustomSqlDimension = {
    id: 'custom-sql-dimension',
    name: 'Custom SQL Dimension',
    table: 'custom_sql',
    type: CustomDimensionType.SQL,
    sql: '${table.field}',
    dimensionType: DimensionType.STRING,
};

export const expectedFiltersWithCustomSqlDimension: Filters = {
    dimensions: {
        and: [
            {
                id: 'uuid',
                operator: FilterOperator.EQUALS,
                target: {
                    fieldId: 'custom-sql-dimension',
                },
                values: [],
            },
        ],
        id: 'uuid',
    },
};

export const expectedRequiredResult = (
    fieldIdRef: string,
    tableName: String,
): FilterRule => ({
    id: 'uuid',
    target: {
        fieldId: `${tableName}_${fieldIdRef}`,
    },
    operator: FilterOperator.IN_THE_NEXT,
    values: [14],
    settings: {
        unitOfTime: 'years',
    },
    required: true,
});

export const dimension = (
    dimensionName: string,
    tableName: string,
): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: dimensionName,
    isIntervalBase: false,
    timeInterval: undefined,
    label: 'mockLabel',
    table: tableName,
    tableLabel: 'mockTableLabel',
    sql: 'mockSql',
    hidden: false,
});

export const filterRule: FilterRule = {
    id: 'mockId',
    target: {
        fieldId: 'mockFieldId',
    },
    operator: FilterOperator.IN_THE_NEXT,
    values: ['mockValue1', 'mockValue2'],
};

export const modelRequiredFilterRule = (
    inputFieldRef: string,
): ModelRequiredFilterRule => ({
    id: 'uuid',
    operator: FilterOperator.IN_THE_NEXT,
    settings: {
        unitOfTime: 'years',
    },
    target: {
        fieldRef: inputFieldRef,
    },
    values: [14],
});

export const joinedModelRequiredFilterRule = (
    inputFieldRef: string,
    tableName: string,
): JoinModelRequiredFilterRule => {
    const requiredFilterRule = modelRequiredFilterRule(inputFieldRef);
    return {
        ...requiredFilterRule,
        target: {
            ...requiredFilterRule.target,
            tableName,
        },
    };
};

export const baseTable: Omit<Table, 'lineageGraph'> = {
    name: 'table',
    label: 'My table',
    database: 'database',
    schema: 'schema',
    sqlTable: '',
    description: '',
    sqlWhere: undefined,
    requiredAttributes: undefined,
    dimensions: {},
    metrics: {},
    orderFieldsBy: OrderFieldsByStrategy.LABEL,
    requiredFilters: [],
    groupLabel: undefined,
    groupDetails: {},
};

export const expectedRequiredResetResult: FilterGroup = {
    id: 'uuidGroup',
    and: [
        {
            id: 'uuid',
            target: {
                fieldId: 'table_mockFieldRef1',
            },
            operator: FilterOperator.IN_THE_NEXT,
            values: [14],
            required: true,
            settings: {
                unitOfTime: 'years',
            },
        },
        {
            id: 'uuid',
            target: {
                fieldId: 'table_mockFieldRef2',
            },
            operator: FilterOperator.IN_THE_NEXT,
            values: [14],
            required: false,
            settings: {
                unitOfTime: 'years',
            },
        },
    ],
};

export const mockExplore: Explore = {
    name: 'test',
    label: 'Test',
    tags: [],
    baseTable: 'orders',
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'test',
            schema: 'public',
            sqlTable: 'orders',
            metrics: {},
            lineageGraph: {},
            dimensions: {
                order_date_year: {
                    name: 'order_date_year',
                    label: 'Order Date Year',
                    table: 'orders',
                    tableLabel: 'Orders',
                    compiledSql: 'order_date_year',
                    tablesReferences: [],
                    sql: 'order_date_year',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    timeIntervalBaseDimensionName: 'order_date',
                },
                order_date_month: {
                    name: 'order_date_month',
                    label: 'Order Date Month',
                    table: 'orders',
                    tableLabel: 'Orders',
                    compiledSql: 'order_date_month',
                    tablesReferences: [],
                    sql: 'order_date_month',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    timeIntervalBaseDimensionName: 'order_date',
                },
                order_date_week: {
                    name: 'order_date_week',
                    label: 'Order Date Week',
                    table: 'orders',
                    tableLabel: 'Orders',
                    compiledSql: 'order_date_week',
                    sql: 'order_date_week',
                    hidden: false,
                    tablesReferences: [],
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    timeIntervalBaseDimensionName: 'order_date',
                },
                status: {
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    compiledSql: 'status',
                    sql: 'status',
                    hidden: false,
                    tablesReferences: [],
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.BOOLEAN,
                },
            },
        },
    },
};

export const mockExploreWithJoinedTable: Explore = {
    ...mockExplore,
    tables: {
        orders: {
            ...mockExplore.tables.orders,
            dimensions: {
                ...mockExplore.tables.orders.dimensions,
                customer_id: {
                    name: 'customer_id',
                    label: 'Customer ID',
                    table: 'orders',
                    tableLabel: 'Orders',
                    compiledSql: 'customer_id',
                    sql: 'customer_id',
                    hidden: false,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    tablesReferences: [],
                },
            },
        },
        customers: {
            name: 'customers',
            label: 'Customers',
            database: 'test',
            schema: 'public',
            sqlTable: 'customers',
            metrics: {},
            lineageGraph: {},
            dimensions: {
                id: {
                    name: 'id',
                    label: 'ID',
                    table: 'customers',
                    tableLabel: 'Customers',
                    compiledSql: 'id',
                    tablesReferences: [],
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    sql: 'id',
                    hidden: false,
                },
                created_at_week: {
                    name: 'created_at_week',
                    label: 'Created At Week',
                    table: 'customers',
                    tableLabel: 'Customers',
                    compiledSql: 'created_at_week',
                    sql: 'created_at_week',
                    hidden: false,
                    tablesReferences: [],
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    timeIntervalBaseDimensionName: 'created_at',
                },
            },
        },
    },
    joinedTables: [
        {
            table: 'customers',
            sqlOn: '${orders.customer_id} = ${customers.id}',
            compiledSqlOn: '(orders.customer_id) = (customers.id)',
            type: undefined,
        },
    ],
};
