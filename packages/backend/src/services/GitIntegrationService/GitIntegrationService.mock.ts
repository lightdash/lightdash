import {
    AdditionalMetric,
    CompiledDimension,
    CustomDimensionType,
    CustomSqlDimension,
    DimensionType,
    Explore,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    SupportedDbtVersions,
} from '@lightdash/common';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';

const dimension = (
    table: string,
    name: string,
    sql: string,
    index: number,
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table,
    tableLabel: table,
    sql,
    compiledSql: sql,
    tablesReferences: [table],
    hidden: false,
    index,
});

const table = (
    name: string,
    dimensions: CompiledDimension[],
    extra: Partial<Explore['tables'][string]> = {},
): Explore['tables'][string] => ({
    name,
    label: name,
    database: 'db',
    schema: 'schema',
    sqlTable: name,
    dimensions: Object.fromEntries(dimensions.map((dim) => [dim.name, dim])),
    metrics: {},
    lineageGraph: {},
    ...extra,
});

/**
 * table_a with a repeated struct `items` (unnested as table_a__items) and a
 * repeated scalar `tags` (unnested as table_a__tags), plus a plain table_b.
 */
export const EXPLORE: Explore = {
    name: 'table_a',
    label: 'table_a',
    tags: [],
    baseTable: 'table_a',
    targetDatabase: SupportedDbtAdapter.BIGQUERY,
    joinedTables: [],
    tables: {
        table_a: table('table_a', [
            dimension('table_a', 'dim_a', '${TABLE}.dim_a', 0),
            dimension('table_a', 'dim_b', '${TABLE}.dim_b', 1),
        ]),
        table_a__items: table(
            'table_a__items',
            [
                dimension('table_a__items', 'sku', '${TABLE}.sku', 0),
                dimension(
                    'table_a__items',
                    'offset',
                    '`table_a__items__offset`',
                    1,
                ),
            ],
            {
                nestedFrom: {
                    parentTable: 'table_a',
                    columnPath: 'items',
                    elementSql: '`table_a__items`',
                    offsetSql: '`table_a__items__offset`',
                    joinCondition: 'TRUE',
                },
            },
        ),
        table_a__tags: table(
            'table_a__tags',
            [
                dimension('table_a__tags', 'value', '${TABLE}', 0),
                dimension(
                    'table_a__tags',
                    'offset',
                    '`table_a__tags__offset`',
                    1,
                ),
            ],
            {
                nestedFrom: {
                    parentTable: 'table_a',
                    columnPath: 'tags',
                    elementSql: '`table_a__tags`',
                    offsetSql: '`table_a__tags__offset`',
                    joinCondition: 'TRUE',
                },
            },
        ),
        table_b: table('table_b', [
            dimension('table_b', 'dim_a', '${TABLE}.dim_a', 0),
        ]),
    },
};

export const PROJECT_MODEL = {
    findExploreContainingTable: vi.fn().mockResolvedValue(EXPLORE),
    getAllExploresFromCache: vi.fn().mockResolvedValue({
        another_explore: {
            tables: { table_a: { ymlPath: 'models/nested/original.yaml' } },
        },
    }),
    getExploreFromCache: vi.fn(() => ({ ymlPath: 'path/to/schema.yml' })),
    getWarehouseCredentialsForProject: vi.fn(() => ({})),
    getWarehouseClientFromCredentials: vi.fn(() => warehouseClientMock),
    get: vi.fn(() =>
        Promise.resolve({
            projectUuid: 'projectUuid',
            name: 'Project',
            dbtVersion: SupportedDbtVersions.V1_9,
            dbtConnection: {
                type: 'github',
                repository: 'owner/repo',
                branch: 'main',
                project_sub_path: 'path',
            },
        }),
    ),
};
export const PROJECT_DBT_SOURCES_MODEL = {
    getSources: vi.fn().mockResolvedValue([]),
};
export const SAVED_CHART_MODEL = {};
export const SPACE_MODEL = {};
export const GITHUB_APP_MODEL = {
    getInstallationId: vi.fn().mockResolvedValue('installation-id'),
    getAuth: vi.fn().mockResolvedValue({
        token: 'token',
        refreshToken: 'refresh-token',
    }),
    updateAuth: vi.fn(),
};

// Mock schema file with comments, different multi-line strings, different types of quotes, different types of arrays
export const SCHEMA_YML = `
# comment at the top
version: 2
models:
  - name: table_a
    description: |
      # Description
      This table has basic information
    columns:
      - name: dim_a
        tests:
          - unique
          - not_null
        meta:
          metrics:
            metric_a:
              type: count_distinct
            metric_b:
              type: sum
  - name: table_b
    description: >-
      # Description
      This table has basic information
    columns:
      - name: dim_a
        tests: ["unique", 'not_null']
        meta:
          metrics:
            metric_a:
              type: count_distinct
            metric_b:
              type: sum
`;

export const CUSTOM_METRIC: AdditionalMetric = {
    name: 'new_metric',
    description: 'description',
    sql: 'sql',
    type: MetricType.AVERAGE,
    table: 'table_a',
    baseDimensionName: 'dim_a',
};

export const CUSTOM_DIMENSION: CustomSqlDimension = {
    id: 'amount_size',
    name: 'amount size',
    type: CustomDimensionType.SQL,
    table: 'table_a',
    sql: '${table_a.dim_a}',
    dimensionType: DimensionType.STRING,
};

export const EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC = `# comment at the top
version: 2
models:
  - name: table_a
    description: |
      # Description
      This table has basic information
    columns:
      - name: dim_a
        tests:
          - unique
          - not_null
        meta:
          metrics:
            metric_a:
              type: count_distinct
            metric_b:
              type: sum
            new_metric:
              label: New metric
              description: description
              type: average
              format: '#,##0.###'
  - name: table_b
    description: >-
      # Description This table has basic information
    columns:
      - name: dim_a
        tests: [ "unique", 'not_null' ]
        meta:
          metrics:
            metric_a:
              type: count_distinct
            metric_b:
              type: sum
`;

export const EXPECTED_SCHEMA_YML_WITH_CUSTOM_DIMENSION = `\
# comment at the top
version: 2
models:
  - name: table_a
    description: |
      # Description
      This table has basic information
    columns:
      - name: dim_a
        tests:
          - unique
          - not_null
        meta:
          metrics:
            metric_a:
              type: count_distinct
            metric_b:
              type: sum
          additional_dimensions:
            amount_size:
              label: Amount size
              type: string
              sql: \${table_a.dim_a}
  - name: table_b
    description: >-
      # Description This table has basic information
    columns:
      - name: dim_a
        tests: [ "unique", 'not_null' ]
        meta:
          metrics:
            metric_a:
              type: count_distinct
            metric_b:
              type: sum
`;
