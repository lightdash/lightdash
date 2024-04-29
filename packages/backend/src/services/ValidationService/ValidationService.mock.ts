import { Ability } from '@casl/ability';
import {
    ChartType,
    Dashboard,
    DashboardTileTypes,
    DimensionType,
    Explore,
    ExploreError,
    FieldType,
    FilterOperator,
    InlineErrorType,
    LightdashMode,
    MetricType,
    OrganizationMemberRole,
    SavedChart,
    SessionUser,
    ShareUrl,
    SupportedDbtAdapter,
    TablesConfiguration,
    TableSelectionType,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

export const config = {
    mode: LightdashMode.DEFAULT,
    siteUrl: 'https://test.lightdash.cloud',
} as LightdashConfig;

export const project = { organizationUuid: 'orgUuid' };
export const user: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid: 'organizationUuid',
    organizationName: 'organizationName',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability([
        {
            subject: 'Validation',
            action: ['manage'],
        },
    ]),
    isActive: true,
    abilityRules: [],
};

export const chart: SavedChart = {
    uuid: 'chartUuid',
    projectUuid: 'projectUuid',
    dashboardUuid: null,
    dashboardName: null,
    name: 'Test chart',
    slug: 'charts/space-name/test-chat',
    tableName: 'table',
    updatedAt: new Date('2021-01-01'),
    updatedByUser: {
        userUuid: 'userUuid',
        firstName: 'David',
        lastName: 'Attenborough',
    },
    metricQuery: {
        exploreName: 'table',
        dimensions: ['table_dimension'],
        metrics: ['table_metric'],
        filters: {
            dimensions: {
                id: 'dimensionFilterUuid',
                and: [
                    {
                        id: '',
                        target: { fieldId: 'table_dimension' },
                        values: ['2018-01-01'],
                        operator: FilterOperator.EQUALS,
                    },
                ],
            },
            metrics: {
                id: 'metricFilterUuid',
                or: [
                    {
                        id: '',
                        target: { fieldId: 'table_metric' },
                        values: ['2018-01-01'],
                        operator: FilterOperator.EQUALS,
                    },
                    {
                        id: '',
                        target: { fieldId: 'table_custom_metric' },
                        values: [10],
                        operator: FilterOperator.EQUALS,
                    },
                ],
            },
        },
        sorts: [
            {
                fieldId: 'table_dimension',
                descending: false,
            },
        ],
        tableCalculations: [
            {
                name: 'table_calculation',
                displayName: 'myTableCalculation',
                sql: '1 + ${table_dimension} + ${table_metric}',
            },
        ],
        additionalMetrics: [
            {
                table: 'table',
                name: 'custom_metric',
                type: MetricType.MAX,
                label: 'Count of dimension',
                description: 'Count of dimension',
                sql: '${TABLE}.dimension',
                baseDimensionName: 'dimension',
            },
        ],
        limit: 10,
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'payments_payment_method',
                yField: [
                    'payments_total_revenue',
                    'payments_unique_payment_count',
                ],
                flipAxes: true,
            },
            eChartsConfig: {
                legend: {
                    show: true,
                    orient: 'horizontal',
                },
                series: [],
            },
        },
    },
    tableConfig: {
        columnOrder: [
            'table_dimension',
            'table_metric',
            'table_custom_metric',
            'table_calculation',
        ],
    },
    organizationUuid: 'orgUuid',
    spaceUuid: 'spaceUuid',
    spaceName: 'space name',
    pinnedListUuid: null,
    pinnedListOrder: null,
    colorPalette: [],
    isPrivate: false,
    access: [],
};

export const chartWithJoinedField: SavedChart = {
    ...chart,
    tableName: 'another_table',
    metricQuery: {
        ...chart.metricQuery,
        dimensions: ['table_dimension', 'another_table_dimension'],
        metrics: ['table_metric', 'another_table_metric'],
        sorts: [
            {
                fieldId: 'another_table_dimension',
                descending: false,
            },
        ],
    },
};

export const dashboard: Dashboard = {
    organizationUuid: 'orgUuid',
    projectUuid: 'projectUuid',
    dashboardVersionId: 1,
    uuid: 'dashboardUuid',
    name: 'test dashboard',
    slug: 'dashboards/space-name/test-dashboard',
    updatedAt: new Date(),
    tiles: [
        {
            uuid: 'tileUuid',
            type: DashboardTileTypes.SAVED_CHART,
            properties: {
                title: 'test chart',
                savedChartUuid: 'chartUuid',
                belongsToDashboard: false,
            },
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            // TODO: remove
            tabUuid: 'tabUuid',
        },
    ],
    filters: {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
    spaceUuid: '',
    spaceName: '',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    isPrivate: false,
    access: [],
    tabs: [],
};

export const explore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'valid_explore',
    label: 'valid_explore',
    tags: [],
    baseTable: 'table',
    joinedTables: [],
    tables: {
        table: {
            name: 'table',
            label: 'table',
            database: 'database',
            schema: 'schema',
            sqlTable: 'test.table',
            dimensions: {
                dimension: {
                    table: 'table',
                    tableLabel: 'table',
                    sql: 'sql',
                    name: 'dimension',
                    label: 'dimension',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    compiledSql: 'compiledSql',
                    tablesReferences: undefined,
                    hidden: false,
                },
            },
            metrics: {
                myMetric: {
                    table: 'table',
                    tableLabel: 'table',
                    sql: 'sql',
                    name: 'metric',
                    label: 'metric',
                    fieldType: FieldType.METRIC,
                    type: MetricType.NUMBER,
                    isAutoGenerated: false,
                    compiledSql: 'compiledSql',
                    tablesReferences: undefined,
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

export const exploreWithoutDimension: Explore = {
    ...explore,
    tables: {
        table: {
            ...explore.tables.table,
            dimensions: {},
        },
    },
};
export const exploreWithoutMetric: Explore = {
    ...explore,
    tables: {
        table: {
            ...explore.tables.table,
            metrics: {},
        },
    },
};

export const exploreWithJoin: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'joined_explore',
    label: 'joined_explore',
    tags: [],
    baseTable: 'another_table',
    joinedTables: [], // This would normally be set, but we don't need it for this test
    tables: {
        table: explore.tables.table, // same as explore
        another_table: {
            name: 'another_table',
            label: 'another_table',
            database: 'database',
            schema: 'schema',
            sqlTable: 'test.table',
            dimensions: {
                dimension: {
                    table: 'another_table',
                    tableLabel: 'another_table',
                    sql: 'sql',
                    name: 'dimension',
                    label: 'dimension',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    compiledSql: 'compiledSql',
                    tablesReferences: undefined,
                    hidden: false,
                },
            },
            metrics: {
                myMetric: {
                    table: 'another_table',
                    tableLabel: 'another_table',
                    sql: 'sql',
                    name: 'metric',
                    label: 'metric',
                    fieldType: FieldType.METRIC,
                    type: MetricType.NUMBER,
                    isAutoGenerated: false,
                    compiledSql: 'compiledSql',
                    tablesReferences: undefined,
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

export const exploreError: ExploreError = {
    name: 'valid_explore',
    label: 'valid_explore',
    tags: [],
    baseTable: 'table',
    joinedTables: [],
    tables: {},
    errors: [
        {
            message:
                'Model "valid_explore" has a dimension reference: ${is_completed} which matches no dimension',
            type: InlineErrorType.METADATA_PARSE_ERROR,
        },
    ],
};

export const tableConfiguration: TablesConfiguration = {
    tableSelection: {
        type: TableSelectionType.ALL,
        value: [],
    },
};
