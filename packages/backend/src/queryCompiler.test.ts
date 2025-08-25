import { CompiledMetricQuery, CompileError } from '@lightdash/common';
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

test('Should compile table calculations with references to other table calculations', () => {
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

    // Check that calc_a was compiled correctly
    const calcA = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_a',
    );
    expect(calcA?.compiledSql).toBe('"table_3_metric_1" + 70');

    // Check that calc_b references calc_a with parentheses
    const calcB = result.compiledTableCalculations.find(
        (c) => c.name === 'calc_b',
    );
    expect(calcB?.compiledSql).toBe('("table_3_metric_1" + 70) * 2');
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

test('Should handle complex dependency chains', () => {
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

    // Check that all calculations are properly compiled in dependency order
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
    expect(calcC?.compiledSql).toBe(
        '(("table_3_metric_1" + 70) + ("table_3_metric_1" * 1.5)) / 2',
    );
});
