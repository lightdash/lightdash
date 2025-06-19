import {
    AdditionalMetric,
    CustomDimensionType,
    CustomSqlDimension,
    DimensionType,
    MetricType,
} from '@lightdash/common';
import { warehouseClientMock } from '../../utils/QueryBuilder/queryBuilder.mock';

export const PROJECT_MODEL = {
    getExploreFromCache: jest.fn(() => ({ ymlPath: 'path/to/schema.yml' })),
    getWarehouseCredentialsForProject: jest.fn(() => ({})),
    getWarehouseClientFromCredentials: jest.fn(() => warehouseClientMock),
};
export const SAVED_CHART_MODEL = {};
export const SPACE_MODEL = {};
export const GITHUB_APP_MODEL = {};

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
              format: '#,##0.000'
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
