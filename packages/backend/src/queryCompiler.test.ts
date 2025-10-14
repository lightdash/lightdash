import {
    CompiledMetricQuery,
    CompileError,
    CustomDimensionType,
    DimensionType,
    MetricType,
    TableCalculation,
    TableCalculationTemplateType,
    WindowFunctionType,
} from '@lightdash/common';
import { compileMetricQuery } from './queryCompiler';
import {
    EXPLORE,
    METRIC_QUERY_DUPLICATE_NAME,
    METRIC_QUERY_INVALID_REFERENCE_FORMAT,
    METRIC_QUERY_MISSING_REFERENCE,
    METRIC_QUERY_NO_CALCS,
    METRIC_QUERY_VALID_REFERENCES,
    METRIC_QUERY_VALID_REFERENCES_COMPILED,
    METRIC_QUERY_WITH_ADDITIONAL_METRICS,
    METRIC_QUERY_WITH_ADDITIONAL_METRICS_COMPILED,
    METRIC_QUERY_WITH_INVALID_ADDITIONAL_METRIC,
} from './queryCompiler.mock';
import { warehouseClientMock } from './utils/QueryBuilder/MetricQueryBuilder.mock';

test('Should compile without table calculations', () => {
    const expected: CompiledMetricQuery = {
        ...METRIC_QUERY_NO_CALCS,
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
        compiledCustomDimensions: [],
    };
    expect(
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_NO_CALCS,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toStrictEqual(expected);
});

test('Should compile table calculations', () => {
    expect(
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_VALID_REFERENCES,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toStrictEqual(METRIC_QUERY_VALID_REFERENCES_COMPILED);
});

test('Should throw error when table calculation contains missing reference', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_MISSING_REFERENCE,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toThrowError(CompileError);
});

test('Should throw error when table calculation has invalid reference format', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_INVALID_REFERENCE_FORMAT,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toThrowError(CompileError);
});

test('Should throw error when table calculation has duplicate name', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_DUPLICATE_NAME,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toThrowError(CompileError);
});

test('Should compile query with additional metrics', () => {
    expect(
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_WITH_ADDITIONAL_METRICS,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toStrictEqual(METRIC_QUERY_WITH_ADDITIONAL_METRICS_COMPILED);
});

test('Should throw compile error if metric in non existent table', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_WITH_INVALID_ADDITIONAL_METRIC,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toThrowError(CompileError);
});

test('Should compile table calculations with references to other table calculations using CTEs', () => {
    const metricQueryWithTableCalcReferences = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'calc_a',
                displayName: 'Calc A',
                sql: '${table_3.metric_1} + 70',
            },
            {
                name: 'calc_b',
                displayName: 'Calc B',
                sql: '${calc_a} * 2',
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithTableCalcReferences,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    // Check that calc_a was compiled correctly and has a CTE
    const calcA = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_a',
    );
    expect(calcA?.compiledSql).toBe('"table_3_metric_1" + 70');

    // Check that calc_b references calc_a (CTE generation is now handled in MetricQueryBuilder)
    const calcB = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_b',
    );
    expect(calcB?.compiledSql).toBe('"calc_a" * 2');
});

test('Should detect circular dependencies in table calculations', () => {
    const metricQueryWithCircularDeps = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'calc_a',
                displayName: 'Calc A',
                sql: '${calc_b} + 10',
            },
            {
                name: 'calc_b',
                displayName: 'Calc B',
                sql: '${calc_a} * 2',
            },
        ],
    };

    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: metricQueryWithCircularDeps,
            warehouseSqlBuilder: warehouseClientMock,
            availableParameters: [],
        }),
    ).toThrowError(CompileError);
});

test('Should handle complex dependency chains with CTEs', () => {
    const metricQueryWithChain = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'calc_c',
                displayName: 'Calc C',
                sql: '(${calc_a} + ${calc_b}) / 2',
            },
            {
                name: 'calc_a',
                displayName: 'Calc A',
                sql: '${table_3.metric_1} + 70',
            },
            {
                name: 'calc_b',
                displayName: 'Calc B',
                sql: '${table_3.metric_1} * 1.5',
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithChain,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    // Check that all calculations are properly compiled in dependency order with CTEs
    const calcA = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_a',
    );
    const calcB = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_b',
    );
    const calcC = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_c',
    );

    expect(calcA?.compiledSql).toBe('"table_3_metric_1" + 70');

    expect(calcB?.compiledSql).toBe('"table_3_metric_1" * 1.5');

    // calc_c should reference both calc_a and calc_b from the most recent CTE that contains them
    expect(calcC?.compiledSql).toBe('("calc_a" + "calc_b") / 2');
});

