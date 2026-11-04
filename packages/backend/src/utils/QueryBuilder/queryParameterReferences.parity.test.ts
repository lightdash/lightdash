import {
    CustomDimensionType,
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    ExploreCompiler,
    FieldType,
    FilterOperator,
    getQueryParameterReferences,
    JoinRelationship,
    MetricType,
    type Explore,
    type LightdashProjectConfig,
    type MetricQuery,
    type ParametersValuesMap,
    type UncompiledExplore,
} from '@lightdash/common';
import { compileMetricQuery } from '../../queryCompiler';
import { MetricQueryBuilder } from './MetricQueryBuilder';
import {
    CUSTOM_SQL_DIMENSION,
    EXPLORE,
    EXPLORE_JOIN_CHAIN,
    EXPLORE_WITH_REQUIRED_FILTERS,
    EXPLORE_WITH_SQL_FILTER,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    METRIC_QUERY_JOIN_CHAIN,
    METRIC_QUERY_TWO_TABLES,
    METRIC_QUERY_WITH_ADDITIONAL_METRIC,
    METRIC_QUERY_WITH_CUSTOM_SQL_DIMENSION,
    METRIC_QUERY_WITH_FILTER,
    METRIC_QUERY_WITH_METRIC_FILTER,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';

const projectParameters: NonNullable<LightdashProjectConfig['parameters']> = {
    region: { label: 'Region' },
    schema: { label: 'Schema' },
    threshold: { label: 'Threshold', type: 'number' },
    factor: { label: 'Factor', type: 'number' },
    currency: { label: 'Currency' },
    status: { label: 'Status' },
};
const parameters: ParametersValuesMap = {
    region: 'EU',
    schema: 'public',
    threshold: 18,
    factor: 2,
    currency: 'USD',
    status: 'active',
};

const compileExplore = (overrides: Partial<UncompiledExplore>): Explore =>
    new ExploreCompiler(warehouseClientMock).compileExplore({
        ...EXPLORE,
        meta: {},
        spotlightConfig: DEFAULT_SPOTLIGHT_CONFIG,
        projectParameters,
        ...overrides,
    });

/** What the compiler reports after building the full SQL under the same inputs. */
const compilerParameterReferences = (
    explore: Explore,
    metricQuery: MetricQuery,
): Set<string> =>
    new MetricQueryBuilder({
        explore,
        compiledMetricQuery: compileMetricQuery({
            explore,
            metricQuery,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: Object.keys(projectParameters),
        }),
        warehouseSqlBuilder: warehouseClientMock,
        userAttributes: { country: ['US'] },
        intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
        timezone: QUERY_BUILDER_UTC_TIMEZONE,
        parameters,
        parameterDefinitions: projectParameters,
    }).compileQuery().parameterReferences;

const { table1 } = EXPLORE.tables;
const { table2 } = EXPLORE.tables;
const regionDimension = {
    ...table1.dimensions.shared,
    name: 'region',
    label: 'region',
    sql: "CASE WHEN ${TABLE}.shared = ${lightdash.parameters.region} THEN 'home' ELSE 'away' END",
};
const exploreWithRegionDimension = compileExplore({
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...table1,
            dimensions: { ...table1.dimensions, region: regionDimension },
        },
    },
});

type ParityCase = {
    name: string;
    explore: Explore;
    metricQuery: MetricQuery;
    expected: string[];
};

