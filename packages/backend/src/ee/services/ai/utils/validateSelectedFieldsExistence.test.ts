import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type AdditionalMetric,
    type CustomMetricBase,
    type Explore,
    type TableCalcsSchema,
    type TableCalculation,
} from '@lightdash/common';

import { validateSelectedFieldsExistence } from './validators';

const mockExplore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'test_explore',
    label: 'Test Explore',
    tags: [],
    spotlight: {
        visibility: 'show',
        categories: [],
    },
    baseTable: 'users',
    joinedTables: [
        {
            table: 'orders',
            sqlOn: '${users.user_id} = ${orders.user_id}',
            compiledSqlOn: '(users.user_id) = (orders.user_id)',
            type: undefined,
        },
    ],
    tables: {
        users: {
            name: 'users',
            label: 'Users',
            database: 'test_db',
            schema: 'public',
            sqlTable: 'users',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            dimensions: {
                user_id: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'user_id',
                    label: 'User ID',
                    table: 'users',
                    tableLabel: 'Users',
                    sql: '${TABLE}.user_id',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'users.user_id',
                    tablesReferences: ['users'],
                },
                user_name: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'user_name',
                    label: 'User Name',
                    table: 'users',
                    tableLabel: 'Users',
                    sql: '${TABLE}.user_name',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'users.user_name',
                    tablesReferences: ['users'],
                },
            },
            metrics: {
                total_users: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                    name: 'total_users',
                    label: 'Total Users',
                    table: 'users',
                    tableLabel: 'Users',
                    sql: 'COUNT(*)',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'COUNT(*)',
                    tablesReferences: ['users'],
                },
            },
            lineageGraph: {},
            source: undefined,
            groupLabel: undefined,
        },
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'test_db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            dimensions: {
                order_id: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'order_id',
                    label: 'Order ID',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.order_id',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.order_id',
                    tablesReferences: ['orders'],
                },
            },
            metrics: {},
            lineageGraph: {},
            source: undefined,
            groupLabel: undefined,
        },
    },
    groupLabel: undefined,
    warehouse: undefined,
    sqlPath: undefined,
    ymlPath: undefined,
    databricksCompute: undefined,
};

describe('validateSelectedFieldsExistence', () => {
    describe('when selected fields are valid', () => {
        it('should not throw for base explore selections', () => {
            const selectedFieldIds = [
                'users_user_id',
                'users_user_name',
                'users_total_users',
            ];

            expect(() =>
                validateSelectedFieldsExistence(mockExplore, selectedFieldIds),
            ).not.toThrow();

            expect(() =>
                validateSelectedFieldsExistence(mockExplore, []),
            ).not.toThrow();
        });

        it('should not throw when joined table fields are selected', () => {
            const selectedFieldIds = ['users_user_id', 'orders_order_id'];

            expect(() =>
                validateSelectedFieldsExistence(mockExplore, selectedFieldIds),
            ).not.toThrow();
        });

        it('should not throw when fields exist across all sources', () => {
            const selectedFieldIds = [
                'users_user_id',
                'users_avg_metric',
                'running_total_calc',
            ];

            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'avg_metric',
                    label: 'Average Metric',
                    description: 'Average of user metric',
                    table: 'users',
                    baseDimensionName: 'user_id',
                    type: MetricType.AVERAGE,
                },
            ];

            const tableCalculations: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_calc',
                    displayName: 'Running Total',
                    fieldId: 'users_total_users',
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockExplore,
                    selectedFieldIds,
                    customMetrics,
                    tableCalculations,
                ),
            ).not.toThrow();
        });

        it('should not throw when fields exist only in custom metrics', () => {
            const customMetricSelectedFieldIds = ['users_custom_metric'];

            const customMetrics: CustomMetricBase[] = [
                {
                    name: 'custom_metric',
                    label: 'Custom Metric',
                    description: 'Sum of user values',
                    table: 'users',
                    baseDimensionName: 'user_id',
                    type: MetricType.SUM,
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockExplore,
                    customMetricSelectedFieldIds,
                    customMetrics,
                ),
            ).not.toThrow();

            const aiAdditionalMetricSelectedFieldIds = ['users_custom_average'];
            const aiAdditionalMetric: Omit<AdditionalMetric, 'sql'> = {
                table: 'users',
                name: 'custom_average',
                label: 'Custom Average',
                type: MetricType.AVERAGE,
            };

            expect(() =>
                validateSelectedFieldsExistence(
                    mockExplore,
                    aiAdditionalMetricSelectedFieldIds,
                    [aiAdditionalMetric],
                ),
            ).not.toThrow();
        });

        it('should not throw when fields exist only in table calculations', () => {
            const tableCalcSchemaSelectedFieldIds = ['percent_change_calc'];

            const tableCalcSchema: TableCalcsSchema = [
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change_calc',
                    displayName: 'Percent Change',
                    fieldId: 'users_total_users',
                    orderBy: [],
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockExplore,
                    tableCalcSchemaSelectedFieldIds,
                    null,
                    tableCalcSchema,
                ),
            ).not.toThrow();

            const tableCalculationSelectedFieldIds = ['ai_running_total'];

            const tableCalculations: TableCalculation[] = [
                {
                    name: 'ai_running_total',
                    displayName: 'AI Running Total',
                    sql: '${TABLE}.total_users',
                },
            ];

            expect(() =>
                validateSelectedFieldsExistence(
                    mockExplore,
                    tableCalculationSelectedFieldIds,
                    null,
                    tableCalculations,
                ),
            ).not.toThrow();
        });
    });

    describe('when selected fields are invalid', () => {
        it('should throw when fields do not exist in any source', () => {
            const selectedFieldIds = [
                'users_user_id',
                'non_existent_field',
                'another_missing_field',
            ];

            expect(() =>
                validateSelectedFieldsExistence(mockExplore, selectedFieldIds),
            ).toThrow(
                /The following fields are neither in the explore nor in the custom metrics/,
            );

            expect(() =>
                validateSelectedFieldsExistence(mockExplore, selectedFieldIds),
            ).toThrow(/non_existent_field/);

            expect(() =>
                validateSelectedFieldsExistence(mockExplore, selectedFieldIds),
            ).toThrow(/another_missing_field/);
        });
    });
});
