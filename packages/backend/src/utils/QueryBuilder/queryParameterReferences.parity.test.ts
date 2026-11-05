import {
    BinType,
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
    EXPLORE,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    METRIC_QUERY_TWO_TABLES,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';

const tableParameters: NonNullable<LightdashProjectConfig['parameters']> = {
    tier: { label: 'Tier' },
};
const projectParameters: NonNullable<LightdashProjectConfig['parameters']> = {
    region: { label: 'Region' },
    schema: { label: 'Schema' },
    threshold: { label: 'Threshold', type: 'number' },
    factor: { label: 'Factor', type: 'number' },
    currency: { label: 'Currency' },
    status: { label: 'Status' },
};
// Model parameters go by their dotted name once compiled
const parameterDefinitions = {
    ...projectParameters,
    'table1.tier': tableParameters.tier,
};
const parameters: ParametersValuesMap = {
    'table1.tier': 'gold',
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
            availableParameters: Object.keys(parameterDefinitions),
        }),
        warehouseSqlBuilder: warehouseClientMock,
        userAttributes: { country: ['US'] },
        intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
        timezone: QUERY_BUILDER_UTC_TIMEZONE,
        parameters,
        parameterDefinitions,
    }).compileQuery().parameterReferences;

const { table1 } = EXPLORE.tables;
const { table2 } = EXPLORE.tables;
// The mock explore is already compiled; references to a dimension that still
// carries compiledSql reuse it instead of compiling its sql again
const { compiledSql, tablesReferences, ...sharedDimension } =
    table1.dimensions.shared;
const regionDimension = {
    ...sharedDimension,
    name: 'region',
    label: 'region',
    sql: "CASE WHEN ${TABLE}.shared = ${lightdash.parameters.region} THEN 'home' ELSE 'away' END",
};
const scaledDimension = {
    ...sharedDimension,
    type: DimensionType.NUMBER,
    name: 'scaled',
    label: 'scaled',
    sql: '${TABLE}.dim1 * ${lightdash.parameters.factor}',
};
const table1WithRegion = {
    ...table1,
    dimensions: {
        ...table1.dimensions,
        region: regionDimension,
        scaled: scaledDimension,
    },
};
const exploreWithRegionDimension = compileExplore({
    tables: { ...EXPLORE.tables, table1: table1WithRegion },
});
const table2WithRegion = {
    ...table2,
    dimensions: {
        ...table2.dimensions,
        region: { ...regionDimension, table: 'table2' },
    },
};
const table1WithTier = {
    ...table1,
    parameters: tableParameters,
    dimensions: {
        ...table1.dimensions,
        tier: {
            ...sharedDimension,
            name: 'tier',
            label: 'tier',
            sql: "CASE WHEN ${TABLE}.shared = ${lightdash.parameters.table1.tier} THEN 'top' ELSE 'rest' END",
        },
    },
};

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
        name: 'filter on an unselected parameterised dimension',
        explore: exploreWithRegionDimension,
        metricQuery: {
            ...METRIC_QUERY,
            filters: {
                dimensions: {
                    id: 'f',
                    and: [
                        {
                            id: 'r',
                            target: { fieldId: 'table1_region' },
                            operator: FilterOperator.EQUALS,
                            values: ['home'],
                        },
                    ],
                },
            },
        },
        expected: ['region'],
    },
    {
        name: 'model required filter on a parameterised dimension',
        explore: compileExplore({
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...table1WithRegion,
                    requiredFilters: [
                        {
                            id: 'required',
                            target: { fieldRef: 'table1.region' },
                            operator: FilterOperator.EQUALS,
                            values: ['home'],
                            required: true,
                        },
                    ],
                },
            },
        }),
        metricQuery: METRIC_QUERY,
        expected: ['region'],
    },
    {
        name: 'always join whose sql_from carries a parameter',
        explore: compileExplore({
            joinedTables: [{ ...EXPLORE.joinedTables[0], always: true }],
            tables: {
                ...EXPLORE.tables,
                table2: {
                    ...table2,
                    sqlTable: '"db".${ld.parameters.schema}."table2"',
                },
            },
        }),
        metricQuery: METRIC_QUERY,
        expected: ['schema'],
    },
    {
        name: "base sql_where on a joined table's parameterised dimension",
        explore: compileExplore({
            tables: {
                ...EXPLORE.tables,
                table1: { ...table1, sqlWhere: "${table2.region} = 'home'" },
                table2: table2WithRegion,
            },
        }),
        metricQuery: METRIC_QUERY,
        expected: ['region'],
    },
    {
        name: 'custom SQL dimension on a parameterised dimension',
        explore: exploreWithRegionDimension,
        metricQuery: {
            ...METRIC_QUERY,
            dimensions: ['table1_dim1', 'is_home'],
            customDimensions: [
                {
                    id: 'is_home',
                    name: 'Is home',
                    table: 'table1',
                    type: CustomDimensionType.SQL,
                    sql: "${table1.region} = 'home'",
                    dimensionType: DimensionType.BOOLEAN,
                },
            ],
        },
        expected: ['region'],
    },
    {
        name: 'custom metric aggregating a parameterised dimension',
        explore: exploreWithRegionDimension,
        metricQuery: {
            ...METRIC_QUERY,
            metrics: ['table1_home_count'],
            sorts: [],
            tableCalculations: [],
            additionalMetrics: [
                {
                    type: MetricType.COUNT_DISTINCT,
                    table: 'table1',
                    name: 'home_count',
                    sql: '',
                    baseDimensionName: 'region',
                },
            ],
        },
        expected: ['region'],
    },
    {
        name: 'custom bin dimension on a parameterised dimension',
        explore: exploreWithRegionDimension,
        metricQuery: {
            ...METRIC_QUERY,
            dimensions: ['table1_dim1', 'scaled_bins'],
            customDimensions: [
                {
                    id: 'scaled_bins',
                    name: 'Scaled bins',
                    table: 'table1',
                    type: CustomDimensionType.BIN,
                    dimensionId: 'table1_scaled',
                    binType: BinType.FIXED_NUMBER,
                    binNumber: 3,
                },
            ],
        },
        expected: ['factor'],
    },
    {
        name: 'model parameter in a selected dimension',
        explore: compileExplore({
            tables: { ...EXPLORE.tables, table1: table1WithTier },
        }),
        metricQuery: {
            ...METRIC_QUERY,
            dimensions: ['table1_dim1', 'table1_tier'],
        },
        expected: ['table1.tier'],
    },
    {
        name: 'model parameter in sql_where',
        explore: compileExplore({
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...table1,
                    parameters: tableParameters,
                    sqlWhere: '${TABLE}.shared = ${ld.parameters.table1.tier}',
                },
            },
        }),
        metricQuery: METRIC_QUERY,
        expected: ['table1.tier'],
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

describe('getQueryParameterReferences matches MetricQueryBuilder.compileQuery', () => {
    it.each(parameterCases)('$name', ({ explore, metricQuery, expected }) => {
        const compiled = compilerParameterReferences(explore, metricQuery);
        expect(compiled).toEqual(new Set(expected));
        expect(
            new Set(getQueryParameterReferences(explore, metricQuery)),
        ).toEqual(compiled);
    });
});
