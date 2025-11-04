// Mock schema file with comments, different multi-line strings, different types of quotes, different types of arrays
import {
    BinType,
    type CustomBinDimension,
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

export const SIMPLE_SCHEMA = `version: 2
models:
  - name: test_table
    columns:
      - name: test_column
        description: A test column`;

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

export const FIXED_WIDTH_BIN_DIMENSION: CustomBinDimension = {
    id: 'fixed_width_id',
    name: 'fixed width name',
    table: 'table_a',
    dimensionId: 'table_a_dim_a',
    type: CustomDimensionType.BIN,
    binType: BinType.FIXED_WIDTH,
    binWidth: 10,
};

export const CUSTOM_RANGE_BIN_DIMENSION: CustomBinDimension = {
    id: 'range_id',
    name: 'range name',
    table: 'table_a',
    dimensionId: 'table_a_dim_a',
    type: CustomDimensionType.BIN,
    binType: BinType.CUSTOM_RANGE,
    customRange: [
        {
            from: 0,
            to: 10,
        },
        {
            from: 11,
            to: 20,
        },
    ],
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
              format: "#,##0.###"
          additional_dimensions:
            id:
              label: Sql dimension
              type: string
              sql: \${table_a.dim_a} || "suffix"
            fixed_width_id:
              label: Fixed width name
              type: string
              sql: CONCAT(FLOOR(\${TABLE}.dim_a / 10) * 10, ' - ', (FLOOR(\${TABLE}.dim_a / 10)
                + 1) * 10 - 1)
            range_id:
              label: Range name
              type: string
              sql: >-
                CASE
                            WHEN \${TABLE}.dim_a IS NULL THEN NULL
                WHEN \${TABLE}.dim_a >= 0 AND \${TABLE}.dim_a < 10 THEN CONCAT(0,
                '-', 10)

                WHEN \${TABLE}.dim_a >= 11 AND \${TABLE}.dim_a < 20 THEN
                CONCAT(11, '-', 20)
                            END
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
