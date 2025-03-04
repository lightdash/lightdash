// Mock schema file with comments, different multi-line strings, different types of quotes, different types of arrays
import {
    CustomDimensionType,
    type CustomSqlDimension,
    DimensionType,
    MetricType,
} from '../../types/field';
import { type AdditionalMetric } from '../../types/metricQuery';

export const SCHEMA_YML = `# comment at the top
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

export const SCHEMA_JSON = {
    version: 2,
    models: [
        {
            name: 'table_a',
            description: '# Description\nThis table has basic information\n',
            columns: [
                {
                    name: 'dim_a',
                    tests: ['unique', 'not_null'],
                    meta: {
                        metrics: {
                            metric_a: {
                                type: 'count_distinct',
                            },
                            metric_b: {
                                type: 'sum',
                            },
                        },
                    },
                },
            ],
        },
        {
            name: 'table_b',
            description: '# Description This table has basic information',
            columns: [
                {
                    name: 'dim_a',
                    tests: ['unique', 'not_null'],
                    meta: {
                        metrics: {
                            metric_a: {
                                type: 'count_distinct',
                            },
                            metric_b: {
                                type: 'sum',
                            },
                        },
                    },
                },
            ],
        },
    ],
};

// invalid schema: models require a `name` field
export const INVALID_SCHEMA_YML = `
version: 2
models:
 - label: table_a
`;

export const CUSTOM_METRIC: AdditionalMetric = {
    name: 'new_metric',
    description: 'description',
    sql: 'sql',
    type: MetricType.AVERAGE,
    table: 'table_a',
    baseDimensionName: 'dim_a',
};

export const CUSTOM_SQL_DIMENSION: CustomSqlDimension = {
    id: 'id',
    name: 'sql_dimension',
    table: 'table_a',
    type: CustomDimensionType.SQL,
    sql: '${table_a.dim_a} || "suffix"',
    dimensionType: DimensionType.STRING,
};

// eslint-disable-next-line no-useless-escape
export const EXPECTED_SCHEMA_YML_WITH_NEW_METRICS_AND_DIMENSIONS = `# comment at the top
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
              format: "#,##0.000"
          additional_dimensions:
            id:
              label: Sql dimension
              name: id
              description: ""
              type: string
              sql: \${table_a.dim_a} || "suffix"
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

export const NEW_MODEL = {
    name: 'new_model',
    description: `SQL model for testing`,
    meta: {
        label: 'New model',
    },
    columns: [
        {
            name: 'new_column',
            meta: {
                dimension: {
                    type: DimensionType.STRING,
                },
            },
        },
    ],
};

export const EXPECTED_SCHEMA_JSON_WITH_NEW_MODEL = {
    models: [NEW_MODEL],
};

export const EXPECTED_SCHEMA_YML_WITH_NEW_MODEL = `models:
  - name: new_model
    description: SQL model for testing
    meta:
      label: New model
    columns:
      - name: new_column
        meta:
          dimension:
            type: string
`;
