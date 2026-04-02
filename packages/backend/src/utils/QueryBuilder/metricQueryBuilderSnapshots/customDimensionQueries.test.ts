import { BinType, CustomDimensionType } from '@lightdash/common';
import {
    bigqueryClientMock,
    EXPLORE,
    METRIC_QUERY_WITH_CUSTOM_DIMENSION,
    METRIC_QUERY_WITH_CUSTOM_SQL_DIMENSION,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: custom dimension queries', () => {
    // Covers BigQuery numeric bin dimensions using bin-count mode, where the builder must emit
    // both the rendered bucket label and the hidden order column used for stable sorting.
    test('matches snapshot for a binned custom dimension query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                warehouseSqlBuilder: bigqueryClientMock,
                userAttributes: {},
            }),
        ).toMatchSnapshot();
    });

    // Covers fixed-width binning on BigQuery, protecting the alternate bucket-label SQL
    // and order-column generation for width-based custom dimensions.
    test('matches snapshot for a fixed-width custom dimension query in BigQuery', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    compiledCustomDimensions: [
                        {
                            id: 'age_range',
                            name: 'Age range',
                            type: CustomDimensionType.BIN,
                            dimensionId: 'table1_dim1',
                            table: 'table1',
                            binType: BinType.FIXED_WIDTH,
                            binWidth: 10,
                        },
                    ],
                },
                warehouseSqlBuilder: bigqueryClientMock,
                userAttributes: {},
            }),
        ).toMatchSnapshot();
    });

    // Covers a custom dimension combined with a table calculation, where the builder must project
    // the custom dimension alias cleanly into the final calculation-select layer.
    test('matches snapshot for a custom dimension query with a table calculation', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    tableCalculations: [
                        {
                            name: 'calc3',
                            displayName: '',
                            sql: '${table1.dim1} + 1',
                        },
                    ],
                    compiledTableCalculations: [
                        {
                            name: 'calc3',
                            displayName: '',
                            sql: '${table1.dim1} + 1',
                            compiledSql: 'table1_dim1 + 1',
                            dependsOn: [],
                        },
                    ],
                },
                warehouseSqlBuilder: bigqueryClientMock,
                userAttributes: {},
            }),
        ).toMatchSnapshot();
    });

    // Covers ordering directly by the custom dimension bucket, ensuring the generated SQL
    // sorts by the hidden bucket-order field rather than the display label.
    test('matches snapshot for a sorted custom dimension query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    sorts: [
                        {
                            fieldId: 'age_range',
                            descending: true,
                        },
                    ],
                },
                warehouseSqlBuilder: bigqueryClientMock,
                userAttributes: {},
            }),
        ).toMatchSnapshot();
    });

    // Covers the Postgres fixed-width bin path, which uses a different string-concatenation shape
    // from BigQuery while preserving the same bucket semantics and sort columns.
    test('matches snapshot for a fixed-width custom dimension query in Postgres', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    compiledCustomDimensions: [
                        {
                            id: 'age_range',
                            name: 'Age range',
                            type: CustomDimensionType.BIN,
                            dimensionId: 'table1_dim1',
                            table: 'table1',
                            binType: BinType.FIXED_WIDTH,
                            binWidth: 10,
                        },
                    ],
                },
                userAttributes: {},
            }),
        ).toMatchSnapshot();
    });

    // Covers raw custom SQL dimensions, protecting the path where a user-defined SQL expression
    // becomes a selected dimension with grouping and ordering in the final query.
    test('matches snapshot for a custom SQL dimension query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_CUSTOM_SQL_DIMENSION,
            }),
        ).toMatchSnapshot();
    });
});