test('Should compile table calculations with no references without CTEs', () => {
    const metricQueryWithSimpleCalcs = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'simple_calc_1',
                displayName: 'Simple Calc 1',
                sql: '${table_3.metric_1} + 100',
            },
            {
                name: 'simple_calc_2',
                displayName: 'Simple Calc 2',
                sql: '${table_3.metric_1} * 0.5',
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithSimpleCalcs,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    // Check that calculations without dependencies don't have CTEs
    const calc1 = result.compiledTableCalculations.find(
        (c) => c.name === 'simple_calc_1',
    );
    const calc2 = result.compiledTableCalculations.find(
        (c) => c.name === 'simple_calc_2',
    );

    expect(calc1?.compiledSql).toBe('"table_3_metric_1" + 100');

    expect(calc2?.compiledSql).toBe('"table_3_metric_1" * 0.5');
});

test('Should handle mixed scenarios with some CTEs and some inline calculations', () => {
    const metricQueryMixed = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'simple_calc',
                displayName: 'Simple Calc',
                sql: '${table_3.metric_1} + 50',
            },
            {
                name: 'dependent_calc',
                displayName: 'Dependent Calc',
                sql: '${simple_calc} * 2',
            },
            {
                name: 'another_simple',
                displayName: 'Another Simple',
                sql: '${table_3.metric_1} / 10',
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryMixed,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const simpleCalc = result.compiledTableCalculations.find(
        (c) => c.name === 'simple_calc',
    );
    const dependentCalc = result.compiledTableCalculations.find(
        (c) => c.name === 'dependent_calc',
    );
    const anotherSimple = result.compiledTableCalculations.find(
        (c) => c.name === 'another_simple',
    );

    // simple_calc should have a CTE because it's referenced by dependent_calc
    expect(simpleCalc?.compiledSql).toBe('"table_3_metric_1" + 50');

    // dependent_calc should reference simple_calc from CTE and have its own CTE
    expect(dependentCalc?.compiledSql).toBe('"simple_calc" * 2');

    // another_simple should not have a CTE since it's not referenced
    expect(anotherSimple?.compiledSql).toBe('"table_3_metric_1" / 10');
});

test('Should handle table calculation referencing two other table calculations', () => {
    const metricQueryWithMultipleRefs = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'base_calc_1',
                displayName: 'Base Calc 1',
                sql: '${table_3.metric_1} + 10',
            },
            {
                name: 'base_calc_2',
                displayName: 'Base Calc 2',
                sql: '${table_3.metric_1} * 2',
            },
            {
                name: 'combined_calc',
                displayName: 'Combined Calc',
                sql: '${base_calc_1} + ${base_calc_2}',
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithMultipleRefs,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const baseCalc1 = result.compiledTableCalculations.find(
        (c) => c.name === 'base_calc_1',
    );
    const baseCalc2 = result.compiledTableCalculations.find(
        (c) => c.name === 'base_calc_2',
    );
    const combinedCalc = result.compiledTableCalculations.find(
        (c) => c.name === 'combined_calc',
    );

    // Both base calculations should have CTEs since they're referenced
    expect(baseCalc1?.compiledSql).toBe('"table_3_metric_1" + 10');

    expect(baseCalc2?.compiledSql).toBe('"table_3_metric_1" * 2');

    // Combined calc should reference both from the most recent CTE that contains them
    expect(combinedCalc?.compiledSql).toBe('"base_calc_1" + "base_calc_2"');
});