const parameterCases: ParityCase[] = [
    {
        name: 'base table sql_where',
        explore: compileExplore({
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...table1,
                    sqlWhere:
                        '${TABLE}.shared = ${lightdash.parameters.region}',
                },
            },
        }),
        metricQuery: METRIC_QUERY,
        expected: ['region'],
    },
    {
        name: 'joined table sql_from, when the join is used',
        explore: compileExplore({
            tables: {
                ...EXPLORE.tables,
                table2: {
                    ...table2,
                    sqlTable: '"db".${ld.parameters.schema}."table2"',
                },
            },
        }),
        metricQuery: METRIC_QUERY_TWO_TABLES,
        expected: ['schema'],
    },
    {
        name: 'joined table sql_from, when the join is not used',
        explore: compileExplore({
            tables: {
                ...EXPLORE.tables,
                table2: {
                    ...table2,
                    sqlTable: '"db".${ld.parameters.schema}."table2"',
                },
            },
        }),
        metricQuery: METRIC_QUERY,
        expected: [],
    },
    {
        name: 'join sql_on',
        explore: compileExplore({
            joinedTables: [
                {
                    table: 'table2',
                    sqlOn: "${table1.shared} = ${table2.shared} AND ${lightdash.parameters.status} = 'active'",
                    relationship: JoinRelationship.MANY_TO_ONE,
                },
            ],
        }),
        metricQuery: METRIC_QUERY_TWO_TABLES,
        expected: ['status'],
    },
    {
        name: 'selected dimension sql',
        explore: exploreWithRegionDimension,
        metricQuery: {
            ...METRIC_QUERY,
            dimensions: ['table1_dim1', 'table1_region'],
        },
        expected: ['region'],
    },
    {
        name: 'unselected dimension sql',
        explore: exploreWithRegionDimension,
        metricQuery: METRIC_QUERY,
        expected: [],
    },
    {
        name: 'custom SQL dimension',
        explore: compileExplore({}),
        metricQuery: {
            ...METRIC_QUERY,
            dimensions: ['table1_dim1', 'is_big'],
            customDimensions: [
                {
                    id: 'is_big',
                    name: 'Is big',
                    table: 'table1',
                    type: CustomDimensionType.SQL,
                    sql: '${table1.dim1} > ${lightdash.parameters.threshold}',
                    dimensionType: DimensionType.BOOLEAN,
                },
            ],
        },
        expected: ['threshold'],
    },
    {
        name: 'custom metric filtered on a parameterised dimension',
        explore: exploreWithRegionDimension,
        metricQuery: {
            ...METRIC_QUERY,
            metrics: ['table1_home_count'],
            sorts: [],
            tableCalculations: [],
            additionalMetrics: [
                {
                    type: MetricType.COUNT,
                    table: 'table1',
                    name: 'home_count',
                    sql: '${TABLE}.dim1',
                    filters: [
                        {
                            id: 'home',
                            target: { fieldRef: 'table1.region' },
                            operator: FilterOperator.EQUALS,
                            values: ['home'],
                        },
                    ],
                },
            ],
        },
        expected: ['region'],
    },
    {
        name: 'table calculation',
        explore: compileExplore({}),
        metricQuery: {
            ...METRIC_QUERY,
            tableCalculations: [
                {
                    name: 'scaled',
                    displayName: 'Scaled',
                    sql: '${table1.metric1} * ${lightdash.parameters.factor}',
                },
            ],
        },
        expected: ['factor'],
    },
    {
        name: 'metric format string',
        explore: compileExplore({
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...table1,
                    metrics: {
                        ...table1.metrics,
                        priced: {
                            type: MetricType.SUM,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'priced',
                            label: 'priced',
                            sql: '${TABLE}.number_column',
                            format: '${ld.parameters.currency=="USD"?"$":"€"}0.00',
                            hidden: false,
                        },
                    },
                },
            },
        }),
        metricQuery: {
            ...METRIC_QUERY,
            metrics: ['table1_priced'],
            sorts: [],
            tableCalculations: [],
        },
        expected: ['currency'],
    },
];

const existingFixtures: ParityCase[] = (
    [
        [EXPLORE, METRIC_QUERY],
        [EXPLORE, METRIC_QUERY_TWO_TABLES],
        [EXPLORE, METRIC_QUERY_WITH_FILTER],
        [EXPLORE, METRIC_QUERY_WITH_METRIC_FILTER],
        [EXPLORE, METRIC_QUERY_WITH_ADDITIONAL_METRIC],
        [
            EXPLORE,
            {
                ...METRIC_QUERY_WITH_CUSTOM_SQL_DIMENSION,
                customDimensions: [CUSTOM_SQL_DIMENSION],
            },
        ],
        [EXPLORE_WITH_SQL_FILTER, METRIC_QUERY],
        [EXPLORE_WITH_REQUIRED_FILTERS, METRIC_QUERY],
        [EXPLORE_JOIN_CHAIN, METRIC_QUERY_JOIN_CHAIN],
    ] satisfies [Explore, MetricQuery][]
).map(([explore, metricQuery], index) => ({
    name: `MetricQueryBuilder fixture ${index + 1} (${explore.name})`,
    explore,
    metricQuery,
    expected: [],
}));

describe('getQueryParameterReferences matches MetricQueryBuilder.compileQuery', () => {
    it.each([...parameterCases, ...existingFixtures])(
        '$name',
        ({ explore, metricQuery, expected }) => {
            const compiled = compilerParameterReferences(explore, metricQuery);
            expect(compiled).toEqual(new Set(expected));
            expect(
                new Set(getQueryParameterReferences(explore, metricQuery)),
            ).toEqual(compiled);
        },
    );
});