test('Should compile table calculations that reference custom dimensions', () => {
    const metricQueryWithCustomDimension = {
        ...METRIC_QUERY_VALID_REFERENCES,
        dimensions: [
            ...METRIC_QUERY_VALID_REFERENCES.dimensions,
            'custom_dim_1',
        ],
        customDimensions: [
            {
                id: 'custom_dim_1',
                name: 'Custom Dim 1',
                table: 'table1',
                type: CustomDimensionType.SQL,
                sql: 'LENGTH("table1"."dim_1")', // Use direct SQL that doesn't need field resolution
                dimensionType: DimensionType.NUMBER,
            } as const,
        ],
        tableCalculations: [
            {
                name: 'calc_with_custom_dim',
                displayName: 'Calc with Custom Dimension',
                sql: '${custom_dim_1} * 2',
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithCustomDimension,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const calcWithCustomDim = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_with_custom_dim',
    );

    // Should successfully reference the custom dimension by its id
    expect(calcWithCustomDim?.compiledSql).toBe('"custom_dim_1" * 2');
});

test('Should compile table calculations that reference additional metrics', () => {
    const metricQueryWithAdditionalMetric = {
        ...METRIC_QUERY_VALID_REFERENCES,
        metrics: [
            ...METRIC_QUERY_VALID_REFERENCES.metrics,
            'table1_custom_metric_1',
        ],
        additionalMetrics: [
            {
                name: 'custom_metric_1',
                table: 'table1',
                type: MetricType.SUM,
                sql: '${TABLE}.dim_1', // Use the existing dimension from mock
            },
        ],
        tableCalculations: [
            {
                name: 'calc_with_custom_metric',
                displayName: 'Calc with Custom Metric',
                sql: '${table1_custom_metric_1} + 100',
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithAdditionalMetric,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const calcWithCustomMetric = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_with_custom_metric',
    );

    // Should successfully reference the additional metric using table_name format
    expect(calcWithCustomMetric?.compiledSql).toBe(
        '"table1_custom_metric_1" + 100',
    );
});

test('Should compile table calculations that reference both custom dimensions and additional metrics', () => {
    const metricQueryWithBoth = {
        ...METRIC_QUERY_VALID_REFERENCES,
        dimensions: [...METRIC_QUERY_VALID_REFERENCES.dimensions, 'age_range'],
        metrics: [
            ...METRIC_QUERY_VALID_REFERENCES.metrics,
            'table1_custom_count',
        ],
        customDimensions: [
            {
                id: 'age_range',
                name: 'Age Range',
                table: 'table1',
                type: CustomDimensionType.SQL,
                sql: 'CASE WHEN LENGTH("table1"."dim_1") < 5 THEN \'Young\' ELSE \'Old\' END', // Use direct SQL
                dimensionType: DimensionType.STRING,
            } as const,
        ],
        additionalMetrics: [
            {
                name: 'custom_count',
                table: 'table1',
                type: MetricType.COUNT,
                sql: '${TABLE}.dim_1', // Use existing dimension
            },
        ],
        tableCalculations: [
            {
                name: 'combined_calc',
                displayName: 'Combined Calc',
                sql: "CASE WHEN ${age_range} = 'Young' THEN ${table1_custom_count} * 2 ELSE ${table1_custom_count} END",
            },
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithBoth,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const combinedCalc = result.compiledTableCalculations.find(
        (c) => c.name === 'combined_calc',
    );

    // Should successfully reference both custom dimension and additional metric
    expect(combinedCalc?.compiledSql).toBe(
        'CASE WHEN "age_range" = \'Young\' THEN "table1_custom_count" * 2 ELSE "table1_custom_count" END',
    );
});

test('Should compile PERCENT_OF_COLUMN_TOTAL template with partitionBy', () => {
    const metricQueryWithPartitionBy = {
        ...METRIC_QUERY_VALID_REFERENCES,
        dimensions: ['table1_dim_1', 'table3_dim_3'],
        tableCalculations: [
            {
                name: 'percent_by_category',
                displayName: 'Percent by Category',
                template: {
                    type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                    fieldId: 'table_3_metric_1',
                    partitionBy: ['table1_dim_1'],
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithPartitionBy,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const percentByCategory = result.compiledTableCalculations.find(
        (c) => c.name === 'percent_by_category',
    );

    // Should generate SQL with PARTITION BY clause
    expect(percentByCategory?.compiledSql).toBe(
        '(CAST("table_3_metric_1" AS FLOAT) / CAST(NULLIF(SUM("table_3_metric_1") OVER(PARTITION BY "table1_dim_1"), 0) AS FLOAT))',
    );

    // dependsOn only tracks dependencies on OTHER table calculations, not fields
    expect(percentByCategory?.dependsOn).toEqual([]);
});

test('Should compile PERCENT_OF_COLUMN_TOTAL template without partitionBy', () => {
    const metricQueryWithoutPartitionBy = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'percent_of_total',
                displayName: 'Percent of Total',
                template: {
                    type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                    fieldId: 'table_3_metric_1',
                    partitionBy: [],
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithoutPartitionBy,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const percentOfTotal = result.compiledTableCalculations.find(
        (c) => c.name === 'percent_of_total',
    );

    // Should generate SQL without PARTITION BY clause
    expect(percentOfTotal?.compiledSql).toBe(
        '(CAST("table_3_metric_1" AS FLOAT) / CAST(NULLIF(SUM("table_3_metric_1") OVER(), 0) AS FLOAT))',
    );
});

test('Should compile WINDOW_FUNCTION template with ROW_NUMBER', () => {
    const metricQueryWithRowNumber = {
        ...METRIC_QUERY_VALID_REFERENCES,
        dimensions: ['table1_dim_1'],
        tableCalculations: [
            {
                name: 'row_num',
                displayName: 'Row Number',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.ROW_NUMBER,
                    fieldId: null,
                    orderBy: [
                        {
                            fieldId: 'table1_dim_1',
                            order: 'asc',
                        },
                    ],
                    partitionBy: [],
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithRowNumber,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const rowNum = result.compiledTableCalculations.find(
        (c) => c.name === 'row_num',
    );

    // Should generate ROW_NUMBER() with ORDER BY
    expect(rowNum?.compiledSql).toBe(
        'ROW_NUMBER() OVER (ORDER BY "table1_dim_1" ASC)',
    );
});

test('Should compile WINDOW_FUNCTION template with PERCENT_RANK and partitionBy', () => {
    const metricQueryWithPercentRank = {
        ...METRIC_QUERY_VALID_REFERENCES,
        dimensions: ['table1_dim_1', 'table3_dim_3'],
        tableCalculations: [
            {
                name: 'rank_by_category',
                displayName: 'Rank by Category',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.PERCENT_RANK,
                    orderBy: [
                        {
                            fieldId: 'table_3_metric_1',
                            order: 'desc',
                        },
                    ],
                    partitionBy: ['table1_dim_1'],
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithPercentRank,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const rankByCategory = result.compiledTableCalculations.find(
        (c) => c.name === 'rank_by_category',
    );

    // Should generate PERCENT_RANK() with PARTITION BY and ORDER BY
    expect(rankByCategory?.compiledSql).toBe(
        'PERCENT_RANK() OVER (PARTITION BY "table1_dim_1" ORDER BY "table_3_metric_1" DESC)',
    );
});

test('Should compile WINDOW_FUNCTION template without orderBy or partitionBy', () => {
    const metricQueryMinimal = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'simple_row_num',
                displayName: 'Simple Row Number',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.ROW_NUMBER,
                    fieldId: null,
                    orderBy: [],
                    partitionBy: [],
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryMinimal,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const simpleRowNum = result.compiledTableCalculations.find(
        (c) => c.name === 'simple_row_num',
    );

    // Should generate window function with empty OVER clause
    expect(simpleRowNum?.compiledSql).toBe('ROW_NUMBER() OVER ()');
});

test('Should compile WINDOW_FUNCTION template with frame clause for running total', () => {
    const metricQueryWithFrame = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'running_total',
                displayName: 'Running Total',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.SUM,
                    fieldId: 'table_3_metric_1',
                    orderBy: [{ fieldId: 'table1_dim_1', order: 'asc' }],
                    partitionBy: [],
                    frame: {
                        frameType: 'rows',
                        start: {
                            type: 'unbounded_preceding',
                        },
                        end: {
                            type: 'current_row',
                        },
                    },
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithFrame,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const runningTotal = result.compiledTableCalculations.find(
        (c) => c.name === 'running_total',
    );

    expect(runningTotal?.compiledSql).toBe(
        'SUM("table_3_metric_1") OVER (ORDER BY "table1_dim_1" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
    );
});

test('Should compile WINDOW_FUNCTION template with frame clause for 7-day moving average', () => {
    const metricQueryWithMovingAvg = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'moving_avg_7d',
                displayName: '7-Day Moving Average',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.AVG,
                    fieldId: 'table_3_metric_1',
                    orderBy: [{ fieldId: 'table1_dim_1', order: 'asc' }],
                    partitionBy: [],
                    frame: {
                        frameType: 'rows',
                        start: {
                            type: 'preceding',
                            offset: 6,
                        },
                        end: {
                            type: 'current_row',
                        },
                    },
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithMovingAvg,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const movingAvg = result.compiledTableCalculations.find(
        (c) => c.name === 'moving_avg_7d',
    );

    expect(movingAvg?.compiledSql).toBe(
        'AVG("table_3_metric_1") OVER (ORDER BY "table1_dim_1" ASC ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)',
    );
});

test('Should compile WINDOW_FUNCTION template with frame clause and partitionBy', () => {
    const metricQueryWithFrameAndPartition = {
        ...METRIC_QUERY_VALID_REFERENCES,
        dimensions: ['table1_dim_1', 'table_2_dim_2'],
        tableCalculations: [
            {
                name: 'partitioned_avg',
                displayName: 'Partitioned Moving Average',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.AVG,
                    fieldId: 'table_3_metric_1',
                    orderBy: [{ fieldId: 'table1_dim_1', order: 'asc' }],
                    partitionBy: ['table_2_dim_2'],
                    frame: {
                        frameType: 'rows',
                        start: {
                            type: 'preceding',
                            offset: 2,
                        },
                        end: {
                            type: 'following',
                            offset: 2,
                        },
                    },
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithFrameAndPartition,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const partitionedAvg = result.compiledTableCalculations.find(
        (c) => c.name === 'partitioned_avg',
    );

    expect(partitionedAvg?.compiledSql).toBe(
        'AVG("table_3_metric_1") OVER (PARTITION BY "table_2_dim_2" ORDER BY "table1_dim_1" ASC ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING)',
    );
});

test('Should compile WINDOW_FUNCTION template with single boundary frame syntax', () => {
    const metricQueryWithSingleBoundary = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'trailing_sum',
                displayName: 'Trailing Sum',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.SUM,
                    fieldId: 'table_3_metric_1',
                    orderBy: [{ fieldId: 'table1_dim_1', order: 'asc' }],
                    partitionBy: [],
                    frame: {
                        frameType: 'rows',
                        end: {
                            type: 'preceding',
                            offset: 3,
                        },
                    },
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithSingleBoundary,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const trailingSum = result.compiledTableCalculations.find(
        (c) => c.name === 'trailing_sum',
    );

    expect(trailingSum?.compiledSql).toBe(
        'SUM("table_3_metric_1") OVER (ORDER BY "table1_dim_1" ASC ROWS 3 PRECEDING)',
    );
});

test('Should compile WINDOW_FUNCTION template with RANGE frame type', () => {
    const metricQueryWithRange = {
        ...METRIC_QUERY_VALID_REFERENCES,
        tableCalculations: [
            {
                name: 'range_sum',
                displayName: 'Range Sum',
                template: {
                    type: TableCalculationTemplateType.WINDOW_FUNCTION,
                    windowFunction: WindowFunctionType.SUM,
                    fieldId: 'table_3_metric_1',
                    orderBy: [{ fieldId: 'table1_dim_1', order: 'asc' }],
                    partitionBy: [],
                    frame: {
                        frameType: 'range',
                        start: {
                            type: 'unbounded_preceding',
                        },
                        end: {
                            type: 'current_row',
                        },
                    },
                },
            } as TableCalculation,
        ],
    };

    const result = compileMetricQuery({
        explore: EXPLORE,
        metricQuery: metricQueryWithRange,
        warehouseSqlBuilder: warehouseClientMock,
        availableParameters: [],
    });

    const rangeSum = result.compiledTableCalculations.find(
        (c) => c.name === 'range_sum',
    );

    expect(rangeSum?.compiledSql).toBe(
        'SUM("table_3_metric_1") OVER (ORDER BY "table1_dim_1" ASC RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
    );
});
